const express = require('express');
const db = require('../db.cjs');

const router = express.Router();

// GET /api/sleep/:date — get sleep log for date
router.get('/:date', (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user.id;

    const log = db.prepare('SELECT * FROM sleep_logs WHERE user_id = ? AND date = ?').get(userId, date);

    res.json({ sleep: log || null });
  } catch (err) {
    console.error('Get sleep error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sleep — upsert sleep hours for a date
router.post('/', (req, res) => {
  try {
    const { date, hours } = req.body;
    const userId = req.user.id;

    if (!date || hours === undefined || hours === null) {
      return res.status(400).json({ error: 'Date and hours are required' });
    }

    if (typeof hours !== 'number' || hours < 0 || hours > 24) {
      return res.status(400).json({ error: 'Hours must be a number between 0 and 24' });
    }

    const existing = db.prepare('SELECT id FROM sleep_logs WHERE user_id = ? AND date = ?').get(userId, date);

    if (existing) {
      db.prepare('UPDATE sleep_logs SET hours = ? WHERE id = ?').run(hours, existing.id);
      const updated = db.prepare('SELECT * FROM sleep_logs WHERE id = ?').get(existing.id);
      res.json({ sleep: updated });
    } else {
      const result = db.prepare('INSERT INTO sleep_logs (user_id, date, hours) VALUES (?, ?, ?)').run(userId, date, hours);
      const created = db.prepare('SELECT * FROM sleep_logs WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ sleep: created });
    }
  } catch (err) {
    console.error('Upsert sleep error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
