const express = require('express');
const pool = require('../db.cjs');

const router = express.Router();

// GET /api/tasks — list all task templates for user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows: tasks } = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC', [userId]
    );

    // Attach subtasks to each task
    const tasksWithSubtasks = [];
    for (const task of tasks) {
      const { rows: subtasks } = await pool.query(
        'SELECT * FROM subtasks WHERE task_id = $1 ORDER BY sort_order ASC', [task.id]
      );
      tasksWithSubtasks.push({
        ...task,
        recurrence_days: task.recurrence_days ? JSON.parse(task.recurrence_days) : null,
        subtasks,
      });
    }

    res.json({ tasks: tasksWithSubtasks });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks — create task with optional subtasks
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, duration, goal_category, recurrence_type, recurrence_days, carry_over, subtasks, task_type, scheduled_time } = req.body;

    if (!name || !goal_category) {
      return res.status(400).json({ error: 'Name and goal_category are required' });
    }

    const taskType = task_type || 'timed';
    const taskDuration = taskType === 'goal' ? (duration || 0) : (taskType === 'scheduled' ? (duration || 0) : (duration || 30));
    const recType = recurrence_type || 'one-time';
    const recDays = recurrence_days ? JSON.stringify(recurrence_days) : null;
    const carryOver = carry_over ? 1 : 0;
    const schedTime = taskType === 'scheduled' ? (scheduled_time || null) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: taskRows } = await client.query(
        `INSERT INTO tasks (user_id, name, duration, goal_category, recurrence_type, recurrence_days, carry_over, task_type, scheduled_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [userId, name, taskDuration, goal_category, recType, recDays, carryOver, taskType, schedTime]
      );
      const taskId = taskRows[0].id;

      if (subtasks && Array.isArray(subtasks)) {
        for (let i = 0; i < subtasks.length; i++) {
          const sub = subtasks[i];
          await client.query(
            'INSERT INTO subtasks (task_id, name, sort_order) VALUES ($1, $2, $3)',
            [taskId, sub.name || sub, i]
          );
        }
      }

      await client.query('COMMIT');

      const { rows: [task] } = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      const { rows: taskSubtasks } = await pool.query(
        'SELECT * FROM subtasks WHERE task_id = $1 ORDER BY sort_order ASC', [taskId]
      );

      res.status(201).json({
        task: {
          ...task,
          recurrence_days: task.recurrence_days ? JSON.parse(task.recurrence_days) : null,
          subtasks: taskSubtasks,
        },
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tasks/:id — update task (including subtasks)
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;
    const { name, duration, goal_category, recurrence_type, recurrence_days, carry_over, subtasks: newSubtasks, task_type, scheduled_time } = req.body;

    const { rows: [existing] } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updatedName = name !== undefined ? name : existing.name;
    const updatedCategory = goal_category !== undefined ? goal_category : existing.goal_category;
    const updatedRecType = recurrence_type !== undefined ? recurrence_type : existing.recurrence_type;
    const updatedRecDays = recurrence_days !== undefined ? JSON.stringify(recurrence_days) : existing.recurrence_days;
    const updatedCarryOver = carry_over !== undefined ? (carry_over ? 1 : 0) : existing.carry_over;
    const updatedTaskType = task_type !== undefined ? task_type : existing.task_type;
    const finalDuration = updatedTaskType === 'goal' ? (duration || 0) : (updatedTaskType === 'scheduled' ? (duration || 0) : (duration !== undefined ? duration : existing.duration));
    const updatedScheduledTime = scheduled_time !== undefined ? scheduled_time : existing.scheduled_time;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE tasks SET name = $1, duration = $2, goal_category = $3, recurrence_type = $4, recurrence_days = $5, carry_over = $6, task_type = $7, scheduled_time = $8
         WHERE id = $9`,
        [updatedName, finalDuration, updatedCategory, updatedRecType, updatedRecDays, updatedCarryOver, updatedTaskType, updatedScheduledTime, taskId]
      );

      if (newSubtasks !== undefined && Array.isArray(newSubtasks)) {
        await client.query('DELETE FROM subtasks WHERE task_id = $1', [taskId]);
        for (let i = 0; i < newSubtasks.length; i++) {
          const sub = newSubtasks[i];
          const subName = typeof sub === 'string' ? sub : (sub.name || sub.title || '');
          if (subName.trim()) {
            await client.query(
              'INSERT INTO subtasks (task_id, name, sort_order) VALUES ($1, $2, $3)',
              [taskId, subName.trim(), i]
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

    const { rows: [task] } = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    const { rows: subtasks } = await pool.query('SELECT * FROM subtasks WHERE task_id = $1 ORDER BY sort_order ASC', [taskId]);

    res.json({
      task: {
        ...task,
        recurrence_days: task.recurrence_days ? JSON.parse(task.recurrence_days) : null,
        subtasks,
      },
    });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;
    const { rows: [existing] } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id/subtasks
router.get('/:id/subtasks', async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;
    const { rows: [task] } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const { rows: subtasks } = await pool.query('SELECT * FROM subtasks WHERE task_id = $1 ORDER BY sort_order ASC', [taskId]);
    res.json({ subtasks });
  } catch (err) {
    console.error('Get subtasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/subtasks
router.post('/:id/subtasks', async (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;
    const { name } = req.body;

    const { rows: [task] } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Subtask name is required' });
    }

    const { rows: [maxOrder] } = await pool.query('SELECT MAX(sort_order) as max_order FROM subtasks WHERE task_id = $1', [taskId]);
    const sortOrder = (maxOrder.max_order || 0) + 1;

    const { rows: [subtask] } = await pool.query(
      'INSERT INTO subtasks (task_id, name, sort_order) VALUES ($1, $2, $3) RETURNING *',
      [taskId, name, sortOrder]
    );
    res.status(201).json({ subtask });
  } catch (err) {
    console.error('Create subtask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/subtasks/:id
router.put('/subtasks/:id', async (req, res) => {
  try {
    const subtaskId = req.params.id;
    const userId = req.user.id;
    const { name, sort_order } = req.body;

    const { rows: [subtask] } = await pool.query(
      'SELECT s.* FROM subtasks s JOIN tasks t ON s.task_id = t.id WHERE s.id = $1 AND t.user_id = $2',
      [subtaskId, userId]
    );
    if (!subtask) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const updatedName = name !== undefined ? name : subtask.name;
    const updatedOrder = sort_order !== undefined ? sort_order : subtask.sort_order;

    await pool.query('UPDATE subtasks SET name = $1, sort_order = $2 WHERE id = $3', [updatedName, updatedOrder, subtaskId]);
    const { rows: [updated] } = await pool.query('SELECT * FROM subtasks WHERE id = $1', [subtaskId]);
    res.json({ subtask: updated });
  } catch (err) {
    console.error('Update subtask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/subtasks/:id
router.delete('/subtasks/:id', async (req, res) => {
  try {
    const subtaskId = req.params.id;
    const userId = req.user.id;
    const { rows: [subtask] } = await pool.query(
      'SELECT s.* FROM subtasks s JOIN tasks t ON s.task_id = t.id WHERE s.id = $1 AND t.user_id = $2',
      [subtaskId, userId]
    );
    if (!subtask) {
      return res.status(404).json({ error: 'Subtask not found' });
    }
    await pool.query('DELETE FROM subtasks WHERE id = $1', [subtaskId]);
    res.json({ message: 'Subtask deleted successfully' });
  } catch (err) {
    console.error('Delete subtask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
