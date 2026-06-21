const express = require('express');
const db = require('../db.cjs');

const router = express.Router();

// GET /api/tasks — list all task templates for user
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const tasks = db.prepare(`
      SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC
    `).all(userId);

    // Attach subtasks to each task
    const getSubtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC');
    const tasksWithSubtasks = tasks.map(task => ({
      ...task,
      recurrence_days: task.recurrence_days ? JSON.parse(task.recurrence_days) : null,
      subtasks: getSubtasks.all(task.id),
    }));

    res.json({ tasks: tasksWithSubtasks });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks — create task with optional subtasks
router.post('/', (req, res) => {
  try {
    const userId = req.user.id;
    const { name, duration, goal_category, recurrence_type, recurrence_days, carry_over, subtasks, task_type } = req.body;

    if (!name || !goal_category) {
      return res.status(400).json({ error: 'Name and goal_category are required' });
    }

    const taskType = task_type || 'timed';
    const taskDuration = taskType === 'goal' ? (duration || 0) : (duration || 30);
    const recType = recurrence_type || 'one-time';
    const recDays = recurrence_days ? JSON.stringify(recurrence_days) : null;
    const carryOver = carry_over ? 1 : 0;

    const insertTask = db.prepare(`
      INSERT INTO tasks (user_id, name, duration, goal_category, recurrence_type, recurrence_days, carry_over, task_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSubtask = db.prepare(`
      INSERT INTO subtasks (task_id, name, sort_order) VALUES (?, ?, ?)
    `);

    const createTaskTransaction = db.transaction(() => {
      const result = insertTask.run(userId, name, taskDuration, goal_category, recType, recDays, carryOver, taskType);
      const taskId = result.lastInsertRowid;

      if (subtasks && Array.isArray(subtasks)) {
        subtasks.forEach((sub, index) => {
          insertSubtask.run(taskId, sub.name || sub, index);
        });
      }

      return taskId;
    });

    const taskId = createTaskTransaction();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const taskSubtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC').all(taskId);

    res.status(201).json({
      task: {
        ...task,
        recurrence_days: task.recurrence_days ? JSON.parse(task.recurrence_days) : null,
        subtasks: taskSubtasks,
      },
    });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tasks/:id — update task (including subtasks)
router.put('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;
    const { name, duration, goal_category, recurrence_type, recurrence_days, carry_over, subtasks: newSubtasks, task_type } = req.body;

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updatedName = name !== undefined ? name : existing.name;
    const updatedDuration = duration !== undefined ? duration : existing.duration;
    const updatedCategory = goal_category !== undefined ? goal_category : existing.goal_category;
    const updatedRecType = recurrence_type !== undefined ? recurrence_type : existing.recurrence_type;
    const updatedRecDays = recurrence_days !== undefined ? JSON.stringify(recurrence_days) : existing.recurrence_days;
    const updatedCarryOver = carry_over !== undefined ? (carry_over ? 1 : 0) : existing.carry_over;
    const updatedTaskType = task_type !== undefined ? task_type : existing.task_type;
    const finalDuration = updatedTaskType === 'goal' ? (duration || 0) : (duration !== undefined ? duration : existing.duration);

    const updateTransaction = db.transaction(() => {
      db.prepare(`
        UPDATE tasks SET name = ?, duration = ?, goal_category = ?, recurrence_type = ?, recurrence_days = ?, carry_over = ?, task_type = ?
        WHERE id = ?
      `).run(updatedName, finalDuration, updatedCategory, updatedRecType, updatedRecDays, updatedCarryOver, updatedTaskType, taskId);

      // If subtasks were provided, replace all existing subtasks
      if (newSubtasks !== undefined && Array.isArray(newSubtasks)) {
        db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(taskId);
        const insertSubtask = db.prepare('INSERT INTO subtasks (task_id, name, sort_order) VALUES (?, ?, ?)');
        newSubtasks.forEach((sub, index) => {
          const subName = typeof sub === 'string' ? sub : (sub.name || sub.title || '');
          if (subName.trim()) {
            insertSubtask.run(taskId, subName.trim(), index);
          }
        });
      }
    });

    updateTransaction();

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC').all(taskId);

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

// DELETE /api/tasks/:id — delete task and its subtasks
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id/subtasks — get subtasks
router.get('/:id/subtasks', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC').all(taskId);
    res.json({ subtasks });
  } catch (err) {
    console.error('Get subtasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/subtasks — add subtask
router.post('/:id/subtasks', (req, res) => {
  try {
    const userId = req.user.id;
    const taskId = req.params.id;
    const { name } = req.body;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Subtask name is required' });
    }

    // Get max sort_order for this task
    const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM subtasks WHERE task_id = ?').get(taskId);
    const sortOrder = (maxOrder.max_order || 0) + 1;

    const result = db.prepare('INSERT INTO subtasks (task_id, name, sort_order) VALUES (?, ?, ?)').run(taskId, name, sortOrder);
    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ subtask });
  } catch (err) {
    console.error('Create subtask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/subtasks/:id — update subtask
router.put('/subtasks/:id', (req, res) => {
  try {
    const subtaskId = req.params.id;
    const userId = req.user.id;
    const { name, sort_order } = req.body;

    // Verify ownership through task
    const subtask = db.prepare(`
      SELECT s.* FROM subtasks s
      JOIN tasks t ON s.task_id = t.id
      WHERE s.id = ? AND t.user_id = ?
    `).get(subtaskId, userId);

    if (!subtask) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const updatedName = name !== undefined ? name : subtask.name;
    const updatedOrder = sort_order !== undefined ? sort_order : subtask.sort_order;

    db.prepare('UPDATE subtasks SET name = ?, sort_order = ? WHERE id = ?').run(updatedName, updatedOrder, subtaskId);

    const updated = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId);
    res.json({ subtask: updated });
  } catch (err) {
    console.error('Update subtask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/subtasks/:id — delete subtask
router.delete('/subtasks/:id', (req, res) => {
  try {
    const subtaskId = req.params.id;
    const userId = req.user.id;

    const subtask = db.prepare(`
      SELECT s.* FROM subtasks s
      JOIN tasks t ON s.task_id = t.id
      WHERE s.id = ? AND t.user_id = ?
    `).get(subtaskId, userId);

    if (!subtask) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    db.prepare('DELETE FROM subtasks WHERE id = ?').run(subtaskId);
    res.json({ message: 'Subtask deleted successfully' });
  } catch (err) {
    console.error('Delete subtask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
