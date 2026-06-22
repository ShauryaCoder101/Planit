const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db.cjs');

const router = express.Router();

// Admin middleware
async function adminMiddleware(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || rows[0].is_admin !== 1) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.use(adminMiddleware);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email, is_admin FROM users ORDER BY id ASC');
    res.json({ users: rows });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
      [name, email, hashedPassword]
    );
    const { rows: userRows } = await pool.query('SELECT id, name, email, is_admin FROM users WHERE id = $1', [rows[0].id]);
    res.status(201).json({ user: userRows[0] });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { name, email, password } = req.body;
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const setClauses = [];
    const values = [];
    let paramIdx = 1;
    if (name !== undefined) { setClauses.push(`name = $${paramIdx++}`); values.push(name); }
    if (email !== undefined) {
      const { rows: conflict } = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
      if (conflict.length > 0) {
        return res.status(409).json({ error: 'Email already in use by another user' });
      }
      setClauses.push(`email = $${paramIdx++}`); values.push(email);
    }
    if (password !== undefined) {
      setClauses.push(`password = $${paramIdx++}`); values.push(bcrypt.hashSync(password, 10));
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    values.push(userId);
    await pool.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`, values);
    const { rows } = await pool.query('SELECT id, name, email, is_admin FROM users WHERE id = $1', [userId]);
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
