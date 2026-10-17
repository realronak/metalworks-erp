import { Router } from 'express';
import pool, { withTransaction } from '../../db/connection.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { getNextDocNumber } from '../../utils/docSequence.js';
import { logAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

// ----------------------------------------------------
// 1. INSPECTION PLANS
// ----------------------------------------------------

router.get('/plans', async (req, res, next) => {
  try {
    const { type, product_id } = req.query;
    let query = `
      SELECT ip.*, p.name AS product_name, p.sku AS product_sku
      FROM inspection_plans ip
      LEFT JOIN products p ON ip.product_id = p.id
    `;
    const params = [];
    const conditions = [];

    if (type) {
      params.push(type);
      conditions.push(`ip.type = $${params.length}`);
    }

    if (product_id) {
      params.push(product_id);
      conditions.push(`ip.product_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY ip.code ASC;';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/plans', requireRoles('admin', 'qc'), async (req, res, next) => {
  try {
    const { code, title, type, product_id, checklist } = req.body;
    if (!title || !type || !checklist) {
      return res.status(400).json({ error: 'Title, inspection type, and checklist parameters are required.' });
    }

    let planCode = code;
    if (!planCode) {
      const countRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM inspection_plans');
      planCode = `PLAN-QC-${String(countRes.rows[0].cnt + 1).padStart(3, '0')}`;
    }

    const { rows } = await pool.query(`
      INSERT INTO inspection_plans (code, title, type, product_id, checklist)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `, [planCode.toUpperCase(), title.trim(), type, product_id || null, JSON.stringify(checklist)]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 2. QUALITY INSPECTIONS
// ----------------------------------------------------

router.get('/inspections', async (req, res, next) => {
  try {
    const { status, type, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`qi.status = $${params.length}`);
    }

    if (type) {
      params.push(type);
      conditions.push(`qi.inspection_type = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(qi.inspection_number ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR qi.batch_number ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM quality_inspections qi
      JOIN products p ON qi.product_id = p.id
      ${whereClause};
    `, params);
    const total = countRes.rows[0].total;

    params.push(parseInt(limit, 10));
    params.push(offset);

    const query = `
      SELECT 
        qi.*,
        p.name AS product_name,
        p.sku AS product_sku,
        p.uom_code,
        ip.title AS plan_title,
        w.name AS warehouse_name,
        gr.receipt_number,
        wo.wo_number,
        u.full_name AS inspector_name
      FROM quality_inspections qi
      JOIN products p ON qi.product_id = p.id
      LEFT JOIN inspection_plans ip ON qi.inspection_plan_id = ip.id
      LEFT JOIN warehouses w ON qi.warehouse_id = w.id
      LEFT JOIN goods_receipts gr ON qi.goods_receipt_id = gr.id
      LEFT JOIN work_orders wo ON qi.work_order_id = wo.id
      LEFT JOIN users u ON qi.inspector_id = u.id
      ${whereClause}
      ORDER BY qi.created_at DESC
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

router.get('/inspections/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT 
        qi.*,
        p.name AS product_name,
        p.sku AS product_sku,
        p.uom_code,
        ip.title AS plan_title,
        ip.checklist AS plan_checklist,
        w.name AS warehouse_name,
        gr.receipt_number,
        wo.wo_number,
        u.full_name AS inspector_name
      FROM quality_inspections qi
      JOIN products p ON qi.product_id = p.id
      LEFT JOIN inspection_plans ip ON qi.inspection_plan_id = ip.id
      LEFT JOIN warehouses w ON qi.warehouse_id = w.id
      LEFT JOIN goods_receipts gr ON qi.goods_receipt_id = gr.id
      LEFT JOIN work_orders wo ON qi.work_order_id = wo.id
      LEFT JOIN users u ON qi.inspector_id = u.id
      WHERE qi.id = $1;
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Inspection record not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// CREATE Quality Inspection request
router.post('/inspections', requireRoles('admin', 'qc', 'warehouse', 'production'), async (req, res, next) => {
  try {
    const {
      inspection_plan_id,
      inspection_type,
      product_id,
      batch_number,
      warehouse_id,
      goods_receipt_id,
      work_order_id,
      inspected_quantity,
      notes
    } = req.body;

    const qty = Number(inspected_quantity);
    if (!product_id || !inspection_type || !qty || qty <= 0) {
      return res.status(400).json({ error: 'Product, inspection type, and positive inspected quantity are required.' });
    }

    const inspNumber = await getNextDocNumber('INSP');

    const { rows } = await pool.query(`
      INSERT INTO quality_inspections (
        inspection_number, inspection_plan_id, inspection_type, product_id,
        batch_number, warehouse_id, goods_receipt_id, work_order_id,
        status, inspected_quantity, accepted_quantity, rejected_quantity, quarantined_quantity,
        results, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, 0, 0, 0, '[]', $10)
      RETURNING *;
    `, [
      inspNumber,
      inspection_plan_id || null,
      inspection_type,
      product_id,
      batch_number || '',
      warehouse_id || null,
      goods_receipt_id || null,
      work_order_id || null,
      qty,
      notes || ''
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// RECORD INSPECTION RESULTS (Strict validation: never pass if checks fail!)
router.put('/inspections/:id/record', requireRoles('admin', 'qc'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      results, // [{ parameter, unit, min_val, max_val, measured, pass, critical }]
      accepted_quantity,
      rejected_quantity = 0,
      quarantined_quantity = 0,
      notes,
      auto_create_ncr = false
    } = req.body;

    if (!results || !Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: 'Inspection checklist results are required.' });
    }

    // Integrity Rule: If any check failed, inspection CANNOT be marked as 'passed'
    const anyFailed = results.some(r => r.pass === false);
    const anyCriticalFailed = results.some(r => r.critical && r.pass === false);

    let calculatedStatus = 'passed';
    if (anyCriticalFailed || Number(rejected_quantity) > 0) {
      calculatedStatus = 'failed';
    } else if (anyFailed || Number(quarantined_quantity) > 0) {
      calculatedStatus = 'conditional';
    }

    const result = await withTransaction(async (client) => {
      const { rows: inspRows } = await client.query('SELECT * FROM quality_inspections WHERE id = $1 FOR UPDATE;', [id]);
      if (inspRows.length === 0) throw new Error('Inspection not found.');
      const insp = inspRows[0];

      const { rows: updatedRows } = await client.query(`
        UPDATE quality_inspections
        SET 
          status = $1,
          accepted_quantity = $2,
          rejected_quantity = $3,
          quarantined_quantity = $4,
          results = $5,
          notes = COALESCE($6, notes),
          inspector_id = $7,
          inspected_at = NOW()
        WHERE id = $8
        RETURNING *;
      `, [
        calculatedStatus,
        Number(accepted_quantity || 0),
        Number(rejected_quantity || 0),
        Number(quarantined_quantity || 0),
        JSON.stringify(results),
        notes,
        req.user.id,
        id
      ]);

      let ncr = null;
      if (calculatedStatus === 'failed' || auto_create_ncr) {
        const ncrNumber = await getNextDocNumber('NCR', client);
        const { rows: ncrRows } = await client.query(`
          INSERT INTO nonconformance_reports (
            ncr_number, inspection_id, product_id, severity, title,
            description, status, reported_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)
          RETURNING *;
        `, [
          ncrNumber,
          id,
          insp.product_id,
          anyCriticalFailed ? 'critical' : 'medium',
          `Quality inspection failure: ${insp.inspection_number}`,
          notes || 'Checklist parameters outside specified tolerance limits during inspection.',
          req.user.id
        ]);
        ncr = ncrRows[0];
      }

      return {
        inspection: updatedRows[0],
        ncr
      };
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'RECORD_INSPECTION_RESULTS',
      entityType: 'INSPECTION',
      entityId: id,
      details: { status: calculatedStatus, accepted: accepted_quantity, rejected: rejected_quantity },
      req
    });

    res.json({
      message: `Inspection recorded with status: ${calculatedStatus.toUpperCase()}`,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 3. NONCONFORMANCE REPORTS (NCR)
// ----------------------------------------------------

router.get('/ncrs', async (req, res, next) => {
  try {
    const { status, severity } = req.query;
    let query = `
      SELECT 
        ncr.*,
        p.name AS product_name,
        p.sku AS product_sku,
        qi.inspection_number,
        u.full_name AS reported_by_name,
        a.full_name AS assigned_to_name
      FROM nonconformance_reports ncr
      JOIN products p ON ncr.product_id = p.id
      LEFT JOIN quality_inspections qi ON ncr.inspection_id = qi.id
      LEFT JOIN users u ON ncr.reported_by = u.id
      LEFT JOIN users a ON ncr.assigned_to = a.id
    `;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`ncr.status = $${params.length}`);
    }

    if (severity) {
      params.push(severity);
      conditions.push(`ncr.severity = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY ncr.created_at DESC;';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/ncrs', requireRoles('admin', 'qc'), async (req, res, next) => {
  try {
    const { product_id, inspection_id, severity = 'medium', title, description } = req.body;
    if (!product_id || !title || !description) {
      return res.status(400).json({ error: 'Product, title, and detailed description are required.' });
    }

    const ncrNum = await getNextDocNumber('NCR');

    const { rows } = await pool.query(`
      INSERT INTO nonconformance_reports (
        ncr_number, inspection_id, product_id, severity, title,
        description, status, reported_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)
      RETURNING *;
    `, [ncrNum, inspection_id || null, product_id, severity, title.trim(), description.trim(), req.user.id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/ncrs/:id', requireRoles('admin', 'qc'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, root_cause, corrective_action, assigned_to } = req.body;

    const { rows } = await pool.query(`
      UPDATE nonconformance_reports
      SET 
        status = COALESCE($1, status),
        root_cause = COALESCE($2, root_cause),
        corrective_action = COALESCE($3, corrective_action),
        assigned_to = COALESCE($4, assigned_to),
        resolved_at = CASE WHEN $1 IN ('resolved', 'closed') THEN NOW() ELSE resolved_at END
      WHERE id = $5
      RETURNING *;
    `, [status, root_cause, corrective_action, assigned_to, id]);

    if (rows.length === 0) return res.status(404).json({ error: 'NCR not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
