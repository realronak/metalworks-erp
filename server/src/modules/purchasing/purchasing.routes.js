import { Router } from 'express';
import pool, { withTransaction } from '../../db/connection.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { getNextDocNumber } from '../../utils/docSequence.js';
import { logAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

// ----------------------------------------------------
// 1. SUPPLIERS
// ----------------------------------------------------

router.get('/suppliers', async (req, res, next) => {
  try {
    const { search = '', is_active } = req.query;
    let query = `
      SELECT 
        s.*,
        COUNT(DISTINCT po.id)::int AS po_count,
        COALESCE(SUM(po.total_amount), 0)::numeric(15, 2) AS total_spend
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id
    `;
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(s.code ILIKE $${params.length} OR s.name ILIKE $${params.length} OR s.contact_name ILIKE $${params.length})`);
    }

    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`s.is_active = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' GROUP BY s.id ORDER BY s.name ASC;';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/suppliers', requireRoles('admin', 'purchasing'), async (req, res, next) => {
  try {
    const { code, name, contact_name, email, phone, address, tax_id, payment_terms = 'Net 30' } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name is required.' });

    let supplierCode = code;
    if (!supplierCode) {
      const countRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM suppliers');
      supplierCode = `SUP-${String(countRes.rows[0].cnt + 1).padStart(3, '0')}`;
    }

    const { rows } = await pool.query(`
      INSERT INTO suppliers (code, name, contact_name, email, phone, address, tax_id, payment_terms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `, [supplierCode.trim().toUpperCase(), name.trim(), contact_name || '', email || '', phone || '', address || '', tax_id || '', payment_terms]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 2. PURCHASE ORDERS
// ----------------------------------------------------

router.get('/orders', async (req, res, next) => {
  try {
    const { status, supplier_id, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`po.status = $${params.length}`);
    }

    if (supplier_id) {
      params.push(parseInt(supplier_id, 10));
      conditions.push(`po.supplier_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(po.po_number ILIKE $${params.length} OR s.name ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      ${whereClause};
    `, params);
    const total = countRes.rows[0].total;

    params.push(parseInt(limit, 10));
    params.push(offset);

    const query = `
      SELECT 
        po.*,
        s.name AS supplier_name,
        s.code AS supplier_code,
        u.full_name AS creator_name,
        app.full_name AS approver_name,
        COUNT(poi.id)::int AS line_item_count
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.created_by = u.id
      LEFT JOIN users app ON po.approved_by = app.id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      ${whereClause}
      GROUP BY po.id, s.name, s.code, u.full_name, app.full_name
      ORDER BY po.created_at DESC
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

    const poRes = await pool.query(`
      SELECT 
        po.*,
        s.name AS supplier_name,
        s.code AS supplier_code,
        s.email AS supplier_email,
        s.phone AS supplier_phone,
        u.full_name AS creator_name,
        app.full_name AS approver_name
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.created_by = u.id
      LEFT JOIN users app ON po.approved_by = app.id
      WHERE po.id = $1;
    `, [id]);

    if (poRes.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    const itemsRes = await pool.query(`
      SELECT 
        poi.*,
        p.sku,
        p.name AS product_name,
        p.uom_code,
        (poi.quantity - poi.received_quantity)::numeric(15, 4) AS remaining_quantity
      FROM purchase_order_items poi
      JOIN products p ON poi.product_id = p.id
      WHERE poi.purchase_order_id = $1
      ORDER BY poi.id ASC;
    `, [id]);

    const receiptsRes = await pool.query(`
      SELECT gr.*, w.name as warehouse_name
      FROM goods_receipts gr
      JOIN warehouses w ON gr.warehouse_id = w.id
      WHERE gr.purchase_order_id = $1
      ORDER BY gr.created_at DESC;
    `, [id]);

    res.json({
      order: poRes.rows[0],
      items: itemsRes.rows,
      receipts: receiptsRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// CREATE Purchase Order with items
router.post('/orders', requireRoles('admin', 'purchasing'), async (req, res, next) => {
  try {
    const { supplier_id, expected_delivery_date, notes, items } = req.body;

    if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Supplier and at least one order line item are required.' });
    }

    const result = await withTransaction(async (client) => {
      const poNumber = await getNextDocNumber('PO', client);

      let subtotal = 0;
      let taxAmount = 0;

      // Validate & calculate lines
      for (const item of items) {
        const qty = Number(item.quantity);
        const price = Number(item.unit_price);
        const taxRate = Number(item.tax_rate || 0);

        if (!item.product_id || qty <= 0 || price < 0) {
          throw new Error('Each line must have a valid product, positive quantity, and non-negative unit price.');
        }

        const lineSub = qty * price;
        const lineTax = lineSub * (taxRate / 100);
        subtotal += lineSub;
        taxAmount += lineTax;
      }

      const totalAmount = subtotal + taxAmount;

      const { rows: poRows } = await client.query(`
        INSERT INTO purchase_orders (
          po_number, supplier_id, status, order_date, expected_delivery_date,
          subtotal, tax_amount, total_amount, notes, created_by
        )
        VALUES ($1, $2, 'draft', CURRENT_DATE, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `, [
        poNumber,
        supplier_id,
        expected_delivery_date || null,
        subtotal.toFixed(4),
        taxAmount.toFixed(4),
        totalAmount.toFixed(4),
        notes || '',
        req.user.id
      ]);

      const poId = poRows[0].id;

      for (const item of items) {
        const qty = Number(item.quantity);
        const price = Number(item.unit_price);
        const taxRate = Number(item.tax_rate || 0);
        const lineTotal = (qty * price) + (qty * price * (taxRate / 100));

        await client.query(`
          INSERT INTO purchase_order_items (
            purchase_order_id, product_id, quantity, received_quantity,
            unit_price, tax_rate, line_total
          )
          VALUES ($1, $2, $3, 0, $4, $5, $6);
        `, [poId, item.product_id, qty, price, taxRate, lineTotal.toFixed(4)]);
      }

      return poRows[0];
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CREATE_PO',
      entityType: 'PURCHASE_ORDER',
      entityId: result.id,
      details: { po_number: result.po_number, total: result.total_amount },
      req
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Update PO Status (approve / cancel)
router.put('/orders/:id/status', requireRoles('admin', 'purchasing'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['approved', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status can only be manually changed to: ${validStatuses.join(', ')}` });
    }

    const { rows: currentRows } = await pool.query('SELECT status, po_number FROM purchase_orders WHERE id = $1', [id]);
    if (currentRows.length === 0) return res.status(404).json({ error: 'Purchase order not found.' });

    const currentStatus = currentRows[0].status;
    if (currentStatus === 'completed') {
      return res.status(400).json({ error: 'Cannot change status of an already completed purchase order.' });
    }
    if (currentStatus === 'cancelled') {
      return res.status(400).json({ error: 'Cannot reactivate a cancelled purchase order.' });
    }

    let updateQuery = `
      UPDATE purchase_orders
      SET status = $1, updated_at = NOW()
    `;
    const params = [status];

    if (status === 'approved') {
      params.push(req.user.id);
      updateQuery += `, approved_by = $${params.length}, approved_at = NOW()`;
    }

    params.push(id);
    updateQuery += ` WHERE id = $${params.length} RETURNING *;`;

    const { rows } = await pool.query(updateQuery, params);

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: `PO_STATUS_${status.toUpperCase()}`,
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      details: { from: currentStatus, to: status },
      req
    });

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 3. GOODS RECEIPTS (Transactional Inventory Intake)
// ----------------------------------------------------

router.post('/receipts', requireRoles('admin', 'purchasing', 'warehouse'), async (req, res, next) => {
  try {
    const {
      purchase_order_id,
      warehouse_id,
      supplier_delivery_note,
      notes,
      items // [{ po_item_id, product_id, location_id, batch_number, quantity_received }]
    } = req.body;

    if (!purchase_order_id || !warehouse_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'PO, warehouse, and at least one receipt line item are required.' });
    }

    const receiptResult = await withTransaction(async (client) => {
      // 1. Fetch PO and lock it
      const { rows: poRows } = await client.query(`
        SELECT id, po_number, supplier_id, status
        FROM purchase_orders
        WHERE id = $1
        FOR UPDATE;
      `, [purchase_order_id]);

      if (poRows.length === 0) throw new Error('Purchase order not found.');
      const po = poRows[0];

      if (!['approved', 'partially_received'].includes(po.status)) {
        throw new Error(`Cannot receive goods for purchase order with status '${po.status}'. Must be approved or partially_received.`);
      }

      const receiptNumber = await getNextDocNumber('GRN', client);

      // 2. Insert goods receipt record
      const { rows: grnRows } = await client.query(`
        INSERT INTO goods_receipts (
          receipt_number, purchase_order_id, supplier_id, warehouse_id,
          receipt_date, supplier_delivery_note, notes, created_by
        )
        VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7)
        RETURNING *;
      `, [
        receiptNumber,
        po.id,
        po.supplier_id,
        warehouse_id,
        supplier_delivery_note || '',
        notes || '',
        req.user.id
      ]);

      const grnId = grnRows[0].id;

      // 3. Process each line item
      for (const item of items) {
        const qtyReceived = Number(item.quantity_received);
        if (qtyReceived <= 0) continue;

        // Fetch PO item and lock
        const { rows: poItemRows } = await client.query(`
          SELECT id, product_id, quantity, received_quantity, unit_price
          FROM purchase_order_items
          WHERE id = $1 AND purchase_order_id = $2
          FOR UPDATE;
        `, [item.po_item_id, po.id]);

        if (poItemRows.length === 0) throw new Error(`PO line item #${item.po_item_id} not found.`);
        const poItem = poItemRows[0];

        const remaining = Number(poItem.quantity) - Number(poItem.received_quantity);
        if (qtyReceived > remaining) {
          throw new Error(`Received quantity (${qtyReceived}) exceeds remaining ordered quantity (${remaining}) for product ID ${poItem.product_id}.`);
        }

        const unitCost = Number(poItem.unit_price);
        const batchNum = (item.batch_number || '').trim();

        // Insert into goods_receipt_items
        await client.query(`
          INSERT INTO goods_receipt_items (
            receipt_id, po_item_id, product_id, location_id,
            batch_number, quantity_received, quantity_accepted, quantity_rejected, unit_cost
          )
          VALUES ($1, $2, $3, $4, $5, $6, $6, 0, $7);
        `, [
          grnId,
          poItem.id,
          poItem.product_id,
          item.location_id || null,
          batchNum,
          qtyReceived,
          unitCost
        ]);

        // Update PO item received quantity
        await client.query(`
          UPDATE purchase_order_items
          SET received_quantity = received_quantity + $1
          WHERE id = $2;
        `, [qtyReceived, poItem.id]);

        // Update or insert into stock_levels
        const { rows: stockRows } = await client.query(`
          SELECT id, quantity
          FROM stock_levels
          WHERE product_id = $1 AND warehouse_id = $2
            AND (location_id = $3 OR ($3 IS NULL AND location_id IS NULL))
            AND batch_number = $4
          FOR UPDATE;
        `, [poItem.product_id, warehouse_id, item.location_id || null, batchNum]);

        if (stockRows.length > 0) {
          await client.query(`
            UPDATE stock_levels
            SET quantity = quantity + $1, updated_at = NOW()
            WHERE id = $2;
          `, [qtyReceived, stockRows[0].id]);
        } else {
          await client.query(`
            INSERT INTO stock_levels (product_id, warehouse_id, location_id, batch_number, quantity, reserved_quantity)
            VALUES ($1, $2, $3, $4, $5, 0);
          `, [poItem.product_id, warehouse_id, item.location_id || null, batchNum, qtyReceived]);
        }

        // Post to Auditable stock_movements ledger
        const movCode = await getNextDocNumber('MOV', client);
        const totalCost = (qtyReceived * unitCost).toFixed(4);

        await client.query(`
          INSERT INTO stock_movements (
            movement_code, movement_type, product_id, warehouse_id, location_id,
            batch_number, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by
          )
          VALUES ($1, 'receipt', $2, $3, $4, $5, $6, $7, $8, 'purchase_receipt', $9, $10, $11);
        `, [
          movCode,
          poItem.product_id,
          warehouse_id,
          item.location_id || null,
          batchNum,
          qtyReceived,
          unitCost,
          totalCost,
          receiptNumber,
          `Goods Receipt for PO #${po.po_number}`,
          req.user.id
        ]);
      }

      // 4. Check if all items in PO are fully received
      const { rows: statusCheck } = await client.query(`
        SELECT 
          COUNT(*)::int AS total_items,
          COUNT(CASE WHEN received_quantity >= quantity THEN 1 END)::int AS completed_items
        FROM purchase_order_items
        WHERE purchase_order_id = $1;
      `, [po.id]);

      const allCompleted = statusCheck[0].total_items === statusCheck[0].completed_items;
      const nextStatus = allCompleted ? 'completed' : 'partially_received';

      await client.query(`
        UPDATE purchase_orders
        SET status = $1, updated_at = NOW()
        WHERE id = $2;
      `, [nextStatus, po.id]);

      return {
        receipt: grnRows[0],
        newPoStatus: nextStatus
      };
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'GOODS_RECEIPT',
      entityType: 'GOODS_RECEIPT',
      entityId: receiptResult.receipt.id,
      details: { receipt_number: receiptResult.receipt.receipt_number, purchase_order_id },
      req
    });

    res.status(201).json({
      message: 'Goods received and inventory ledger posted successfully.',
      ...receiptResult
    });
  } catch (err) {
    next(err);
  }
});

export default router;
