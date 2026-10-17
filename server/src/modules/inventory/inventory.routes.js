import { Router } from 'express';
import pool, { withTransaction } from '../../db/connection.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { getNextDocNumber } from '../../utils/docSequence.js';
import { logAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

// ----------------------------------------------------
// 1. PRODUCTS & CATEGORIES
// ----------------------------------------------------

// GET Products with search, filter, pagination
router.get('/products', async (req, res, next) => {
  try {
    const {
      search = '',
      category_id,
      type,
      is_active,
      page = 1,
      limit = 20
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(p.sku ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }

    if (category_id) {
      params.push(parseInt(category_id, 10));
      conditions.push(`p.category_id = $${params.length}`);
    }

    if (type) {
      params.push(type);
      conditions.push(`p.type = $${params.length}`);
    }

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`p.is_active = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*)::int AS total FROM products p ${whereClause};`;
    const countRes = await pool.query(countQuery, params);
    const total = countRes.rows[0].total;

    params.push(parseInt(limit, 10));
    params.push(offset);

    const query = `
      SELECT 
        p.id,
        p.sku,
        p.name,
        p.description,
        p.category_id,
        c.name AS category_name,
        p.type,
        p.uom_code,
        p.reorder_point,
        p.reorder_quantity,
        p.unit_cost,
        p.selling_price,
        p.batch_tracked,
        p.specifications,
        p.is_active,
        p.created_at,
        p.updated_at,
        COALESCE(SUM(sl.quantity), 0)::numeric(15, 4) AS on_hand_quantity,
        COALESCE(SUM(sl.reserved_quantity), 0)::numeric(15, 4) AS reserved_quantity,
        (COALESCE(SUM(sl.quantity), 0) - COALESCE(SUM(sl.reserved_quantity), 0))::numeric(15, 4) AS available_quantity
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      ${whereClause}
      GROUP BY p.id, c.name
      ORDER BY p.name ASC
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

// GET Product by ID with stock breakdown by warehouse
router.get('/products/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const prodQuery = `
      SELECT 
        p.*,
        c.name AS category_name,
        COALESCE(SUM(sl.quantity), 0)::numeric(15, 4) AS total_on_hand,
        COALESCE(SUM(sl.reserved_quantity), 0)::numeric(15, 4) AS total_reserved
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      WHERE p.id = $1
      GROUP BY p.id, c.name;
    `;

    const stockQuery = `
      SELECT 
        sl.id,
        sl.warehouse_id,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        sl.location_id,
        wl.name AS location_name,
        wl.code AS location_code,
        sl.batch_number,
        sl.quantity,
        sl.reserved_quantity,
        (sl.quantity - sl.reserved_quantity) AS available_quantity,
        sl.updated_at
      FROM stock_levels sl
      JOIN warehouses w ON sl.warehouse_id = w.id
      LEFT JOIN warehouse_locations wl ON sl.location_id = wl.id
      WHERE sl.product_id = $1
      ORDER BY w.name, sl.batch_number;
    `;

    const [prodRes, stockRes] = await Promise.all([
      pool.query(prodQuery, [id]),
      pool.query(stockQuery, [id])
    ]);

    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json({
      product: prodRes.rows[0],
      stockLevels: stockRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// CREATE Product
router.post('/products', requireRoles('admin', 'warehouse', 'production'), async (req, res, next) => {
  try {
    const {
      sku,
      name,
      description,
      category_id,
      type,
      uom_code,
      reorder_point = 0,
      reorder_quantity = 0,
      unit_cost = 0,
      selling_price = 0,
      batch_tracked = false,
      specifications = {}
    } = req.body;

    if (!sku || !name || !type || !uom_code) {
      return res.status(400).json({ error: 'SKU, name, product type, and unit of measure (UOM) are required.' });
    }

    const { rows } = await pool.query(`
      INSERT INTO products (
        sku, name, description, category_id, type, uom_code,
        reorder_point, reorder_quantity, unit_cost, selling_price,
        batch_tracked, specifications
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `, [
      sku.trim().toUpperCase(),
      name.trim(),
      description || '',
      category_id || null,
      type,
      uom_code,
      reorder_point,
      reorder_quantity,
      unit_cost,
      selling_price,
      batch_tracked,
      JSON.stringify(specifications)
    ]);

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CREATE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: rows[0].id,
      details: { sku: rows[0].sku, name: rows[0].name },
      req
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// UPDATE Product
router.put('/products/:id', requireRoles('admin', 'warehouse', 'production'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      category_id,
      type,
      uom_code,
      reorder_point,
      reorder_quantity,
      unit_cost,
      selling_price,
      batch_tracked,
      specifications,
      is_active
    } = req.body;

    const { rows } = await pool.query(`
      UPDATE products
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        category_id = COALESCE($3, category_id),
        type = COALESCE($4, type),
        uom_code = COALESCE($5, uom_code),
        reorder_point = COALESCE($6, reorder_point),
        reorder_quantity = COALESCE($7, reorder_quantity),
        unit_cost = COALESCE($8, unit_cost),
        selling_price = COALESCE($9, selling_price),
        batch_tracked = COALESCE($10, batch_tracked),
        specifications = COALESCE($11, specifications),
        is_active = COALESCE($12, is_active),
        updated_at = NOW()
      WHERE id = $13
      RETURNING *;
    `, [
      name, description, category_id, type, uom_code,
      reorder_point, reorder_quantity, unit_cost, selling_price,
      batch_tracked, specifications ? JSON.stringify(specifications) : null,
      is_active, id
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UPDATE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: id,
      details: { name: rows[0].name },
      req
    });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 2. CATEGORIES, UOM, WAREHOUSES, LOCATIONS
// ----------------------------------------------------

router.get('/categories', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY name ASC;');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/categories', requireRoles('admin', 'warehouse'), async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    const { rows } = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *;',
      [name.trim(), description || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/uom', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM units_of_measure ORDER BY code ASC;');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/warehouses', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        w.*,
        COUNT(DISTINCT wl.id)::int AS location_count,
        COALESCE(SUM(sl.quantity), 0)::numeric(15, 2) AS total_units_stored
      FROM warehouses w
      LEFT JOIN warehouse_locations wl ON wl.warehouse_id = w.id
      LEFT JOIN stock_levels sl ON sl.warehouse_id = w.id
      GROUP BY w.id
      ORDER BY w.code ASC;
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/locations', async (req, res, next) => {
  try {
    const { warehouse_id } = req.query;
    let query = `
      SELECT wl.*, w.name AS warehouse_name, w.code AS warehouse_code
      FROM warehouse_locations wl
      JOIN warehouses w ON wl.warehouse_id = w.id
    `;
    const params = [];
    if (warehouse_id) {
      params.push(warehouse_id);
      query += ' WHERE wl.warehouse_id = $1';
    }
    query += ' ORDER BY w.code, wl.code ASC;';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 3. AUDITABLE INVENTORY MOVEMENTS LEDGER & OPERATIONS
// ----------------------------------------------------

// GET Movement Ledger with filters and pagination
router.get('/movements', async (req, res, next) => {
  try {
    const {
      product_id,
      warehouse_id,
      movement_type,
      start_date,
      end_date,
      search,
      page = 1,
      limit = 25
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    if (product_id) {
      params.push(parseInt(product_id, 10));
      conditions.push(`sm.product_id = $${params.length}`);
    }

    if (warehouse_id) {
      params.push(parseInt(warehouse_id, 10));
      conditions.push(`sm.warehouse_id = $${params.length}`);
    }

    if (movement_type) {
      params.push(movement_type);
      conditions.push(`sm.movement_type = $${params.length}`);
    }

    if (start_date) {
      params.push(start_date);
      conditions.push(`sm.created_at >= $${params.length}::timestamptz`);
    }

    if (end_date) {
      params.push(end_date);
      conditions.push(`sm.created_at <= ($${params.length}::date + interval '1 day')`);
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(sm.movement_code ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.name ILIKE $${params.length} OR sm.reference_id ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS total 
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      ${whereClause};
    `;
    const countRes = await pool.query(countQuery, params);
    const total = countRes.rows[0].total;

    params.push(parseInt(limit, 10));
    params.push(offset);

    const query = `
      SELECT 
        sm.*,
        p.sku,
        p.name AS product_name,
        p.uom_code,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        wl.code AS location_code,
        u.full_name AS user_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN warehouses w ON sm.warehouse_id = w.id
      LEFT JOIN warehouse_locations wl ON sm.location_id = wl.id
      LEFT JOIN users u ON sm.created_by = u.id
      ${whereClause}
      ORDER BY sm.created_at DESC
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

// LOW STOCK ALERT LIST
router.get('/low-stock', async (req, res, next) => {
  try {
    const query = `
      SELECT 
        p.id,
        p.sku,
        p.name,
        p.uom_code,
        p.reorder_point,
        p.reorder_quantity,
        p.unit_cost,
        c.name AS category_name,
        COALESCE(SUM(sl.quantity), 0)::numeric(15, 4) AS current_stock,
        (p.reorder_point - COALESCE(SUM(sl.quantity), 0))::numeric(15, 4) AS deficit
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      WHERE p.is_active = true AND p.reorder_point > 0
      GROUP BY p.id, c.name
      HAVING COALESCE(SUM(sl.quantity), 0) <= p.reorder_point
      ORDER BY deficit DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST Manual Stock Adjustment (Add or Subtract with audit ledger)
router.post('/adjust', requireRoles('admin', 'warehouse'), async (req, res, next) => {
  try {
    const {
      product_id,
      warehouse_id,
      location_id,
      batch_number = '',
      adjustment_type, // 'add' or 'subtract'
      quantity,
      reason,
      unit_cost
    } = req.body;

    const qty = Number(quantity);
    if (!product_id || !warehouse_id || !qty || qty <= 0 || !reason) {
      return res.status(400).json({ error: 'Product, warehouse, positive quantity, and reason are required.' });
    }

    if (!['add', 'subtract'].includes(adjustment_type)) {
      return res.status(400).json({ error: "adjustment_type must be either 'add' or 'subtract'." });
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch product unit cost if not provided
      let cost = unit_cost;
      if (cost === undefined || cost === null) {
        const prodRes = await client.query('SELECT unit_cost FROM products WHERE id = $1', [product_id]);
        if (prodRes.rows.length === 0) throw new Error('Product not found');
        cost = Number(prodRes.rows[0].unit_cost);
      }

      const movementCode = await getNextDocNumber('ADJ', client);
      const movementType = adjustment_type === 'add' ? 'adjustment_add' : 'adjustment_subtract';
      const netQty = adjustment_type === 'add' ? qty : -qty;

      // 2. Lock and check existing stock
      const stockRes = await client.query(`
        SELECT id, quantity, reserved_quantity
        FROM stock_levels
        WHERE product_id = $1 AND warehouse_id = $2 
          AND (location_id = $3 OR ($3 IS NULL AND location_id IS NULL))
          AND batch_number = $4
        FOR UPDATE;
      `, [product_id, warehouse_id, location_id || null, batch_number.trim()]);

      if (adjustment_type === 'subtract') {
        const available = stockRes.rows.length > 0 ? (Number(stockRes.rows[0].quantity) - Number(stockRes.rows[0].reserved_quantity)) : 0;
        if (available < qty) {
          const err = new Error(`Insufficient available stock for subtraction. Current available: ${available}, Requested: ${qty}`);
          err.statusCode = 400;
          throw err;
        }
      }

      // 3. Update stock_levels
      if (stockRes.rows.length > 0) {
        await client.query(`
          UPDATE stock_levels
          SET quantity = quantity + $1, updated_at = NOW()
          WHERE id = $2;
        `, [netQty, stockRes.rows[0].id]);
      } else {
        await client.query(`
          INSERT INTO stock_levels (product_id, warehouse_id, location_id, batch_number, quantity, reserved_quantity)
          VALUES ($1, $2, $3, $4, $5, 0);
        `, [product_id, warehouse_id, location_id || null, batch_number.trim(), netQty]);
      }

      // 4. Record to ledger
      const totalCost = (Math.abs(netQty) * Number(cost)).toFixed(4);
      await client.query(`
        INSERT INTO stock_movements (
          movement_code, movement_type, product_id, warehouse_id, location_id,
          batch_number, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual_adjustment', $1, $10, $11);
      `, [
        movementCode,
        movementType,
        product_id,
        warehouse_id,
        location_id || null,
        batch_number.trim(),
        netQty,
        cost,
        totalCost,
        reason,
        req.user.id
      ]);

      return { movementCode, netQty, adjustmentType: adjustment_type };
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'STOCK_ADJUSTMENT',
      entityType: 'STOCK',
      entityId: result.movementCode,
      details: { product_id, warehouse_id, adjustment_type, quantity: qty, reason },
      req
    });

    res.json({ message: 'Stock adjustment posted successfully', ...result });
  } catch (err) {
    next(err);
  }
});

// POST Warehouse Stock Transfer (Atomic transfer in single transaction)
router.post('/transfer', requireRoles('admin', 'warehouse'), async (req, res, next) => {
  try {
    const {
      product_id,
      source_warehouse_id,
      source_location_id,
      target_warehouse_id,
      target_location_id,
      batch_number = '',
      quantity,
      notes
    } = req.body;

    const qty = Number(quantity);
    if (!product_id || !source_warehouse_id || !target_warehouse_id || !qty || qty <= 0) {
      return res.status(400).json({ error: 'Source and target warehouse, product, and positive quantity are required.' });
    }

    if (source_warehouse_id === target_warehouse_id && source_location_id === target_location_id) {
      return res.status(400).json({ error: 'Source and target location cannot be identical.' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch product unit cost
      const prodRes = await client.query('SELECT unit_cost FROM products WHERE id = $1', [product_id]);
      if (prodRes.rows.length === 0) throw new Error('Product not found');
      const unitCost = Number(prodRes.rows[0].unit_cost);

      // 2. Lock source stock
      const sourceStockRes = await client.query(`
        SELECT id, quantity, reserved_quantity
        FROM stock_levels
        WHERE product_id = $1 AND warehouse_id = $2
          AND (location_id = $3 OR ($3 IS NULL AND location_id IS NULL))
          AND batch_number = $4
        FOR UPDATE;
      `, [product_id, source_warehouse_id, source_location_id || null, batch_number.trim()]);

      if (sourceStockRes.rows.length === 0) {
        throw new Error('No stock record exists at source location.');
      }

      const available = Number(sourceStockRes.rows[0].quantity) - Number(sourceStockRes.rows[0].reserved_quantity);
      if (available < qty) {
        throw new Error(`Insufficient stock at source. Available: ${available}, Required: ${qty}`);
      }

      // Deduct from source
      await client.query(`
        UPDATE stock_levels
        SET quantity = quantity - $1, updated_at = NOW()
        WHERE id = $2;
      `, [qty, sourceStockRes.rows[0].id]);

      // Lock or insert target stock
      const targetStockRes = await client.query(`
        SELECT id, quantity
        FROM stock_levels
        WHERE product_id = $1 AND warehouse_id = $2
          AND (location_id = $3 OR ($3 IS NULL AND location_id IS NULL))
          AND batch_number = $4
        FOR UPDATE;
      `, [product_id, target_warehouse_id, target_location_id || null, batch_number.trim()]);

      if (targetStockRes.rows.length > 0) {
        await client.query(`
          UPDATE stock_levels
          SET quantity = quantity + $1, updated_at = NOW()
          WHERE id = $2;
        `, [qty, targetStockRes.rows[0].id]);
      } else {
        await client.query(`
          INSERT INTO stock_levels (product_id, warehouse_id, location_id, batch_number, quantity, reserved_quantity)
          VALUES ($1, $2, $3, $4, $5, 0);
        `, [product_id, target_warehouse_id, target_location_id || null, batch_number.trim(), qty]);
      }

      // Generate movement codes
      const outCode = await getNextDocNumber('MOV', client);
      const inCode = await getNextDocNumber('MOV', client);
      const totalCost = (qty * unitCost).toFixed(4);

      // Record Transfer Out
      await client.query(`
        INSERT INTO stock_movements (
          movement_code, movement_type, product_id, warehouse_id, location_id,
          batch_number, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by
        )
        VALUES ($1, 'transfer_out', $2, $3, $4, $5, $6, $7, $8, 'transfer', $9, $10, $11);
      `, [
        outCode, product_id, source_warehouse_id, source_location_id || null,
        batch_number.trim(), -qty, unitCost, totalCost, inCode,
        notes || `Transfer to target warehouse #${target_warehouse_id}`, req.user.id
      ]);

      // Record Transfer In
      await client.query(`
        INSERT INTO stock_movements (
          movement_code, movement_type, product_id, warehouse_id, location_id,
          batch_number, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by
        )
        VALUES ($1, 'transfer_in', $2, $3, $4, $5, $6, $7, $8, 'transfer', $9, $10, $11);
      `, [
        inCode, product_id, target_warehouse_id, target_location_id || null,
        batch_number.trim(), qty, unitCost, totalCost, outCode,
        notes || `Transfer from source warehouse #${source_warehouse_id}`, req.user.id
      ]);

      return { outCode, inCode, transferredQuantity: qty };
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'STOCK_TRANSFER',
      entityType: 'STOCK',
      entityId: result.outCode,
      details: { product_id, source_warehouse_id, target_warehouse_id, quantity: qty },
      req
    });

    res.json({ message: 'Stock transfer completed successfully', ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
