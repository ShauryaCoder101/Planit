const express = require('express');
const pool = require('../db.cjs');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

function getSunday(dateStr) {
  const monday = new Date(getMonday(dateStr) + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday.toISOString().split('T')[0];
}

function getDateRange(startStr, endStr) {
  const dates = [];
  const current = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

async function aggregateReport(userId, dates) {
  const hoursByGoal = {};
  let totalCompleted = 0;
  let totalTasks = 0;
  let totalActualMinutes = 0;
  let totalEstimatedMinutes = 0;
  const sleepData = [];
  const dayBreakdown = [];

  for (const date of dates) {
    const { rows: tasks } = await pool.query(
      `SELECT dt.*, t.name, t.duration, t.goal_category
       FROM daily_tasks dt JOIN tasks t ON dt.task_id = t.id
       WHERE dt.user_id = $1 AND dt.date = $2`, [userId, date]
    );
    const { rows: sleepRows } = await pool.query(
      'SELECT * FROM sleep_logs WHERE user_id = $1 AND date = $2', [userId, date]
    );
    const sleepLog = sleepRows[0];

    let dayCompleted = 0;
    let dayTotal = tasks.length;
    let dayActualMinutes = 0;
    let dayEstimatedMinutes = 0;
    const dayHoursByGoal = {};

    for (const task of tasks) {
      totalTasks++;
      dayEstimatedMinutes += task.duration || 0;
      totalEstimatedMinutes += task.duration || 0;
      if (task.status === 'completed') { totalCompleted++; dayCompleted++; }
      const actualMins = task.actual_duration || 0;
      dayActualMinutes += actualMins;
      totalActualMinutes += actualMins;
      const category = task.goal_category || 'Uncategorized';
      const hours = actualMins / 60;
      if (!hoursByGoal[category]) hoursByGoal[category] = 0;
      hoursByGoal[category] += hours;
      if (!dayHoursByGoal[category]) dayHoursByGoal[category] = 0;
      dayHoursByGoal[category] += hours;
    }

    if (sleepLog) { sleepData.push({ date, hours: sleepLog.hours }); }
    dayBreakdown.push({
      date, tasks_completed: dayCompleted, tasks_total: dayTotal,
      actual_minutes: dayActualMinutes, estimated_minutes: dayEstimatedMinutes,
      hours_by_goal: dayHoursByGoal, sleep_hours: sleepLog ? sleepLog.hours : null,
    });
  }

  const numDays = dates.length;
  const avgDailyHours = numDays > 0 ? (totalActualMinutes / 60) / numDays : 0;
  const avgSleepHours = sleepData.length > 0
    ? sleepData.reduce((sum, s) => sum + s.hours, 0) / sleepData.length : null;

  return {
    summary: {
      total_hours_by_goal: hoursByGoal,
      total_actual_hours: +(totalActualMinutes / 60).toFixed(2),
      total_estimated_hours: +(totalEstimatedMinutes / 60).toFixed(2),
      tasks_completed: totalCompleted, tasks_total: totalTasks,
      completion_rate: totalTasks > 0 ? +((totalCompleted / totalTasks) * 100).toFixed(1) : 0,
      average_daily_hours: +avgDailyHours.toFixed(2),
      average_sleep_hours: avgSleepHours !== null ? +avgSleepHours.toFixed(2) : null,
    },
    sleep_data: sleepData,
    day_breakdown: dayBreakdown,
  };
}

async function areFriends(userId, friendId) {
  const { rows } = await pool.query(
    'SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2', [userId, friendId]
  );
  return rows.length > 0;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/friends
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows: friends } = await pool.query(
      `SELECT u.id, u.name, u.email, f.created_at AS friends_since
       FROM friendships f JOIN users u ON f.friend_id = u.id
       WHERE f.user_id = $1 ORDER BY u.name ASC`, [userId]
    );
    res.json({ friends });
  } catch (err) {
    console.error('List friends error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/request
router.post('/request', async (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { rows: [targetUser] } = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.id === userId) return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    if (await areFriends(userId, targetUser.id)) return res.status(409).json({ error: 'Already friends with this user' });

    const { rows: [existingRequest] } = await pool.query(
      `SELECT id, status FROM friend_requests
       WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)`,
      [userId, targetUser.id]
    );

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(409).json({ error: 'Friend request already pending' });
      }
      if (existingRequest.status === 'rejected') {
        await pool.query(
          "UPDATE friend_requests SET status = 'pending', from_user_id = $1, to_user_id = $2, created_at = NOW() WHERE id = $3",
          [userId, targetUser.id, existingRequest.id]
        );
        const { rows: [updated] } = await pool.query('SELECT * FROM friend_requests WHERE id = $1', [existingRequest.id]);
        return res.status(201).json({ friend_request: updated });
      }
    }

    const { rows: [friendRequest] } = await pool.query(
      'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING *',
      [userId, targetUser.id]
    );
    res.status(201).json({ friend_request: friendRequest });
  } catch (err) {
    console.error('Send friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/friends/requests
router.get('/requests', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows: received } = await pool.query(
      `SELECT fr.*, u.name AS from_name, u.email AS from_email
       FROM friend_requests fr JOIN users u ON fr.from_user_id = u.id
       WHERE fr.to_user_id = $1 AND fr.status = 'pending' ORDER BY fr.created_at DESC`, [userId]
    );
    const { rows: sent } = await pool.query(
      `SELECT fr.*, u.name AS to_name, u.email AS to_email
       FROM friend_requests fr JOIN users u ON fr.to_user_id = u.id
       WHERE fr.from_user_id = $1 AND fr.status = 'pending' ORDER BY fr.created_at DESC`, [userId]
    );
    res.json({ received, sent });
  } catch (err) {
    console.error('Get friend requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/requests/:id/accept
router.post('/requests/:id/accept', async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = parseInt(req.params.id, 10);

    const { rows: [request] } = await pool.query(
      "SELECT * FROM friend_requests WHERE id = $1 AND to_user_id = $2 AND status = 'pending'", [requestId, userId]
    );
    if (!request) return res.status(404).json({ error: 'Friend request not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE friend_requests SET status = 'accepted' WHERE id = $1", [requestId]);
      await client.query(
        'INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [request.from_user_id, request.to_user_id]
      );
      await client.query(
        'INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [request.to_user_id, request.from_user_id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    console.error('Accept friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/requests/:id/reject
router.post('/requests/:id/reject', async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = parseInt(req.params.id, 10);
    const { rows: [request] } = await pool.query(
      "SELECT * FROM friend_requests WHERE id = $1 AND to_user_id = $2 AND status = 'pending'", [requestId, userId]
    );
    if (!request) return res.status(404).json({ error: 'Friend request not found' });
    await pool.query("UPDATE friend_requests SET status = 'rejected' WHERE id = $1", [requestId]);
    res.json({ message: 'Friend request rejected' });
  } catch (err) {
    console.error('Reject friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/friends/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.id, 10);
    if (!(await areFriends(userId, friendId))) {
      return res.status(404).json({ error: 'Friendship not found' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2', [userId, friendId]);
      await client.query('DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2', [friendId, userId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ message: 'Friend removed successfully' });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/friends/:id/activity
router.get('/:id/activity', async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.id, 10);
    if (!(await areFriends(userId, friendId))) {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    const { period = 'day', date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });

    let dates, reportMeta = {};
    if (period === 'day') {
      dates = [date]; reportMeta = { type: 'daily', date };
    } else if (period === 'week') {
      const monday = getMonday(date), sunday = getSunday(date);
      dates = getDateRange(monday, sunday);
      reportMeta = { type: 'weekly', start_date: monday, end_date: sunday };
    } else if (period === 'month') {
      const d = new Date(date + 'T00:00:00');
      const year = d.getFullYear(), month = d.getMonth() + 1;
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).toISOString().split('T')[0];
      dates = getDateRange(firstDay, lastDay);
      reportMeta = { type: 'monthly', year, month, start_date: firstDay, end_date: lastDay };
    } else {
      return res.status(400).json({ error: 'Period must be day, week, or month' });
    }

    const report = await aggregateReport(friendId, dates);

    if (period === 'day') {
      const { rows: tasks } = await pool.query(
        `SELECT dt.status, dt.actual_duration, t.name, t.goal_category
         FROM daily_tasks dt JOIN tasks t ON dt.task_id = t.id
         WHERE dt.user_id = $1 AND dt.date = $2`, [friendId, date]
      );
      const { rows: [sleepLog] } = await pool.query(
        'SELECT hours FROM sleep_logs WHERE user_id = $1 AND date = $2', [friendId, date]
      );
      report.tasks = tasks;
      report.sleep_hours = sleepLog ? sleepLog.hours : null;
    }

    res.json({ report: { ...report, ...reportMeta } });
  } catch (err) {
    console.error('Friend activity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/friends/:id/planner
router.get('/:id/planner', async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.id, 10);
    if (!(await areFriends(userId, friendId))) {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });

    const { rows: dailyTasks } = await pool.query(
      `SELECT dt.*, t.name, t.duration, t.goal_category, t.recurrence_type, t.recurrence_days, t.carry_over, t.task_type
       FROM daily_tasks dt JOIN tasks t ON dt.task_id = t.id
       WHERE dt.user_id = $1 AND dt.date = $2
       ORDER BY dt.is_carried_over DESC, t.goal_category ASC, t.name ASC`,
      [friendId, date]
    );

    const tasksWithSubtasks = [];
    for (const dt of dailyTasks) {
      const { rows: subtasks } = await pool.query(
        `SELECT ds.*, s.name, s.sort_order
         FROM daily_subtasks ds JOIN subtasks s ON ds.subtask_id = s.id
         WHERE ds.daily_task_id = $1 ORDER BY s.sort_order ASC`, [dt.id]
      );
      tasksWithSubtasks.push({
        ...dt,
        recurrence_days: dt.recurrence_days ? JSON.parse(dt.recurrence_days) : null,
        subtasks,
      });
    }

    const { rows: [sleepLog] } = await pool.query(
      'SELECT * FROM sleep_logs WHERE user_id = $1 AND date = $2', [friendId, date]
    );
    const { rows: [friend] } = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1', [friendId]
    );

    res.json({ friend, date, daily_tasks: tasksWithSubtasks, sleep: sleepLog || null });
  } catch (err) {
    console.error('Friend planner error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
