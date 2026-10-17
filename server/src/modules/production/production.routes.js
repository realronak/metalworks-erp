import { Router } from 'express';
import pool, { withTransaction } from '../../db/connection.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { getNextDocNumber } from '../../utils/docSequence.js';
import { logAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

// ----------------------------------------------------
// 1. BILLS OF MATERIALS (BOM)
// ----------------------------------------------------

router.get('/boms', async (req, res, next) => {
  try {
    const { product_id, is_active } = req.query;
    let query = `
      SELECT 
        b.*,
        p.name AS product_name,
        p.sku AS product_sku,
        p.uom_code,
        COUNT(bi.id)::int AS component_count
      FROM bill_of_materials b
      JOIN products p ON b.product_id = p.id
      LEFT JOIN bom_items bi ON bi.bom_id = b.id
    `;
    const params = [];
    const conditions = [];

    if (product_id) {
      params.push(parseInt(product_id, 10));
      conditions.push(`b.product_id = $${params.length}`);
    }

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`b.is_active = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' GROUP BY b.id, p.name, p.sku, p.uom_code ORDER BY b.created_at DESC;';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/boms/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const bomRes = await pool.query(`
      SELECT b.*, p.name AS product_name, p.sku AS product_sku, p.uom_code
      FROM bill_of_materials b
      JOIN products p ON b.product_id = p.id
      WHERE b.id = $1;
    `, [id]);

    if (bomRes.rows.length === 0) return res.status(404).json({ error: 'BOM not found.' });

    const itemsRes = await pool.query(`
      SELECT 
        bi.*,
        p.sku AS component_sku,
        p.name AS component_name,
        p.uom_code,
        p.unit_cost,
        p.type AS product_type
      FROM bom_items bi
      JOIN products p ON bi.product_id = p.id
      WHERE bi.bom_id = $1
      ORDER BY bi.position ASC;
    `, [id]);

    res.json({
      bom: bomRes.rows[0],
      items: itemsRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// CREATE BOM
router.post('/boms', requireRoles('admin', 'production'), async (req, res, next) => {
  try {
    const { product_id, name, description, version = '1.0', output_quantity = 1, items } = req.body;

    if (!product_id || !name || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Product, name, and at least one component line item are required.' });
    }

    const result = await withTransaction(async (client) => {
      const bomNumber = await getNextDocNumber('WO', client);
      const generatedBomCode = `BOM-${bomNumber.replace(/^[^-]+-/, '')}`;

      const { rows: bomRows } = await client.query(`
        INSERT INTO bill_of_materials (
          bom_number, product_id, version, name, description, output_quantity, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `, [generatedBomCode, product_id, version, name.trim(), description || '', output_quantity, req.user.id]);

      const bomId = bomRows[0].id;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const qty = Number(item.quantity);
        if (!item.product_id || qty <= 0) {
          throw new Error('Valid component product and positive quantity required.');
        }

        await client.query(`
          INSERT INTO bom_items (bom_id, product_id, quantity, scrap_factor, position, notes)
          VALUES ($1, $2, $3, $4, $5, $6);
        `, [
          bomId,
          item.product_id,
          qty,
          Number(item.scrap_factor || 0),
          item.position || (i + 1),
          item.notes || ''
        ]);
      }

      return bomRows[0];
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 2. WORK ORDERS
// ----------------------------------------------------

router.get('/work-orders', async (req, res, next) => {
  try {
    const { status, priority, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`wo.status = $${params.length}`);
    }

    if (priority) {
      params.push(priority);
      conditions.push(`wo.priority = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(wo.wo_number ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM work_orders wo
      JOIN products p ON wo.product_id = p.id
      ${whereClause};
    `, params);
    const total = countRes.rows[0].total;

    params.push(parseInt(limit, 10));
    params.push(offset);

    const query = `
      SELECT 
        wo.*,
        p.name AS product_name,
        p.sku AS product_sku,
        p.uom_code,
        w.name AS warehouse_name,
        b.bom_number,
        u.full_name AS creator_name,
        CASE WHEN wo.planned_quantity > 0 THEN 
          ROUND((wo.completed_quantity / wo.planned_quantity) * 100, 1)
        ELSE 0 END AS progress_pct
      FROM work_orders wo
      JOIN products p ON wo.product_id = p.id
      JOIN warehouses w ON wo.warehouse_id = w.id
      JOIN bill_of_materials b ON wo.bom_id = b.id
      LEFT JOIN users u ON wo.created_by = u.id
      ${whereClause}
      ORDER BY 
        CASE wo.priority 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END ASC,
        wo.created_at DESC
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

router.get('/work-orders/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const woRes = await pool.query(`
      SELECT 
        wo.*,
        p.name AS product_name,
        p.sku AS product_sku,
        p.uom_code,
        w.name AS warehouse_name,
        sw.name AS source_warehouse_name,
        b.bom_number,
        b.name AS bom_name,
        u.full_name AS creator_name
      FROM work_orders wo
      JOIN products p ON wo.product_id = p.id
      JOIN warehouses w ON wo.warehouse_id = w.id
      JOIN warehouses sw ON wo.source_warehouse_id = sw.id
      JOIN bill_of_materials b ON wo.bom_id = b.id
      LEFT JOIN users u ON wo.created_by = u.id
      WHERE wo.id = $1;
    `, [id]);

    if (woRes.rows.length === 0) return res.status(404).json({ error: 'Work order not found.' });

    const materialsRes = await pool.query(`
      SELECT 
        wom.*,
        p.sku,
        p.name AS product_name,
        p.uom_code,
        (wom.planned_quantity - wom.issued_quantity)::numeric(15, 4) AS remaining_issue_quantity,
        COALESCE(sl.available_stock, 0)::numeric(15, 4) AS warehouse_available_stock
      FROM work_order_materials wom
      JOIN products p ON wom.product_id = p.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity - reserved_quantity) as available_stock
        FROM stock_levels
        WHERE warehouse_id = $2
        GROUP BY product_id
      ) sl ON sl.product_id = p.id
      WHERE wom.work_order_id = $1
      ORDER BY wom.id ASC;
    `, [id, woRes.rows[0].source_warehouse_id]);

    const downtimeRes = await pool.query(`
      SELECT md.*, u.full_name AS logged_by_name
      FROM machine_downtime md
      LEFT JOIN users u ON md.logged_by = u.id
      WHERE md.work_order_id = $1
      ORDER BY md.start_time DESC;
    `, [id]);

    res.json({
      workOrder: woRes.rows[0],
      materials: materialsRes.rows,
      downtime: downtimeRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// CREATE Work Order from BOM
router.post('/work-orders', requireRoles('admin', 'production'), async (req, res, next) => {
  try {
    const {
      bom_id,
      warehouse_id,
      source_warehouse_id,
      sales_order_id,
      priority = 'medium',
      planned_quantity,
      planned_start_date,
      planned_end_date,
      batch_number,
      notes
    } = req.body;

    const plannedQty = Number(planned_quantity);
    if (!bom_id || !warehouse_id || !source_warehouse_id || !plannedQty || plannedQty <= 0) {
      return res.status(400).json({ error: 'BOM, target warehouse, source warehouse, and positive planned quantity are required.' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch BOM and its items
      const { rows: bomRows } = await client.query('SELECT * FROM bill_of_materials WHERE id = $1', [bom_id]);
      if (bomRows.length === 0) throw new Error('BOM not found.');
      const bom = bomRows[0];

      const { rows: bomItems } = await client.query('SELECT * FROM bom_items WHERE bom_id = $1', [bom_id]);
      if (bomItems.length === 0) throw new Error('Selected BOM has no component line items.');

      const woNumber = await getNextDocNumber('WO', client);
      const generatedBatch = batch_number || `BATCH-${woNumber}`;

      // 2. Insert work order
      const { rows: woRows } = await client.query(`
        INSERT INTO work_orders (
          wo_number, bom_id, product_id, warehouse_id, source_warehouse_id,
          sales_order_id, status, priority, planned_quantity, completed_quantity, scrapped_quantity,
          planned_start_date, planned_end_date, batch_number, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7, $8, 0, 0, $9, $10, $11, $12, $13)
        RETURNING *;
      `, [
        woNumber,
        bom.id,
        bom.product_id,
        warehouse_id,
        source_warehouse_id,
        sales_order_id || null,
        priority,
        plannedQty,
        planned_start_date || null,
        planned_end_date || null,
        generatedBatch,
        notes || '',
        req.user.id
      ]);

      const woId = woRows[0].id;

      // 3. Populate planned materials (scaling by BOM output_quantity ratio)
      const ratio = plannedQty / Number(bom.output_quantity);

      for (const item of bomItems) {
        const requiredQty = Number(item.quantity) * ratio * (1 + Number(item.scrap_factor || 0) / 100);

        // Fetch component unit cost
        const { rows: prodCost } = await client.query('SELECT unit_cost FROM products WHERE id = $1', [item.product_id]);
        const cost = prodCost.length > 0 ? Number(prodCost[0].unit_cost) : 0;

        await client.query(`
          INSERT INTO work_order_materials (
            work_order_id, product_id, planned_quantity, allocated_quantity, issued_quantity, unit_cost
          )
          VALUES ($1, $2, $3, $3, 0, $4);
        `, [woId, item.product_id, requiredQty.toFixed(4), cost]);

        // Reserve materials in stock_levels
        await client.query(`
          UPDATE stock_levels
          SET reserved_quantity = reserved_quantity + $1, updated_at = NOW()
          WHERE product_id = $2 AND warehouse_id = $3;
        `, [requiredQty, item.product_id, source_warehouse_id]);
      }

      return woRows[0];
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CREATE_WORK_ORDER',
      entityType: 'WORK_ORDER',
      entityId: result.id,
      details: { wo_number: result.wo_number, planned_quantity: plannedQty },
      req
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Update Work Order Status (release to floor / start / cancel)
router.put('/work-orders/:id/status', requireRoles('admin', 'production'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['planned', 'released', 'in_progress', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status can only be updated to: ${validStatuses.join(', ')}` });
    }

    let updateSql = 'UPDATE work_orders SET status = $1, updated_at = NOW()';
    const params = [status];

    if (status === 'in_progress') {
      updateSql += ', actual_start_date = COALESCE(actual_start_date, NOW())';
    }

    params.push(id);
    updateSql += ` WHERE id = $${params.length} RETURNING *;`;

    const { rows } = await pool.query(updateSql, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Work order not found.' });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ISSUE RAW MATERIALS TO PRODUCTION FLOOR (Deducts stock & unreserves)
router.post('/work-orders/:id/issue-materials', requireRoles('admin', 'production', 'warehouse'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items } = req.body; // [{ material_id, product_id, location_id, batch_number, quantity }]

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one material issue line is required.' });
    }

    const result = await withTransaction(async (client) => {
      const { rows: woRows } = await client.query('SELECT * FROM work_orders WHERE id = $1 FOR UPDATE', [id]);
      if (woRows.length === 0) throw new Error('Work order not found.');
      const wo = woRows[0];

      if (['completed', 'cancelled'].includes(wo.status)) {
        throw new Error(`Cannot issue materials for work order with status '${wo.status}'.`);
      }

      for (const item of items) {
        const qtyToIssue = Number(item.quantity);
        if (qtyToIssue <= 0) continue;

        const { rows: matRows } = await client.query(`
          SELECT * FROM work_order_materials WHERE id = $1 AND work_order_id = $2 FOR UPDATE;
        `, [item.material_id, id]);

        if (matRows.length === 0) throw new Error(`Material line #${item.material_id} not found.`);
        const mat = matRows[0];

        const batchNum = (item.batch_number || '').trim();

        // Check & lock stock
        const { rows: stockRows } = await client.query(`
          SELECT id, quantity, reserved_quantity
          FROM stock_levels
          WHERE product_id = $1 AND warehouse_id = $2
            AND (location_id = $3 OR ($3 IS NULL AND location_id IS NULL))
            AND batch_number = $4
          FOR UPDATE;
        `, [mat.product_id, wo.source_warehouse_id, item.location_id || null, batchNum]);

        if (stockRows.length === 0) {
          throw new Error(`No stock found for product ID ${mat.product_id} in source warehouse.`);
        }

        const currentStock = Number(stockRows[0].quantity);
        if (currentStock < qtyToIssue) {
          throw new Error(`Insufficient stock for product ID ${mat.product_id}. Available: ${currentStock}, Required: ${qtyToIssue}`);
        }

        // Deduct quantity and unreserve
        const reservedToRelease = Math.min(Number(stockRows[0].reserved_quantity), qtyToIssue);
        await client.query(`
          UPDATE stock_levels
          SET 
            quantity = quantity - $1,
            reserved_quantity = GREATEST(0, reserved_quantity - $2),
            updated_at = NOW()
          WHERE id = $3;
        `, [qtyToIssue, reservedToRelease, stockRows[0].id]);

        // Update work_order_materials
        await client.query(`
          UPDATE work_order_materials
          SET issued_quantity = issued_quantity + $1
          WHERE id = $2;
        `, [qtyToIssue, mat.id]);

        // Record stock movement ledger
        const movCode = await getNextDocNumber('MOV', client);
        const unitCost = Number(mat.unit_cost);
        await client.query(`
          INSERT INTO stock_movements (
            movement_code, movement_type, product_id, warehouse_id, location_id,
            batch_number, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by
          )
          VALUES ($1, 'production_issue', $2, $3, $4, $5, $6, $7, $8, 'work_order', $9, $10, $11);
        `, [
          movCode,
          mat.product_id,
          wo.source_warehouse_id,
          item.location_id || null,
          batchNum,
          -qtyToIssue,
          unitCost,
          (qtyToIssue * unitCost).toFixed(4),
          wo.wo_number,
          `Material issued for WO #${wo.wo_number}`,
          req.user.id
        ]);
      }

      // If work order was 'planned' or 'released', transition to 'in_progress'
      if (['planned', 'released'].includes(wo.status)) {
        await client.query(`
          UPDATE work_orders
          SET status = 'in_progress', actual_start_date = COALESCE(actual_start_date, NOW())
          WHERE id = $1;
        `, [id]);
      }

      return { success: true };
    });

    res.json({ message: 'Materials issued to production successfully.', ...result });
  } catch (err) {
    next(err);
  }
});

// RECORD PRODUCTION COMPLETION & SCRAP (Adds finished goods to inventory)
router.post('/work-orders/:id/complete', requireRoles('admin', 'production'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      completed_quantity,
      scrapped_quantity = 0,
      location_id,
      batch_number,
      notes
    } = req.body;

    const compQty = Number(completed_quantity);
    const scrapQty = Number(scrapped_quantity || 0);

    if (compQty <= 0 && scrapQty <= 0) {
      return res.status(400).json({ error: 'Must specify positive completed or scrapped quantity.' });
    }

    const result = await withTransaction(async (client) => {
      const { rows: woRows } = await client.query('SELECT * FROM work_orders WHERE id = $1 FOR UPDATE', [id]);
      if (woRows.length === 0) throw new Error('Work order not found.');
      const wo = woRows[0];

      if (wo.status === 'completed' || wo.status === 'cancelled') {
        throw new Error(`Work order is already ${wo.status}.`);
      }

      const totalCompleted = Number(wo.completed_quantity) + compQty;
      const totalScrapped = Number(wo.scrapped_quantity) + scrapQty;
      const planned = Number(wo.planned_quantity);
      const isFinished = (totalCompleted + totalScrapped) >= planned;

      // Update work order
      await client.query(`
        UPDATE work_orders
        SET 
          completed_quantity = $1,
          scrapped_quantity = $2,
          status = CASE WHEN $3 = true THEN 'completed' ELSE 'in_progress' END,
          actual_end_date = CASE WHEN $3 = true THEN NOW() ELSE actual_end_date END,
          updated_at = NOW()
        WHERE id = $4;
      `, [totalCompleted, totalScrapped, isFinished, id]);

      // If finished goods were produced, add to target warehouse stock_levels
      if (compQty > 0) {
        const batchNum = batch_number || wo.batch_number || '';

        const { rows: prodRes } = await client.query('SELECT unit_cost FROM products WHERE id = $1', [wo.product_id]);
        const unitCost = prodRes.length > 0 ? Number(prodRes[0].unit_cost) : 0;

        const { rows: stockRows } = await client.query(`
          SELECT id, quantity
          FROM stock_levels
          WHERE product_id = $1 AND warehouse_id = $2
            AND (location_id = $3 OR ($3 IS NULL AND location_id IS NULL))
            AND batch_number = $4
          FOR UPDATE;
        `, [wo.product_id, wo.warehouse_id, location_id || null, batchNum]);

        if (stockRows.length > 0) {
          await client.query(`
            UPDATE stock_levels
            SET quantity = quantity + $1, updated_at = NOW()
            WHERE id = $2;
          `, [compQty, stockRows[0].id]);
        } else {
          await client.query(`
            INSERT INTO stock_levels (product_id, warehouse_id, location_id, batch_number, quantity, reserved_quantity)
            VALUES ($1, $2, $3, $4, $5, 0);
          `, [wo.product_id, wo.warehouse_id, location_id || null, batchNum, compQty]);
        }

        // Record stock_movements ledger
        const movCode = await getNextDocNumber('MOV', client);
        await client.query(`
          INSERT INTO stock_movements (
            movement_code, movement_type, product_id, warehouse_id, location_id,
            batch_number, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by
          )
          VALUES ($1, 'production_receipt', $2, $3, $4, $5, $6, $7, $8, 'work_order', $9, $10, $11);
        `, [
          movCode,
          wo.product_id,
          wo.warehouse_id,
          location_id || null,
          batchNum,
          compQty,
          unitCost,
          (compQty * unitCost).toFixed(4),
          wo.wo_number,
          `Finished goods receipt from WO #${wo.wo_number}`,
          req.user.id
        ]);
      }

      // If scrap occurred, record scrap movement
      if (scrapQty > 0) {
        const movCodeScrap = await getNextDocNumber('MOV', client);
        await client.query(`
          INSERT INTO stock_movements (
            movement_code, movement_type, product_id, warehouse_id, location_id,
            batch_number, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by
          )
          VALUES ($1, 'scrap', $2, $3, $4, $5, $6, 0, 0, 'work_order', $7, $8, $9);
        `, [
          movCodeScrap,
          wo.product_id,
          wo.warehouse_id,
          location_id || null,
          wo.batch_number || '',
          scrapQty,
          wo.wo_number,
          notes || `Production scrap on WO #${wo.wo_number}`,
          req.user.id
        ]);
      }

      return { totalCompleted, totalScrapped, isFinished };
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'PRODUCTION_COMPLETION',
      entityType: 'WORK_ORDER',
      entityId: id,
      details: { completed_quantity: compQty, scrapped_quantity: scrapQty },
      req
    });

    res.json({ message: 'Production completion recorded successfully.', ...result });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 3. MACHINE DOWNTIME
// ----------------------------------------------------

router.get('/downtime', async (req, res, next) => {
  try {
    const { work_order_id } = req.query;
    let query = `
      SELECT md.*, wo.wo_number, u.full_name AS logged_by_name
      FROM machine_downtime md
      LEFT JOIN work_orders wo ON md.work_order_id = wo.id
      LEFT JOIN users u ON md.logged_by = u.id
    `;
    const params = [];
    if (work_order_id) {
      params.push(work_order_id);
      query += ' WHERE md.work_order_id = $1';
    }
    query += ' ORDER BY md.start_time DESC;';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/downtime', requireRoles('admin', 'production'), async (req, res, next) => {
  try {
    const { work_order_id, machine_name, reason, duration_minutes, start_time, notes } = req.body;
    if (!machine_name || !reason || !duration_minutes) {
      return res.status(400).json({ error: 'Machine name, reason, and duration in minutes are required.' });
    }

    const { rows } = await pool.query(`
      INSERT INTO machine_downtime (work_order_id, machine_name, reason, duration_minutes, start_time, notes, logged_by)
      VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, $7)
      RETURNING *;
    `, [work_order_id || null, machine_name, reason, duration_minutes, start_time || null, notes || '', req.user.id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
