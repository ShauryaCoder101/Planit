const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db.cjs');

const router = express.Router();

// Admin middleware — checks that the authenticated user has is_admin=1
function adminMiddleware(req, res, next) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (!user || user.is_admin !== 1) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Apply admin middleware to all routes in this router
router.use(adminMiddleware);

// GET /api/admin/users — list all users
router.get('/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, name, email, is_admin FROM users ORDER BY id ASC').all();
    res.json({ users });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users — create new user
router.post('/users', (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(
      name, email, hashedPassword
    );

    const user = db.prepare('SELECT id, name, email, is_admin FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ user });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/users/:id — update user
router.put('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { name, email, password } = req.body;

    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const setClauses = [];
    const values = [];

    if (name !== undefined) {
      setClauses.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      // Check for email conflict
      const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
      if (conflict) {
        return res.status(409).json({ error: 'Email already in use by another user' });
      }
      setClauses.push('email = ?');
      values.push(email);
    }
    if (password !== undefined) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      setClauses.push('password = ?');
      values.push(hashedPassword);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    const user = db.prepare('SELECT id, name, email, is_admin FROM users WHERE id = ?').get(userId);
    res.json({ user });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id — delete user (cannot delete self)
router.delete('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
