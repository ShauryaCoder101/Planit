const express = require('express');
const pool = require('../db.cjs');

const router = express.Router();

/**
 * Generate daily tasks for a given date if they don't already exist.
 * Handles recurring tasks, one-time tasks, and carry-over.
 */
async function generateDailyTasks(userId, date) {
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();

  const { rows: tasks } = await pool.query('SELECT * FROM tasks WHERE user_id = $1', [userId]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Generate from task templates
    for (const task of tasks) {
      let shouldGenerate = false;

      if (task.recurrence_type === 'recurring' && task.recurrence_days) {
        const days = JSON.parse(task.recurrence_days);
        if (Array.isArray(days) && days.includes(dayOfWeek)) {
          shouldGenerate = true;
        }
      } else if (task.recurrence_type === 'one-time') {
        const createdDate = task.created_at ? String(task.created_at).split('T')[0].split(' ')[0] : null;
        if (createdDate === date) {
          shouldGenerate = true;
        }
      }

      if (shouldGenerate) {
        // Check if this specific task already has a daily entry for today
        const { rows: alreadyExists } = await client.query(
          'SELECT id FROM daily_tasks WHERE task_id = $1 AND user_id = $2 AND date = $3',
          [task.id, userId, date]
        );
        if (alreadyExists.length > 0) continue;

        const { rows: [inserted] } = await client.query(
          `INSERT INTO daily_tasks (task_id, user_id, date, status, actual_duration, is_carried_over, carried_from)
           VALUES ($1, $2, $3, 'pending', 0, $4, $5) RETURNING id`,
          [task.id, userId, date, 0, null]
        );
        const dailyTaskId = inserted.id;

        const { rows: subtasks } = await client.query(
          'SELECT * FROM subtasks WHERE task_id = $1 ORDER BY sort_order ASC', [task.id]
        );
        for (const sub of subtasks) {
          await client.query(
            'INSERT INTO daily_subtasks (daily_task_id, subtask_id, completed) VALUES ($1, $2, 0)',
            [dailyTaskId, sub.id]
          );
        }
      }
    }

    // 2. Carry over incomplete tasks from the previous day
    const prevDate = new Date(dateObj);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const { rows: incompleteTasks } = await client.query(
      `SELECT dt.*, t.carry_over FROM daily_tasks dt
       JOIN tasks t ON dt.task_id = t.id
       WHERE dt.user_id = $1 AND dt.date = $2 AND dt.status != 'completed' AND t.carry_over = 1`,
      [userId, prevDateStr]
    );

    for (const incompleteTask of incompleteTasks) {
      const { rows: alreadyExists } = await client.query(
        'SELECT id FROM daily_tasks WHERE task_id = $1 AND user_id = $2 AND date = $3',
        [incompleteTask.task_id, userId, date]
      );

      if (alreadyExists.length === 0) {
        const carriedFrom = incompleteTask.carried_from || prevDateStr;
        const { rows: [inserted] } = await client.query(
          `INSERT INTO daily_tasks (task_id, user_id, date, status, actual_duration, is_carried_over, carried_from)
           VALUES ($1, $2, $3, 'pending', 0, $4, $5) RETURNING id`,
          [incompleteTask.task_id, userId, date, 1, carriedFrom]
        );
        const dailyTaskId = inserted.id;

        const { rows: subtasks } = await client.query(
          'SELECT * FROM subtasks WHERE task_id = $1 ORDER BY sort_order ASC', [incompleteTask.task_id]
        );
        for (const sub of subtasks) {
          await client.query(
            'INSERT INTO daily_subtasks (daily_task_id, subtask_id, completed) VALUES ($1, $2, 0)',
            [dailyTaskId, sub.id]
          );
        }
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// GET /api/daily?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const date = req.query.date;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
    }

    await generateDailyTasks(userId, date);

    const { rows: dailyTasks } = await pool.query(
      `SELECT dt.*, t.name, t.duration, t.goal_category, t.recurrence_type, t.recurrence_days, t.carry_over, t.task_type, t.scheduled_time
       FROM daily_tasks dt
       JOIN tasks t ON dt.task_id = t.id
       WHERE dt.user_id = $1 AND dt.date = $2
       ORDER BY dt.is_carried_over DESC, t.scheduled_time ASC NULLS LAST, t.goal_category ASC, t.name ASC`,
      [userId, date]
    );

    const tasksWithSubtasks = [];
    for (const dt of dailyTasks) {
      const { rows: subtasks } = await pool.query(
        `SELECT ds.*, s.name, s.sort_order
         FROM daily_subtasks ds
         JOIN subtasks s ON ds.subtask_id = s.id
         WHERE ds.daily_task_id = $1
         ORDER BY s.sort_order ASC`,
        [dt.id]
      );
      tasksWithSubtasks.push({
        ...dt,
        recurrence_days: dt.recurrence_days ? JSON.parse(dt.recurrence_days) : null,
        subtasks,
      });
    }

    res.json({ daily_tasks: tasksWithSubtasks });
  } catch (err) {
    console.error('Get daily tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/daily/:id — update daily task status
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const dailyTaskId = req.params.id;
    const { status, actual_duration } = req.body;

    const { rows: [existing] } = await pool.query(
      'SELECT * FROM daily_tasks WHERE id = $1 AND user_id = $2', [dailyTaskId, userId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Daily task not found' });
    }

    const updates = {};
    if (status !== undefined) {
      updates.status = status;
      if (status === 'in-progress' && !existing.started_at) {
        updates.started_at = new Date().toISOString();
      }
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
      }
    }
    if (actual_duration !== undefined) {
      updates.actual_duration = actual_duration;
    }

    const setClauses = [];
    const values = [];
    let paramIdx = 1;
    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`${key} = $${paramIdx++}`);
      values.push(value);
    }

    if (setClauses.length > 0) {
      values.push(dailyTaskId);
      await pool.query(`UPDATE daily_tasks SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`, values);
    }

    const { rows: [updated] } = await pool.query(
      `SELECT dt.*, t.name, t.duration, t.goal_category, t.recurrence_type, t.carry_over, t.task_type
       FROM daily_tasks dt JOIN tasks t ON dt.task_id = t.id WHERE dt.id = $1`,
      [dailyTaskId]
    );

    const { rows: subtasks } = await pool.query(
      `SELECT ds.*, s.name, s.sort_order
       FROM daily_subtasks ds JOIN subtasks s ON ds.subtask_id = s.id
       WHERE ds.daily_task_id = $1 ORDER BY s.sort_order ASC`,
      [dailyTaskId]
    );

    res.json({ daily_task: { ...updated, subtasks } });
  } catch (err) {
    console.error('Update daily task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/daily/:id/subtasks/:subtaskId — toggle subtask completion
router.put('/:id/subtasks/:subtaskId', async (req, res) => {
  try {
    const userId = req.user.id;
    const dailyTaskId = req.params.id;
    const dailySubtaskId = req.params.subtaskId;

    const { rows: [dailyTask] } = await pool.query(
      'SELECT * FROM daily_tasks WHERE id = $1 AND user_id = $2', [dailyTaskId, userId]
    );
    if (!dailyTask) {
      return res.status(404).json({ error: 'Daily task not found' });
    }

    const { rows: [dailySubtask] } = await pool.query(
      'SELECT * FROM daily_subtasks WHERE id = $1 AND daily_task_id = $2', [dailySubtaskId, dailyTaskId]
    );
    if (!dailySubtask) {
      return res.status(404).json({ error: 'Daily subtask not found' });
    }

    const newCompleted = dailySubtask.completed ? 0 : 1;
    await pool.query('UPDATE daily_subtasks SET completed = $1 WHERE id = $2', [newCompleted, dailySubtaskId]);

    const { rows: [updated] } = await pool.query(
      `SELECT ds.*, s.name, s.sort_order
       FROM daily_subtasks ds JOIN subtasks s ON ds.subtask_id = s.id
       WHERE ds.id = $1`,
      [dailySubtaskId]
    );

    res.json({ daily_subtask: updated });
  } catch (err) {
    console.error('Toggle subtask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/daily/:id/complete
router.post('/:id/complete', async (req, res) => {
  try {
    const userId = req.user.id;
    const dailyTaskId = req.params.id;
    const { actual_duration } = req.body;

    const { rows: [existing] } = await pool.query(
      'SELECT * FROM daily_tasks WHERE id = $1 AND user_id = $2', [dailyTaskId, userId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Daily task not found' });
    }

    const now = new Date().toISOString();
    const duration = actual_duration !== undefined ? actual_duration : existing.actual_duration;

    await pool.query(
      `UPDATE daily_tasks SET status = 'completed', actual_duration = $1, completed_at = $2 WHERE id = $3`,
      [duration, now, dailyTaskId]
    );
    await pool.query('UPDATE daily_subtasks SET completed = 1 WHERE daily_task_id = $1', [dailyTaskId]);
    await pool.query(
      'UPDATE timer_sessions SET is_active = 0, end_time = $1 WHERE daily_task_id = $2 AND is_active = 1',
      [now, dailyTaskId]
    );

    const { rows: [updated] } = await pool.query(
      `SELECT dt.*, t.name, t.duration, t.goal_category, t.recurrence_type, t.carry_over, t.task_type
       FROM daily_tasks dt JOIN tasks t ON dt.task_id = t.id WHERE dt.id = $1`,
      [dailyTaskId]
    );

    const { rows: subtasks } = await pool.query(
      `SELECT ds.*, s.name, s.sort_order
       FROM daily_subtasks ds JOIN subtasks s ON ds.subtask_id = s.id
       WHERE ds.daily_task_id = $1 ORDER BY s.sort_order ASC`,
      [dailyTaskId]
    );

    res.json({ daily_task: { ...updated, subtasks } });
  } catch (err) {
    console.error('Complete daily task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
