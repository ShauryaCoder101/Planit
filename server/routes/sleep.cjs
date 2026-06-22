const express = require('express');
const pool = require('../db.cjs');

const router = express.Router();

// GET /api/sleep/:date
router.get('/:date', async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;
    const { rows } = await pool.query('SELECT * FROM sleep_logs WHERE user_id = $1 AND date = $2', [userId, date]);
    res.json({ sleep: rows[0] || null });
  } catch (err) {
    console.error('Get sleep error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sleep
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, hours } = req.body;
    if (!date || hours === undefined) {
      return res.status(400).json({ error: 'Date and hours are required' });
    }
    const { rows: existing } = await pool.query('SELECT id FROM sleep_logs WHERE user_id = $1 AND date = $2', [userId, date]);
    let sleep;
    if (existing.length > 0) {
      await pool.query('UPDATE sleep_logs SET hours = $1 WHERE id = $2', [hours, existing[0].id]);
      const { rows } = await pool.query('SELECT * FROM sleep_logs WHERE id = $1', [existing[0].id]);
      sleep = rows[0];
    } else {
      const { rows } = await pool.query(
        'INSERT INTO sleep_logs (user_id, date, hours) VALUES ($1, $2, $3) RETURNING *',
        [userId, date, hours]
      );
      sleep = rows[0];
    }
    res.json({ sleep });
  } catch (err) {
    console.error('Log sleep error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
