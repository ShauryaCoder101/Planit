const express = require('express');
const db = require('../db.cjs');

const router = express.Router();

// ─── Helpers (same pattern as reports.cjs) ──────────────────────────────────

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

function aggregateReport(userId, dates) {
  const hoursByGoal = {};
  let totalCompleted = 0;
  let totalTasks = 0;
  let totalActualMinutes = 0;
  let totalEstimatedMinutes = 0;
  const sleepData = [];
  const dayBreakdown = [];

  const getDailyTasks = db.prepare(`
    SELECT dt.*, t.name, t.duration, t.goal_category
    FROM daily_tasks dt
    JOIN tasks t ON dt.task_id = t.id
    WHERE dt.user_id = ? AND dt.date = ?
  `);

  const getSleepLog = db.prepare('SELECT * FROM sleep_logs WHERE user_id = ? AND date = ?');

  for (const date of dates) {
    const tasks = getDailyTasks.all(userId, date);
    const sleepLog = getSleepLog.get(userId, date);

    let dayCompleted = 0;
    let dayTotal = tasks.length;
    let dayActualMinutes = 0;
    let dayEstimatedMinutes = 0;
    const dayHoursByGoal = {};

    for (const task of tasks) {
      totalTasks++;
      dayEstimatedMinutes += task.duration || 0;
      totalEstimatedMinutes += task.duration || 0;

      if (task.status === 'completed') {
        totalCompleted++;
        dayCompleted++;
      }

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

    if (sleepLog) {
      sleepData.push({ date, hours: sleepLog.hours });
    }

    dayBreakdown.push({
      date,
      tasks_completed: dayCompleted,
      tasks_total: dayTotal,
      actual_minutes: dayActualMinutes,
      estimated_minutes: dayEstimatedMinutes,
      hours_by_goal: dayHoursByGoal,
      sleep_hours: sleepLog ? sleepLog.hours : null,
    });
  }

  const numDays = dates.length;
  const avgDailyHours = numDays > 0 ? (totalActualMinutes / 60) / numDays : 0;
  const avgSleepHours = sleepData.length > 0
    ? sleepData.reduce((sum, s) => sum + s.hours, 0) / sleepData.length
    : null;

  return {
    summary: {
      total_hours_by_goal: hoursByGoal,
      total_actual_hours: +(totalActualMinutes / 60).toFixed(2),
      total_estimated_hours: +(totalEstimatedMinutes / 60).toFixed(2),
      tasks_completed: totalCompleted,
      tasks_total: totalTasks,
      completion_rate: totalTasks > 0 ? +((totalCompleted / totalTasks) * 100).toFixed(1) : 0,
      average_daily_hours: +avgDailyHours.toFixed(2),
      average_sleep_hours: avgSleepHours !== null ? +avgSleepHours.toFixed(2) : null,
    },
    sleep_data: sleepData,
    day_breakdown: dayBreakdown,
  };
}

/**
 * Helper: check if two users are friends
 */
function areFriends(userId, friendId) {
  const row = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?').get(userId, friendId);
  return !!row;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/friends — list current user's friends
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const friends = db.prepare(`
      SELECT u.id, u.name, u.email, f.created_at AS friends_since
      FROM friendships f
      JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ?
      ORDER BY u.name ASC
    `).all(userId);
    res.json({ friends });
  } catch (err) {
    console.error('List friends error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/request — send friend request
router.post('/request', (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const targetUser = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if already friends
    if (areFriends(userId, targetUser.id)) {
      return res.status(409).json({ error: 'Already friends with this user' });
    }

    // Check for existing pending request in either direction
    const existingRequest = db.prepare(`
      SELECT id, status FROM friend_requests
      WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
    `).get(userId, targetUser.id, targetUser.id, userId);

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(409).json({ error: 'Friend request already pending' });
      }
      if (existingRequest.status === 'rejected') {
        // Allow re-sending by updating the existing rejected request
        db.prepare("UPDATE friend_requests SET status = 'pending', from_user_id = ?, to_user_id = ?, created_at = datetime('now') WHERE id = ?")
          .run(userId, targetUser.id, existingRequest.id);
        const updated = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(existingRequest.id);
        return res.status(201).json({ friend_request: updated });
      }
    }

    const result = db.prepare('INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)').run(userId, targetUser.id);
    const friendRequest = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ friend_request: friendRequest });
  } catch (err) {
    console.error('Send friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/friends/requests — get pending requests (sent and received)
router.get('/requests', (req, res) => {
  try {
    const userId = req.user.id;

    const received = db.prepare(`
      SELECT fr.*, u.name AS from_name, u.email AS from_email
      FROM friend_requests fr
      JOIN users u ON fr.from_user_id = u.id
      WHERE fr.to_user_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `).all(userId);

    const sent = db.prepare(`
      SELECT fr.*, u.name AS to_name, u.email AS to_email
      FROM friend_requests fr
      JOIN users u ON fr.to_user_id = u.id
      WHERE fr.from_user_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `).all(userId);

    res.json({ received, sent });
  } catch (err) {
    console.error('Get friend requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/requests/:id/accept — accept friend request
router.post('/requests/:id/accept', (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = parseInt(req.params.id, 10);

    const request = db.prepare("SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'").get(requestId, userId);
    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    const acceptTransaction = db.transaction(() => {
      // Update request status
      db.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").run(requestId);

      // Create friendship in BOTH directions
      db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)').run(request.from_user_id, request.to_user_id);
      db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)').run(request.to_user_id, request.from_user_id);
    });

    acceptTransaction();

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    console.error('Accept friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/friends/requests/:id/reject — reject friend request
router.post('/requests/:id/reject', (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = parseInt(req.params.id, 10);

    const request = db.prepare("SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'").get(requestId, userId);
    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    db.prepare("UPDATE friend_requests SET status = 'rejected' WHERE id = ?").run(requestId);

    res.json({ message: 'Friend request rejected' });
  } catch (err) {
    console.error('Reject friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/friends/:id — remove friendship (both directions)
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.id, 10);

    if (!areFriends(userId, friendId)) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    const removeTransaction = db.transaction(() => {
      db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(userId, friendId);
      db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(friendId, userId);
    });

    removeTransaction();

    res.json({ message: 'Friend removed successfully' });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/friends/:id/activity — get friend's activity summary
router.get('/:id/activity', (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.id, 10);

    // Verify friendship exists
    if (!areFriends(userId, friendId)) {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    const { period = 'day', date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
    }

    let dates;
    let reportMeta = {};

    if (period === 'day') {
      dates = [date];
      reportMeta = { type: 'daily', date };
    } else if (period === 'week') {
      const monday = getMonday(date);
      const sunday = getSunday(date);
      dates = getDateRange(monday, sunday);
      reportMeta = { type: 'weekly', start_date: monday, end_date: sunday };
    } else if (period === 'month') {
      const d = new Date(date + 'T00:00:00');
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDayDate = new Date(year, month, 0);
      const lastDay = lastDayDate.toISOString().split('T')[0];
      dates = getDateRange(firstDay, lastDay);
      reportMeta = { type: 'monthly', year, month, start_date: firstDay, end_date: lastDay };
    } else {
      return res.status(400).json({ error: 'Period must be day, week, or month' });
    }

    const report = aggregateReport(friendId, dates);

    // For day period, also include individual task details
    if (period === 'day') {
      const tasks = db.prepare(`
        SELECT dt.status, dt.actual_duration, t.name, t.goal_category
        FROM daily_tasks dt
        JOIN tasks t ON dt.task_id = t.id
        WHERE dt.user_id = ? AND dt.date = ?
      `).all(friendId, date);

      const sleepLog = db.prepare('SELECT hours FROM sleep_logs WHERE user_id = ? AND date = ?').get(friendId, date);

      report.tasks = tasks;
      report.sleep_hours = sleepLog ? sleepLog.hours : null;
    }

    res.json({ report: { ...report, ...reportMeta } });
  } catch (err) {
    console.error('Friend activity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/friends/:id/planner — get friend's full planner for a date (read-only)
router.get('/:id/planner', (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.id, 10);

    // Verify friendship exists
    if (!areFriends(userId, friendId)) {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
    }

    // Fetch daily tasks — same query pattern as daily.cjs
    const dailyTasks = db.prepare(`
      SELECT dt.*, t.name, t.duration, t.goal_category, t.recurrence_type, t.recurrence_days, t.carry_over, t.task_type
      FROM daily_tasks dt
      JOIN tasks t ON dt.task_id = t.id
      WHERE dt.user_id = ? AND dt.date = ?
      ORDER BY dt.is_carried_over DESC, t.goal_category ASC, t.name ASC
    `).all(friendId, date);

    // Attach subtasks
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

    // Get sleep log
    const sleepLog = db.prepare('SELECT * FROM sleep_logs WHERE user_id = ? AND date = ?').get(friendId, date);

    // Get friend info
    const friend = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(friendId);

    res.json({
      friend,
      date,
      daily_tasks: tasksWithSubtasks,
      sleep: sleepLog || null,
    });
  } catch (err) {
    console.error('Friend planner error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
