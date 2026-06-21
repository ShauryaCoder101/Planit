const express = require('express');
const db = require('../db.cjs');

const router = express.Router();

/**
 * Helper: Get Monday of the week containing the given date.
 */
function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

/**
 * Helper: Get Sunday of the week containing the given date.
 */
function getSunday(dateStr) {
  const monday = new Date(getMonday(dateStr) + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday.toISOString().split('T')[0];
}

/**
 * Helper: Get an array of date strings between start and end (inclusive).
 */
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

/**
 * Helper: Aggregate report data for a set of dates.
 */
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

// GET /api/reports/daily?date=YYYY-MM-DD
router.get('/daily', (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required' });
    }

    const report = aggregateReport(userId, [date]);
    res.json({ report: { ...report, type: 'daily', date } });
  } catch (err) {
    console.error('Daily report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/weekly?date=YYYY-MM-DD
router.get('/weekly', (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required' });
    }

    const monday = getMonday(date);
    const sunday = getSunday(date);
    const dates = getDateRange(monday, sunday);

    const report = aggregateReport(userId, dates);
    res.json({
      report: {
        ...report,
        type: 'weekly',
        start_date: monday,
        end_date: sunday,
      },
    });
  } catch (err) {
    console.error('Weekly report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/monthly?year=YYYY&month=MM
router.get('/monthly', (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month query parameters are required' });
    }

    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    // Get first and last day of the month
    const firstDay = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDayDate = new Date(yearNum, monthNum, 0); // Day 0 of next month = last day of this month
    const lastDay = lastDayDate.toISOString().split('T')[0];

    const dates = getDateRange(firstDay, lastDay);

    const report = aggregateReport(userId, dates);
    res.json({
      report: {
        ...report,
        type: 'monthly',
        year: yearNum,
        month: monthNum,
        start_date: firstDay,
        end_date: lastDay,
      },
    });
  } catch (err) {
    console.error('Monthly report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
