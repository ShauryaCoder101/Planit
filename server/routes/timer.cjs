const express = require('express');
const pool = require('../db.cjs');

const router = express.Router();

// POST /api/timer/start
router.post('/start', async (req, res) => {
  try {
    const userId = req.user.id;
    const { daily_task_id } = req.body;
    if (!daily_task_id) {
      return res.status(400).json({ error: 'daily_task_id is required' });
    }

    const { rows: [dailyTask] } = await pool.query(
      'SELECT * FROM daily_tasks WHERE id = $1 AND user_id = $2', [daily_task_id, userId]
    );
    if (!dailyTask) {
      return res.status(404).json({ error: 'Daily task not found' });
    }

    const { rows: [activeTimer] } = await pool.query(
      `SELECT ts.* FROM timer_sessions ts
       JOIN daily_tasks dt ON ts.daily_task_id = dt.id
       WHERE dt.user_id = $1 AND ts.is_active = 1`, [userId]
    );
    if (activeTimer) {
      return res.status(409).json({ error: 'Another timer is already active. Stop it first.', active_timer: activeTimer });
    }

    const now = new Date().toISOString();
    const { rows: [session] } = await pool.query(
      `INSERT INTO timer_sessions (daily_task_id, start_time, is_active, total_paused_ms)
       VALUES ($1, $2, 1, 0) RETURNING *`,
      [daily_task_id, now]
    );

    if (dailyTask.status === 'pending') {
      await pool.query("UPDATE daily_tasks SET status = 'in-progress', started_at = $1 WHERE id = $2", [now, daily_task_id]);
    }

    res.status(201).json({ timer_session: session });
  } catch (err) {
    console.error('Start timer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/timer/pause
router.post('/pause', async (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id } = req.body;

    let session;
    if (session_id) {
      const { rows } = await pool.query(
        `SELECT ts.* FROM timer_sessions ts
         JOIN daily_tasks dt ON ts.daily_task_id = dt.id
         WHERE ts.id = $1 AND dt.user_id = $2 AND ts.is_active = 1`, [session_id, userId]
      );
      session = rows[0];
    } else {
      const { rows } = await pool.query(
        `SELECT ts.* FROM timer_sessions ts
         JOIN daily_tasks dt ON ts.daily_task_id = dt.id
         WHERE dt.user_id = $1 AND ts.is_active = 1 AND ts.paused_at IS NULL`, [userId]
      );
      session = rows[0];
    }

    if (!session) {
      return res.status(404).json({ error: 'No active running timer found' });
    }
    if (session.paused_at) {
      return res.status(400).json({ error: 'Timer is already paused' });
    }

    const now = new Date().toISOString();
    await pool.query('UPDATE timer_sessions SET paused_at = $1 WHERE id = $2', [now, session.id]);
    const { rows: [updated] } = await pool.query('SELECT * FROM timer_sessions WHERE id = $1', [session.id]);
    res.json({ timer_session: updated });
  } catch (err) {
    console.error('Pause timer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/timer/resume
router.post('/resume', async (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id } = req.body;

    let session;
    if (session_id) {
      const { rows } = await pool.query(
        `SELECT ts.* FROM timer_sessions ts
         JOIN daily_tasks dt ON ts.daily_task_id = dt.id
         WHERE ts.id = $1 AND dt.user_id = $2 AND ts.is_active = 1`, [session_id, userId]
      );
      session = rows[0];
    } else {
      const { rows } = await pool.query(
        `SELECT ts.* FROM timer_sessions ts
         JOIN daily_tasks dt ON ts.daily_task_id = dt.id
         WHERE dt.user_id = $1 AND ts.is_active = 1 AND ts.paused_at IS NOT NULL`, [userId]
      );
      session = rows[0];
    }

    if (!session) {
      return res.status(404).json({ error: 'No paused timer found' });
    }
    if (!session.paused_at) {
      return res.status(400).json({ error: 'Timer is not paused' });
    }

    const pausedAt = new Date(session.paused_at).getTime();
    const now = Date.now();
    const pausedMs = now - pausedAt;
    const newTotalPaused = (session.total_paused_ms || 0) + pausedMs;

    await pool.query('UPDATE timer_sessions SET paused_at = NULL, total_paused_ms = $1 WHERE id = $2', [newTotalPaused, session.id]);
    const { rows: [updated] } = await pool.query('SELECT * FROM timer_sessions WHERE id = $1', [session.id]);
    res.json({ timer_session: updated });
  } catch (err) {
    console.error('Resume timer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/timer/finish
router.post('/finish', async (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id } = req.body;

    let session;
    if (session_id) {
      const { rows } = await pool.query(
        `SELECT ts.* FROM timer_sessions ts
         JOIN daily_tasks dt ON ts.daily_task_id = dt.id
         WHERE ts.id = $1 AND dt.user_id = $2 AND ts.is_active = 1`, [session_id, userId]
      );
      session = rows[0];
    } else {
      const { rows } = await pool.query(
        `SELECT ts.* FROM timer_sessions ts
         JOIN daily_tasks dt ON ts.daily_task_id = dt.id
         WHERE dt.user_id = $1 AND ts.is_active = 1`, [userId]
      );
      session = rows[0];
    }

    if (!session) {
      return res.status(404).json({ error: 'No active timer found' });
    }

    const now = new Date();
    const nowISO = now.toISOString();

    let totalPausedMs = session.total_paused_ms || 0;
    if (session.paused_at) {
      const pausedAt = new Date(session.paused_at).getTime();
      totalPausedMs += now.getTime() - pausedAt;
    }

    const startTime = new Date(session.start_time).getTime();
    const totalElapsedMs = now.getTime() - startTime;
    const activeMs = totalElapsedMs - totalPausedMs;
    const actualMinutes = Math.round(activeMs / 60000);

    await pool.query(
      'UPDATE timer_sessions SET end_time = $1, is_active = 0, paused_at = NULL, total_paused_ms = $2 WHERE id = $3',
      [nowISO, totalPausedMs, session.id]
    );

    const { rows: [dailyTask] } = await pool.query('SELECT * FROM daily_tasks WHERE id = $1', [session.daily_task_id]);
    const newDuration = (dailyTask.actual_duration || 0) + actualMinutes;
    await pool.query('UPDATE daily_tasks SET actual_duration = $1 WHERE id = $2', [newDuration, session.daily_task_id]);

    const { rows: [updatedSession] } = await pool.query('SELECT * FROM timer_sessions WHERE id = $1', [session.id]);
    const { rows: [updatedTask] } = await pool.query(
      `SELECT dt.*, t.name, t.duration, t.goal_category, t.task_type
       FROM daily_tasks dt JOIN tasks t ON dt.task_id = t.id WHERE dt.id = $1`,
      [session.daily_task_id]
    );

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

// GET /api/timer/active
router.get('/active', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows: [session] } = await pool.query(
      `SELECT ts.*, dt.task_id, dt.date, t.name as task_name, t.duration as estimated_duration, t.goal_category, t.task_type
       FROM timer_sessions ts
       JOIN daily_tasks dt ON ts.daily_task_id = dt.id
       JOIN tasks t ON dt.task_id = t.id
       WHERE dt.user_id = $1 AND ts.is_active = 1`, [userId]
    );
    res.json({ timer_session: session || null });
  } catch (err) {
    console.error('Get active timer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
