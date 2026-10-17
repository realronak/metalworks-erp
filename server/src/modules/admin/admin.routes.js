import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../../db/connection.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);
router.use(requireRoles('admin'));

// ----------------------------------------------------
// 1. USER MANAGEMENT
// ----------------------------------------------------

router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, username, email, full_name, role, is_active, created_at, updated_at
      FROM users
      ORDER BY id ASC;
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const { username, email, password, full_name, role } = req.body;
    if (!username || !email || !password || !full_name || !role) {
      return res.status(400).json({ error: 'All fields (username, email, password, full_name, role) are required.' });
    }

    const validRoles = ['admin', 'purchasing', 'warehouse', 'production', 'sales', 'qc'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${validRoles.join(', ')}` });
    }

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(`
      INSERT INTO users (username, email, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, full_name, role, is_active, created_at;
    `, [username.trim().toLowerCase(), email.trim().toLowerCase(), hash, full_name.trim(), role]);

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CREATE_USER',
      entityType: 'USER',
      entityId: rows[0].id,
      details: { username: rows[0].username, role: rows[0].role },
      req
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, full_name, role, is_active, password } = req.body;

    let updateSql = 'UPDATE users SET updated_at = NOW()';
    const params = [];

    if (email) {
      params.push(email.trim().toLowerCase());
      updateSql += `, email = $${params.length}`;
    }
    if (full_name) {
      params.push(full_name.trim());
      updateSql += `, full_name = $${params.length}`;
    }
    if (role) {
      params.push(role);
      updateSql += `, role = $${params.length}`;
    }
    if (is_active !== undefined) {
      params.push(Boolean(is_active));
      updateSql += `, is_active = $${params.length}`;
    }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      params.push(hash);
      updateSql += `, password_hash = $${params.length}`;
    }

    params.push(id);
    updateSql += ` WHERE id = $${params.length} RETURNING id, username, email, full_name, role, is_active, updated_at;`;

    const { rows } = await pool.query(updateSql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UPDATE_USER',
      entityType: 'USER',
      entityId: id,
      details: { role, is_active },
      req
    });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 2. COMPANY SETTINGS
// ----------------------------------------------------

router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM company_settings WHERE id = 1;');
    if (rows.length === 0) {
      return res.json({ company_name: 'MetalWorks ERP', currency: 'USD' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    const { company_name, tax_id, email, phone, address, currency = 'USD' } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO company_settings (id, company_name, tax_id, email, phone, address, currency, updated_at)
      VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        tax_id = EXCLUDED.tax_id,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        address = EXCLUDED.address,
        currency = EXCLUDED.currency,
        updated_at = NOW()
      RETURNING *;
    `, [company_name, tax_id, email, phone, address, currency]);

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UPDATE_COMPANY_SETTINGS',
      entityType: 'SETTINGS',
      entityId: '1',
      details: { company_name },
      req
    });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 3. DOCUMENT NUMBERING SEQUENCES
// ----------------------------------------------------

router.get('/sequences', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM document_sequences ORDER BY doc_type ASC;');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.put('/sequences/:docType', async (req, res, next) => {
  try {
    const { docType } = req.params;
    const { prefix, next_val, padding, format } = req.body;

    const { rows } = await pool.query(`
      UPDATE document_sequences
      SET 
        prefix = COALESCE($1, prefix),
        next_val = COALESCE($2, next_val),
        padding = COALESCE($3, padding),
        format = COALESCE($4, format)
      WHERE doc_type = $5
      RETURNING *;
    `, [prefix, next_val, padding, format, docType]);

    if (rows.length === 0) return res.status(404).json({ error: 'Sequence type not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 4. AUDIT LOGS
// ----------------------------------------------------

router.get('/audit-logs', async (req, res, next) => {
  try {
    const { entity_type, action, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    if (entity_type) {
      params.push(entity_type);
      conditions.push(`entity_type = $${params.length}`);
    }

    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(username ILIKE $${params.length} OR action ILIKE $${params.length} OR entity_type ILIKE $${params.length} OR entity_id ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs ${whereClause};`, params);
    const total = countRes.rows[0].total;

    params.push(parseInt(limit, 10));
    params.push(offset);

    const query = `
      SELECT * FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const { rows } = await pool.query(query, params);

    res.json({
      data: rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
