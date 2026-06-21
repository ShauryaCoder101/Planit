const express = require('express');
const db = require('../db.cjs');

const router = express.Router();

// POST /api/timer/start — start timer for a daily task
router.post('/start', (req, res) => {
  try {
    const userId = req.user.id;
    const { daily_task_id } = req.body;

    if (!daily_task_id) {
      return res.status(400).json({ error: 'daily_task_id is required' });
    }

    // Verify ownership
    const dailyTask = db.prepare('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?').get(daily_task_id, userId);
    if (!dailyTask) {
      return res.status(404).json({ error: 'Daily task not found' });
    }

    // Check for any active timer for this user (across all daily tasks)
    const activeTimer = db.prepare(`
      SELECT ts.* FROM timer_sessions ts
      JOIN daily_tasks dt ON ts.daily_task_id = dt.id
      WHERE dt.user_id = ? AND ts.is_active = 1
    `).get(userId);

    if (activeTimer) {
      return res.status(409).json({ error: 'Another timer is already active. Stop it first.', active_timer: activeTimer });
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO timer_sessions (daily_task_id, start_time, is_active, total_paused_ms)
      VALUES (?, ?, 1, 0)
    `).run(daily_task_id, now);

    // Update daily task status to in-progress
    if (dailyTask.status === 'pending') {
      db.prepare("UPDATE daily_tasks SET status = 'in-progress', started_at = ? WHERE id = ?").run(now, daily_task_id);
    }

    const session = db.prepare('SELECT * FROM timer_sessions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ timer_session: session });
  } catch (err) {
    console.error('Start timer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/timer/pause — pause active timer
router.post('/pause', (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id } = req.body;

    let session;
    if (session_id) {
      session = db.prepare(`
        SELECT ts.* FROM timer_sessions ts
        JOIN daily_tasks dt ON ts.daily_task_id = dt.id
        WHERE ts.id = ? AND dt.user_id = ? AND ts.is_active = 1
      `).get(session_id, userId);
    } else {
      // Find the active session for this user
      session = db.prepare(`
        SELECT ts.* FROM timer_sessions ts
        JOIN daily_tasks dt ON ts.daily_task_id = dt.id
        WHERE dt.user_id = ? AND ts.is_active = 1 AND ts.paused_at IS NULL
      `).get(userId);
    }

    if (!session) {
      return res.status(404).json({ error: 'No active running timer found' });
    }

    if (session.paused_at) {
      return res.status(400).json({ error: 'Timer is already paused' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE timer_sessions SET paused_at = ? WHERE id = ?').run(now, session.id);

    const updated = db.prepare('SELECT * FROM timer_sessions WHERE id = ?').get(session.id);
    res.json({ timer_session: updated });
  } catch (err) {
    console.error('Pause timer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/timer/resume — resume paused timer
router.post('/resume', (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id } = req.body;

    let session;
    if (session_id) {
      session = db.prepare(`
        SELECT ts.* FROM timer_sessions ts
        JOIN daily_tasks dt ON ts.daily_task_id = dt.id
        WHERE ts.id = ? AND dt.user_id = ? AND ts.is_active = 1
      `).get(session_id, userId);
    } else {
      // Find the paused session for this user
      session = db.prepare(`
        SELECT ts.* FROM timer_sessions ts
        JOIN daily_tasks dt ON ts.daily_task_id = dt.id
        WHERE dt.user_id = ? AND ts.is_active = 1 AND ts.paused_at IS NOT NULL
      `).get(userId);
    }

    if (!session) {
      return res.status(404).json({ error: 'No paused timer found' });
    }

    if (!session.paused_at) {
      return res.status(400).json({ error: 'Timer is not paused' });
    }

    // Calculate paused duration and add to total
    const pausedAt = new Date(session.paused_at).getTime();
    const now = Date.now();
    const pausedMs = now - pausedAt;
    const newTotalPaused = (session.total_paused_ms || 0) + pausedMs;

    db.prepare('UPDATE timer_sessions SET paused_at = NULL, total_paused_ms = ? WHERE id = ?').run(newTotalPaused, session.id);

    const updated = db.prepare('SELECT * FROM timer_sessions WHERE id = ?').get(session.id);
    res.json({ timer_session: updated });
  } catch (err) {
    console.error('Resume timer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/timer/finish — finish timer, calculate actual duration, update daily task
router.post('/finish', (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id } = req.body;

    let session;
    if (session_id) {
      session = db.prepare(`
        SELECT ts.* FROM timer_sessions ts
        JOIN daily_tasks dt ON ts.daily_task_id = dt.id
        WHERE ts.id = ? AND dt.user_id = ? AND ts.is_active = 1
      `).get(session_id, userId);
    } else {
      // Find any active session for this user
      session = db.prepare(`
        SELECT ts.* FROM timer_sessions ts
        JOIN daily_tasks dt ON ts.daily_task_id = dt.id
        WHERE dt.user_id = ? AND ts.is_active = 1
      `).get(userId);
    }

    if (!session) {
      return res.status(404).json({ error: 'No active timer found' });
    }

    const now = new Date();
    const nowISO = now.toISOString();

    // If timer was paused, add the final paused duration
    let totalPausedMs = session.total_paused_ms || 0;
    if (session.paused_at) {
      const pausedAt = new Date(session.paused_at).getTime();
      totalPausedMs += now.getTime() - pausedAt;
    }

    // Calculate actual working duration in minutes
    const startTime = new Date(session.start_time).getTime();
    const totalElapsedMs = now.getTime() - startTime;
    const activeMs = totalElapsedMs - totalPausedMs;
    const actualMinutes = Math.round(activeMs / 60000);

    // Update timer session
    db.prepare(`
      UPDATE timer_sessions SET end_time = ?, is_active = 0, paused_at = NULL, total_paused_ms = ?
      WHERE id = ?
    `).run(nowISO, totalPausedMs, session.id);

    // Update daily task actual_duration (add to existing)
    const dailyTask = db.prepare('SELECT * FROM daily_tasks WHERE id = ?').get(session.daily_task_id);
    const newDuration = (dailyTask.actual_duration || 0) + actualMinutes;
    db.prepare('UPDATE daily_tasks SET actual_duration = ? WHERE id = ?').run(newDuration, session.daily_task_id);

    const updatedSession = db.prepare('SELECT * FROM timer_sessions WHERE id = ?').get(session.id);
    const updatedTask = db.prepare(`
      SELECT dt.*, t.name, t.duration, t.goal_category, t.task_type
      FROM daily_tasks dt
      JOIN tasks t ON dt.task_id = t.id
      WHERE dt.id = ?
    `).get(session.daily_task_id);

    res.json({
      timer_session: updatedSession,
      daily_task: updatedTask,
      actual_minutes: actualMinutes,
    });
  } catch (err) {
    console.error('Finish timer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/timer/active — get currently active timer session
router.get('/active', (req, res) => {
  try {
    const userId = req.user.id;

    const session = db.prepare(`
      SELECT ts.*, dt.task_id, dt.date, t.name as task_name, t.duration as estimated_duration, t.goal_category, t.task_type
      FROM timer_sessions ts
      JOIN daily_tasks dt ON ts.daily_task_id = dt.id
      JOIN tasks t ON dt.task_id = t.id
      WHERE dt.user_id = ? AND ts.is_active = 1
    `).get(userId);

    res.json({ timer_session: session || null });
  } catch (err) {
    console.error('Get active timer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
