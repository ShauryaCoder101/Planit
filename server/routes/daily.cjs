const express = require('express');
const db = require('../db.cjs');

const router = express.Router();

/**
 * Generate daily tasks for a given date if they don't already exist.
 * Handles recurring tasks (matching day-of-week), one-time tasks (on creation date),
 * and carry-over of incomplete tasks from the previous day.
 */
function generateDailyTasks(userId, date) {
  // Check if daily tasks already exist for this date
  const existing = db.prepare('SELECT COUNT(*) as count FROM daily_tasks WHERE user_id = ? AND date = ?').get(userId, date);
  if (existing.count > 0) {
    return; // Already generated
  }

  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay(); // 0=Sunday, 6=Saturday

  // Get all task templates for this user
  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(userId);

  const insertDailyTask = db.prepare(`
    INSERT INTO daily_tasks (task_id, user_id, date, status, actual_duration, is_carried_over, carried_from)
    VALUES (?, ?, ?, 'pending', 0, ?, ?)
  `);

  const insertDailySubtask = db.prepare(`
    INSERT INTO daily_subtasks (daily_task_id, subtask_id, completed) VALUES (?, ?, 0)
  `);

  const getSubtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC');

  const generateTransaction = db.transaction(() => {
    // 1. Generate from task templates
    for (const task of tasks) {
      let shouldGenerate = false;

      if (task.recurrence_type === 'recurring' && task.recurrence_days) {
        // Recurring task — check if today's day-of-week matches
        const days = JSON.parse(task.recurrence_days);
        if (Array.isArray(days) && days.includes(dayOfWeek)) {
          shouldGenerate = true;
        }
      } else if (task.recurrence_type === 'one-time') {
        // One-time task — only generate on the creation date
        const createdDate = task.created_at ? task.created_at.split('T')[0].split(' ')[0] : null;
        if (createdDate === date) {
          shouldGenerate = true;
        }
      }

      if (shouldGenerate) {
        const result = insertDailyTask.run(task.id, userId, date, 0, null);
        const dailyTaskId = result.lastInsertRowid;

        // Create daily subtasks
        const subtasks = getSubtasks.all(task.id);
        for (const sub of subtasks) {
          insertDailySubtask.run(dailyTaskId, sub.id);
        }
      }
    }

    // 2. Carry over incomplete tasks from the previous day
    const prevDate = new Date(dateObj);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const incompleteTasks = db.prepare(`
      SELECT dt.*, t.carry_over FROM daily_tasks dt
      JOIN tasks t ON dt.task_id = t.id
      WHERE dt.user_id = ? AND dt.date = ? AND dt.status != 'completed' AND t.carry_over = 1
    `).all(userId, prevDateStr);

    for (const incompleteTask of incompleteTasks) {
      // Check if this task is already generated for today (from the template step)
      const alreadyExists = db.prepare(
        'SELECT id FROM daily_tasks WHERE task_id = ? AND user_id = ? AND date = ?'
      ).get(incompleteTask.task_id, userId, date);

      if (!alreadyExists) {
        const carriedFrom = incompleteTask.carried_from || prevDateStr;
        const result = insertDailyTask.run(incompleteTask.task_id, userId, date, 1, carriedFrom);
        const dailyTaskId = result.lastInsertRowid;

        // Create daily subtasks for carried-over task
        const subtasks = getSubtasks.all(incompleteTask.task_id);
        for (const sub of subtasks) {
          insertDailySubtask.run(dailyTaskId, sub.id);
        }
      }
    }
  });

  generateTransaction();
}

// GET /api/daily?date=YYYY-MM-DD — get daily tasks for date
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const date = req.query.date;

    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
    }

    // Auto-generate daily tasks if needed
    generateDailyTasks(userId, date);

    // Fetch all daily tasks for this date with task template info
    const dailyTasks = db.prepare(`
      SELECT dt.*, t.name, t.duration, t.goal_category, t.recurrence_type, t.recurrence_days, t.carry_over, t.task_type
      FROM daily_tasks dt
      JOIN tasks t ON dt.task_id = t.id
      WHERE dt.user_id = ? AND dt.date = ?
      ORDER BY dt.is_carried_over DESC, t.goal_category ASC, t.name ASC
    `).all(userId, date);

    // Attach daily subtasks to each daily task
    const getDailySubtasks = db.prepare(`
      SELECT ds.*, s.name, s.sort_order
      FROM daily_subtasks ds
      JOIN subtasks s ON ds.subtask_id = s.id
      WHERE ds.daily_task_id = ?
      ORDER BY s.sort_order ASC
    `);

    const tasksWithSubtasks = dailyTasks.map(dt => ({
      ...dt,
      recurrence_days: dt.recurrence_days ? JSON.parse(dt.recurrence_days) : null,
      subtasks: getDailySubtasks.all(dt.id),
    }));

    res.json({ daily_tasks: tasksWithSubtasks });
  } catch (err) {
    console.error('Get daily tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/daily/:id — update daily task status
router.put('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const dailyTaskId = req.params.id;
    const { status, actual_duration } = req.body;

    const existing = db.prepare('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?').get(dailyTaskId, userId);
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
    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }

    if (setClauses.length > 0) {
      values.push(dailyTaskId);
      db.prepare(`UPDATE daily_tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare(`
      SELECT dt.*, t.name, t.duration, t.goal_category, t.recurrence_type, t.carry_over, t.task_type
      FROM daily_tasks dt
      JOIN tasks t ON dt.task_id = t.id
      WHERE dt.id = ?
    `).get(dailyTaskId);

    const subtasks = db.prepare(`
      SELECT ds.*, s.name, s.sort_order
      FROM daily_subtasks ds
      JOIN subtasks s ON ds.subtask_id = s.id
      WHERE ds.daily_task_id = ?
      ORDER BY s.sort_order ASC
    `).all(dailyTaskId);

    res.json({ daily_task: { ...updated, subtasks } });
  } catch (err) {
    console.error('Update daily task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/daily/:id/subtasks/:subtaskId — toggle subtask completion
router.put('/:id/subtasks/:subtaskId', (req, res) => {
  try {
    const userId = req.user.id;
    const dailyTaskId = req.params.id;
    const dailySubtaskId = req.params.subtaskId;

    // Verify ownership
    const dailyTask = db.prepare('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?').get(dailyTaskId, userId);
    if (!dailyTask) {
      return res.status(404).json({ error: 'Daily task not found' });
    }

    const dailySubtask = db.prepare('SELECT * FROM daily_subtasks WHERE id = ? AND daily_task_id = ?').get(dailySubtaskId, dailyTaskId);
    if (!dailySubtask) {
      return res.status(404).json({ error: 'Daily subtask not found' });
    }

    // Toggle completion
    const newCompleted = dailySubtask.completed ? 0 : 1;
    db.prepare('UPDATE daily_subtasks SET completed = ? WHERE id = ?').run(newCompleted, dailySubtaskId);

    const updated = db.prepare(`
      SELECT ds.*, s.name, s.sort_order
      FROM daily_subtasks ds
      JOIN subtasks s ON ds.subtask_id = s.id
      WHERE ds.id = ?
    `).get(dailySubtaskId);

    res.json({ daily_subtask: updated });
  } catch (err) {
    console.error('Toggle subtask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/daily/:id/complete — mark as completed with actual duration
router.post('/:id/complete', (req, res) => {
  try {
    const userId = req.user.id;
    const dailyTaskId = req.params.id;
    const { actual_duration } = req.body;

    const existing = db.prepare('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?').get(dailyTaskId, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Daily task not found' });
    }

    const now = new Date().toISOString();
    const duration = actual_duration !== undefined ? actual_duration : existing.actual_duration;

    db.prepare(`
      UPDATE daily_tasks SET status = 'completed', actual_duration = ?, completed_at = ?
      WHERE id = ?
    `).run(duration, now, dailyTaskId);

    // Also mark all subtasks as completed
    db.prepare('UPDATE daily_subtasks SET completed = 1 WHERE daily_task_id = ?').run(dailyTaskId);

    // End any active timer sessions
    db.prepare(`
      UPDATE timer_sessions SET is_active = 0, end_time = ?
      WHERE daily_task_id = ? AND is_active = 1
    `).run(now, dailyTaskId);

    const updated = db.prepare(`
      SELECT dt.*, t.name, t.duration, t.goal_category, t.recurrence_type, t.carry_over, t.task_type
      FROM daily_tasks dt
      JOIN tasks t ON dt.task_id = t.id
      WHERE dt.id = ?
    `).get(dailyTaskId);

    const subtasks = db.prepare(`
      SELECT ds.*, s.name, s.sort_order
      FROM daily_subtasks ds
      JOIN subtasks s ON ds.subtask_id = s.id
      WHERE ds.daily_task_id = ?
      ORDER BY s.sort_order ASC
    `).all(dailyTaskId);

    res.json({ daily_task: { ...updated, subtasks } });
  } catch (err) {
    console.error('Complete daily task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
