import { Router } from 'express';
import pool, { withTransaction } from '../../db/connection.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { getNextDocNumber } from '../../utils/docSequence.js';
import { logAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

// ----------------------------------------------------
// 1. CUSTOMERS
// ----------------------------------------------------

router.get('/customers', async (req, res, next) => {
  try {
    const { search = '', is_active } = req.query;
    let query = `
      SELECT 
        c.*,
        COUNT(DISTINCT so.id)::int AS order_count,
        COALESCE(SUM(so.total_amount), 0)::numeric(15, 2) AS total_revenue
      FROM customers c
      LEFT JOIN sales_orders so ON so.customer_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(c.code ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.contact_name ILIKE $${params.length})`);
    }

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`c.is_active = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' GROUP BY c.id ORDER BY c.name ASC;';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/customers', requireRoles('admin', 'sales'), async (req, res, next) => {
  try {
    const { code, name, contact_name, email, phone, billing_address, shipping_address, tax_id, payment_terms = 'Net 30', credit_limit = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required.' });

    let custCode = code;
    if (!custCode) {
      const countRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM customers');
      custCode = `CUST-${String(countRes.rows[0].cnt + 1).padStart(3, '0')}`;
    }

    const { rows } = await pool.query(`
      INSERT INTO customers (code, name, contact_name, email, phone, billing_address, shipping_address, tax_id, payment_terms, credit_limit)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `, [custCode.trim().toUpperCase(), name.trim(), contact_name || '', email || '', phone || '', billing_address || '', shipping_address || '', tax_id || '', payment_terms, credit_limit]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 2. SALES ORDERS
// ----------------------------------------------------

router.get('/orders', async (req, res, next) => {
  try {
    const { status, customer_id, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`so.status = $${params.length}`);
    }

    if (customer_id) {
      params.push(parseInt(customer_id, 10));
      conditions.push(`so.customer_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(so.so_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id
      ${whereClause};
    `, params);
    const total = countRes.rows[0].total;

    params.push(parseInt(limit, 10));
    params.push(offset);

    const query = `
      SELECT 
        so.*,
        c.name AS customer_name,
        c.code AS customer_code,
        u.full_name AS creator_name,
        COUNT(soi.id)::int AS line_item_count
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id
      LEFT JOIN users u ON so.created_by = u.id
      LEFT JOIN sales_order_items soi ON soi.sales_order_id = so.id
      ${whereClause}
      GROUP BY so.id, c.name, c.code, u.full_name
      ORDER BY so.created_at DESC
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

router.get('/orders/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const soRes = await pool.query(`
      SELECT 
        so.*,
        c.name AS customer_name,
        c.code AS customer_code,
        c.email AS customer_email,
        c.phone AS customer_phone,
        c.billing_address,
        c.shipping_address,
        u.full_name AS creator_name
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id
      LEFT JOIN users u ON so.created_by = u.id
      WHERE so.id = $1;
    `, [id]);

    if (soRes.rows.length === 0) return res.status(404).json({ error: 'Sales order not found.' });

    const itemsRes = await pool.query(`
      SELECT 
        soi.*,
        p.sku,
        p.name AS product_name,
        p.uom_code,
        (soi.quantity - soi.delivered_quantity)::numeric(15, 4) AS remaining_delivery_quantity
      FROM sales_order_items soi
      JOIN products p ON soi.product_id = p.id
      WHERE soi.sales_order_id = $1
      ORDER BY soi.id ASC;
    `, [id]);

    const delivRes = await pool.query(`
      SELECT d.*, w.name AS warehouse_name
      FROM deliveries d
      JOIN warehouses w ON d.warehouse_id = w.id
      WHERE d.sales_order_id = $1
      ORDER BY d.created_at DESC;
    `, [id]);

    const invRes = await pool.query(`
      SELECT * FROM invoices WHERE sales_order_id = $1 ORDER BY created_at DESC;
    `, [id]);

    res.json({
      order: soRes.rows[0],
      items: itemsRes.rows,
      deliveries: delivRes.rows,
      invoices: invRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// CREATE Sales Order
router.post('/orders', requireRoles('admin', 'sales'), async (req, res, next) => {
  try {
    const { customer_id, delivery_date, notes, items, is_quote = false } = req.body;

    if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Customer and at least one order line item are required.' });
    }

    const result = await withTransaction(async (client) => {
      const soNumber = await getNextDocNumber('SO', client);

      let subtotal = 0;
      let totalDiscount = 0;
      let totalTax = 0;

      for (const item of items) {
        const qty = Number(item.quantity);
        const price = Number(item.unit_price);
        const discPct = Number(item.discount_percent || 0);
        const taxRate = Number(item.tax_rate || 0);

        if (!item.product_id || qty <= 0 || price < 0) {
          throw new Error('Valid product, positive quantity, and non-negative price required on every line.');
        }

        const lineGross = qty * price;
        const lineDisc = lineGross * (discPct / 100);
        const lineNet = lineGross - lineDisc;
        const lineTax = lineNet * (taxRate / 100);

        subtotal += lineGross;
        totalDiscount += lineDisc;
        totalTax += lineTax;
      }

      const totalAmount = subtotal - totalDiscount + totalTax;
      const initialStatus = is_quote ? 'quotation' : 'confirmed';

      const { rows: soRows } = await client.query(`
        INSERT INTO sales_orders (
          so_number, customer_id, status, order_date, delivery_date,
          subtotal, discount_amount, tax_amount, total_amount, notes, created_by
        )
        VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `, [
        soNumber,
        customer_id,
        initialStatus,
        delivery_date || null,
        subtotal.toFixed(4),
        totalDiscount.toFixed(4),
        totalTax.toFixed(4),
        totalAmount.toFixed(4),
        notes || '',
        req.user.id
      ]);

      const soId = soRows[0].id;

      for (const item of items) {
        const qty = Number(item.quantity);
        const price = Number(item.unit_price);
        const discPct = Number(item.discount_percent || 0);
        const taxRate = Number(item.tax_rate || 0);
        const lineTotal = (qty * price) * (1 - discPct / 100) * (1 + taxRate / 100);

        await client.query(`
          INSERT INTO sales_order_items (
            sales_order_id, product_id, quantity, delivered_quantity,
            unit_price, discount_percent, tax_rate, line_total
          )
          VALUES ($1, $2, $3, 0, $4, $5, $6, $7);
        `, [soId, item.product_id, qty, price, discPct, taxRate, lineTotal.toFixed(4)]);
      }

      return soRows[0];
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CREATE_SO',
      entityType: 'SALES_ORDER',
      entityId: result.id,
      details: { so_number: result.so_number, total: result.total_amount },
      req
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Update Sales Order Status
router.put('/orders/:id/status', requireRoles('admin', 'sales'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['quotation', 'confirmed', 'in_production', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` });
    }

    const { rows } = await pool.query(`
      UPDATE sales_orders
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `, [status, id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Sales order not found.' });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 3. FULFILLMENT & DELIVERIES (Stock Deduction)
// ----------------------------------------------------

router.post('/deliveries', requireRoles('admin', 'warehouse', 'sales'), async (req, res, next) => {
  try {
    const {
      sales_order_id,
      warehouse_id,
      tracking_number,
      notes,
      items // [{ so_item_id, product_id, location_id, batch_number, quantity }]
    } = req.body;

    if (!sales_order_id || !warehouse_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sales order, warehouse, and delivery items are required.' });
    }

    const deliveryResult = await withTransaction(async (client) => {
      // 1. Lock and check SO
      const { rows: soRows } = await client.query(`
        SELECT id, so_number, customer_id, status
        FROM sales_orders
        WHERE id = $1
        FOR UPDATE;
      `, [sales_order_id]);

      if (soRows.length === 0) throw new Error('Sales order not found.');
      const so = soRows[0];

      if (['cancelled', 'completed'].includes(so.status)) {
        throw new Error(`Cannot ship order with status '${so.status}'.`);
      }

      const deliveryNumber = await getNextDocNumber('DEL', client);

      const { rows: delRows } = await client.query(`
        INSERT INTO deliveries (
          delivery_number, sales_order_id, customer_id, warehouse_id,
          delivery_date, tracking_number, status, notes, created_by
        )
        VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, 'shipped', $6, $7)
        RETURNING *;
      `, [
        deliveryNumber,
        so.id,
        so.customer_id,
        warehouse_id,
        tracking_number || '',
        notes || '',
        req.user.id
      ]);

      const deliveryId = delRows[0].id;

      for (const item of items) {
        const qtyToShip = Number(item.quantity);
        if (qtyToShip <= 0) continue;

        // Fetch SO item
        const { rows: soItemRows } = await client.query(`
          SELECT id, product_id, quantity, delivered_quantity, unit_price
          FROM sales_order_items
          WHERE id = $1 AND sales_order_id = $2
          FOR UPDATE;
        `, [item.so_item_id, so.id]);

        if (soItemRows.length === 0) throw new Error(`SO line item #${item.so_item_id} not found.`);
        const soItem = soItemRows[0];

        const remainingToDeliver = Number(soItem.quantity) - Number(soItem.delivered_quantity);
        if (qtyToShip > remainingToDeliver) {
          throw new Error(`Shipment quantity (${qtyToShip}) exceeds remaining order quantity (${remainingToDeliver}).`);
        }

        const batchNum = (item.batch_number || '').trim();

        // Check & lock stock in warehouse
        const { rows: stockRows } = await client.query(`
          SELECT id, quantity, reserved_quantity
          FROM stock_levels
          WHERE product_id = $1 AND warehouse_id = $2
            AND (location_id = $3 OR ($3 IS NULL AND location_id IS NULL))
            AND batch_number = $4
          FOR UPDATE;
        `, [soItem.product_id, warehouse_id, item.location_id || null, batchNum]);

        if (stockRows.length === 0) {
          throw new Error(`No stock found in selected warehouse/location for product ID ${soItem.product_id}.`);
        }

        const available = Number(stockRows[0].quantity) - Number(stockRows[0].reserved_quantity);
        if (available < qtyToShip) {
          throw new Error(`Insufficient available stock to deliver. Available: ${available}, Required: ${qtyToShip}`);
        }

        // Deduct from stock_levels
        await client.query(`
          UPDATE stock_levels
          SET quantity = quantity - $1, updated_at = NOW()
          WHERE id = $2;
        `, [qtyToShip, stockRows[0].id]);

        // Insert into delivery_items
        await client.query(`
          INSERT INTO delivery_items (delivery_id, so_item_id, product_id, location_id, batch_number, quantity)
          VALUES ($1, $2, $3, $4, $5, $6);
        `, [deliveryId, soItem.id, soItem.product_id, item.location_id || null, batchNum, qtyToShip]);

        // Update SO item delivered quantity
        await client.query(`
          UPDATE sales_order_items
          SET delivered_quantity = delivered_quantity + $1
          WHERE id = $2;
        `, [qtyToShip, soItem.id]);

        // Fetch product unit cost for movement ledger
        const { rows: prodCost } = await client.query('SELECT unit_cost FROM products WHERE id = $1', [soItem.product_id]);
        const cost = Number(prodCost[0].unit_cost);

        // Record stock_movements ledger deduction
        const movCode = await getNextDocNumber('MOV', client);
        await client.query(`
          INSERT INTO stock_movements (
            movement_code, movement_type, product_id, warehouse_id, location_id,
            batch_number, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by
          )
          VALUES ($1, 'issue', $2, $3, $4, $5, $6, $7, $8, 'sales_delivery', $9, $10, $11);
        `, [
          movCode,
          soItem.product_id,
          warehouse_id,
          item.location_id || null,
          batchNum,
          -qtyToShip,
          cost,
          (qtyToShip * cost).toFixed(4),
          deliveryNumber,
          `Delivery for SO #${so.so_number}`,
          req.user.id
        ]);
      }

      // Check if all lines are delivered
      const { rows: deliveryCheck } = await client.query(`
        SELECT 
          COUNT(*)::int AS total_items,
          COUNT(CASE WHEN delivered_quantity >= quantity THEN 1 END)::int AS delivered_items
        FROM sales_order_items
        WHERE sales_order_id = $1;
      `, [so.id]);

      const allDelivered = deliveryCheck[0].total_items === deliveryCheck[0].delivered_items;
      const nextStatus = allDelivered ? 'completed' : 'partially_delivered';

      await client.query(`
        UPDATE sales_orders
        SET status = $1, updated_at = NOW()
        WHERE id = $2;
      `, [nextStatus, so.id]);

      return {
        delivery: delRows[0],
        newSoStatus: nextStatus
      };
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELIVERY_DISPATCHED',
      entityType: 'DELIVERY',
      entityId: deliveryResult.delivery.id,
      details: { delivery_number: deliveryResult.delivery.delivery_number, sales_order_id },
      req
    });

    res.status(201).json({
      message: 'Delivery dispatched and inventory deducted successfully.',
      ...deliveryResult
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 4. INVOICES
// ----------------------------------------------------

router.get('/invoices', async (req, res, next) => {
  try {
    const { status, customer_id } = req.query;
    let query = `
      SELECT 
        inv.*,
        c.name AS customer_name,
        c.code AS customer_code,
        so.so_number
      FROM invoices inv
      JOIN customers c ON inv.customer_id = c.id
      LEFT JOIN sales_orders so ON inv.sales_order_id = so.id
    `;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`inv.status = $${params.length}`);
    }
    if (customer_id) {
      params.push(customer_id);
      conditions.push(`inv.customer_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY inv.created_at DESC;';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/invoices', requireRoles('admin', 'sales'), async (req, res, next) => {
  try {
    const { sales_order_id, customer_id, due_date, total_amount, notes } = req.body;
    if (!customer_id || !due_date || !total_amount) {
      return res.status(400).json({ error: 'Customer, due date, and total amount are required.' });
    }

    const invNum = await getNextDocNumber('INV');

    const { rows } = await pool.query(`
      INSERT INTO invoices (invoice_number, sales_order_id, customer_id, status, issue_date, due_date, total_amount, paid_amount, notes, created_by)
      VALUES ($1, $2, $3, 'unpaid', CURRENT_DATE, $4, $5, 0, $6, $7)
      RETURNING *;
    `, [invNum, sales_order_id || null, customer_id, due_date, total_amount, notes || '', req.user.id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/invoices/:id/payment', requireRoles('admin', 'sales'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount_paid, payment_method, payment_reference } = req.body;

    const payment = Number(amount_paid);
    if (!payment || payment <= 0) {
      return res.status(400).json({ error: 'Valid positive payment amount is required.' });
    }

    const { rows: invRows } = await pool.query('SELECT total_amount, paid_amount FROM invoices WHERE id = $1', [id]);
    if (invRows.length === 0) return res.status(404).json({ error: 'Invoice not found.' });

    const newPaid = Number(invRows[0].paid_amount) + payment;
    const total = Number(invRows[0].total_amount);
    const newStatus = newPaid >= total ? 'paid' : 'partially_paid';

    const { rows } = await pool.query(`
      UPDATE invoices
      SET 
        paid_amount = $1,
        status = $2,
        payment_method = COALESCE($3, payment_method),
        payment_reference = COALESCE($4, payment_reference)
      WHERE id = $5
      RETURNING *;
    `, [newPaid.toFixed(4), newStatus, payment_method, payment_reference, id]);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
