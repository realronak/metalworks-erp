import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../../db/connection.js';
import { authenticate, generateToken } from '../../middleware/auth.js';
import { logAudit } from '../../utils/audit.js';

const router = Router();

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username/Email and password are required.' });
    }

    const { rows } = await pool.query(`
      SELECT id, username, email, password_hash, full_name, role, is_active
      FROM users
      WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1))
      LIMIT 1;
    `, [username.trim()]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account has been deactivated. Please contact an administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = generateToken(user);

    // Set secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    await logAudit({
      userId: user.id,
      username: user.username,
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user.id,
      details: { role: user.role },
      req
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    next(err);
  }
});

// Current User Profile
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, username, email, full_name, role, is_active, created_at
      FROM users
      WHERE id = $1
      LIMIT 1;
    `, [req.user.id]);

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ error: 'User no longer valid or active.' });
    }

    const user = rows[0];
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      createdAt: user.created_at
    });
  } catch (err) {
    next(err);
  }
});

// Logout
router.post('/logout', authenticate, async (req, res) => {
  res.clearCookie('token');
  await logAudit({
    userId: req.user.id,
    username: req.user.username,
    action: 'LOGOUT',
    entityType: 'USER',
    entityId: req.user.id,
    req
  });
  res.json({ message: 'Logged out successfully' });
});

export default router;
