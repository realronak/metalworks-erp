import { Router } from 'express';
import pool from '../../db/connection.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate);

// 1. Inventory Valuation Report
router.get('/inventory-valuation', async (req, res, next) => {
  try {
    const { warehouse_id, category_id, format } = req.query;
    const params = [];
    const conditions = ['p.is_active = true'];

    if (warehouse_id) {
      params.push(parseInt(warehouse_id, 10));
      conditions.push(`sl.warehouse_id = $${params.length}`);
    }

    if (category_id) {
      params.push(parseInt(category_id, 10));
      conditions.push(`p.category_id = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT 
        p.id,
        p.sku,
        p.name AS product_name,
        c.name AS category_name,
        p.type,
        p.uom_code,
        p.unit_cost,
        COALESCE(SUM(sl.quantity), 0)::numeric(15, 4) AS on_hand_qty,
        COALESCE(SUM(sl.reserved_quantity), 0)::numeric(15, 4) AS reserved_qty,
        (COALESCE(SUM(sl.quantity), 0) * p.unit_cost)::numeric(15, 2) AS total_valuation
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      ${whereClause}
      GROUP BY p.id, c.name
      ORDER BY total_valuation DESC;
    `;

    const { rows } = await pool.query(query, params);

    const summaryQuery = `
      SELECT 
        COALESCE(SUM(sl.quantity * p.unit_cost), 0)::numeric(15, 2) AS grand_total_value,
        COUNT(DISTINCT p.id)::int AS total_items
      FROM products p
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      ${whereClause};
    `;
    const summaryRes = await pool.query(summaryQuery, params);

    // If CSV requested
    if (format === 'csv') {
      let csv = 'SKU,Product Name,Category,Type,UOM,Unit Cost,On Hand,Total Valuation\n';
      rows.forEach(r => {
        csv += `"${r.sku}","${r.product_name.replace(/"/g, '""')}","${r.category_name || ''}","${r.type}","${r.uom_code}",${r.unit_cost},${r.on_hand_qty},${r.total_valuation}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory_valuation.csv"');
      return res.send(csv);
    }

    res.json({
      summary: summaryRes.rows[0],
      items: rows
    });
  } catch (err) {
    next(err);
  }
});

// 2. Purchasing Report (Spend by Supplier & Month)
router.get('/purchasing-summary', async (req, res, next) => {
  try {
    const { start_date, end_date, supplier_id, format } = req.query;
    const params = [];
    const conditions = ["po.status != 'cancelled'"];

    if (start_date) {
      params.push(start_date);
      conditions.push(`po.order_date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      conditions.push(`po.order_date <= $${params.length}`);
    }
    if (supplier_id) {
      params.push(parseInt(supplier_id, 10));
      conditions.push(`po.supplier_id = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT 
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.code AS supplier_code,
        COUNT(po.id)::int AS po_count,
        COALESCE(SUM(po.subtotal), 0)::numeric(15, 2) AS subtotal_spend,
        COALESCE(SUM(po.tax_amount), 0)::numeric(15, 2) AS tax_spend,
        COALESCE(SUM(po.total_amount), 0)::numeric(15, 2) AS total_spend
      FROM suppliers s
      JOIN purchase_orders po ON po.supplier_id = s.id
      ${whereClause}
      GROUP BY s.id
      ORDER BY total_spend DESC;
    `;

    const { rows } = await pool.query(query, params);

    if (format === 'csv') {
      let csv = 'Supplier Code,Supplier Name,Orders Count,Subtotal Spend,Tax Spend,Total Spend\n';
      rows.forEach(r => {
        csv += `"${r.supplier_code}","${r.supplier_name.replace(/"/g, '""')}",${r.po_count},${r.subtotal_spend},${r.tax_spend},${r.total_spend}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="purchasing_summary.csv"');
      return res.send(csv);
    }

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// 3. Sales Report (Revenue by Customer & Status)
router.get('/sales-performance', async (req, res, next) => {
  try {
    const { start_date, end_date, customer_id, format } = req.query;
    const params = [];
    const conditions = ["so.status != 'cancelled'"];

    if (start_date) {
      params.push(start_date);
      conditions.push(`so.order_date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      conditions.push(`so.order_date <= $${params.length}`);
    }
    if (customer_id) {
      params.push(parseInt(customer_id, 10));
      conditions.push(`so.customer_id = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT 
        c.id AS customer_id,
        c.name AS customer_name,
        c.code AS customer_code,
        COUNT(so.id)::int AS order_count,
        COALESCE(SUM(so.subtotal), 0)::numeric(15, 2) AS gross_revenue,
        COALESCE(SUM(so.discount_amount), 0)::numeric(15, 2) AS discounts_given,
        COALESCE(SUM(so.total_amount), 0)::numeric(15, 2) AS net_revenue
      FROM customers c
      JOIN sales_orders so ON so.customer_id = c.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY net_revenue DESC;
    `;

    const { rows } = await pool.query(query, params);

    if (format === 'csv') {
      let csv = 'Customer Code,Customer Name,Orders Count,Gross Revenue,Discounts Given,Net Revenue\n';
      rows.forEach(r => {
        csv += `"${r.customer_code}","${r.customer_name.replace(/"/g, '""')}",${r.order_count},${r.gross_revenue},${r.discounts_given},${r.net_revenue}\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sales_performance.csv"');
      return res.send(csv);
    }

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// 4. Production Output, Scrap & Downtime Report
router.get('/production-efficiency', async (req, res, next) => {
  try {
    const woQuery = `
      SELECT 
        p.name AS product_name,
        p.sku,
        COUNT(wo.id)::int AS total_work_orders,
        COALESCE(SUM(wo.planned_quantity), 0)::numeric(15, 2) AS planned_units,
        COALESCE(SUM(wo.completed_quantity), 0)::numeric(15, 2) AS completed_units,
        COALESCE(SUM(wo.scrapped_quantity), 0)::numeric(15, 2) AS scrapped_units,
        CASE WHEN SUM(wo.completed_quantity + wo.scrapped_quantity) > 0 THEN
          ROUND((SUM(wo.scrapped_quantity) / SUM(wo.completed_quantity + wo.scrapped_quantity)) * 100, 2)
        ELSE 0 END AS scrap_rate_pct
      FROM work_orders wo
      JOIN products p ON wo.product_id = p.id
      GROUP BY p.id, p.name, p.sku
      ORDER BY completed_units DESC;
    `;

    const downtimeQuery = `
      SELECT 
        reason,
        COUNT(*)::int AS incident_count,
        SUM(duration_minutes)::int AS total_minutes_lost
      FROM machine_downtime
      GROUP BY reason
      ORDER BY total_minutes_lost DESC;
    `;

    const [woRes, dtRes] = await Promise.all([
      pool.query(woQuery),
      pool.query(downtimeQuery)
    ]);

    res.json({
      outputAndScrap: woRes.rows,
      downtimeByReason: dtRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// 5. Quality Inspection & NCR Report
router.get('/quality-metrics', async (req, res, next) => {
  try {
    const inspectionQuery = `
      SELECT 
        inspection_type,
        COUNT(*)::int AS total_inspections,
        COUNT(CASE WHEN status = 'passed' THEN 1 END)::int AS passed_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END)::int AS failed_count,
        COUNT(CASE WHEN status = 'conditional' THEN 1 END)::int AS conditional_count,
        COALESCE(SUM(inspected_quantity), 0)::numeric(15, 2) AS total_inspected_qty,
        COALESCE(SUM(accepted_quantity), 0)::numeric(15, 2) AS total_accepted_qty,
        COALESCE(SUM(rejected_quantity), 0)::numeric(15, 2) AS total_rejected_qty
      FROM quality_inspections
      GROUP BY inspection_type;
    `;

    const ncrQuery = `
      SELECT 
        severity,
        status,
        COUNT(*)::int AS count
      FROM nonconformance_reports
      GROUP BY severity, status;
    `;

    const [inspRes, ncrRes] = await Promise.all([
      pool.query(inspectionQuery),
      pool.query(ncrQuery)
    ]);

    res.json({
      inspectionsByType: inspRes.rows,
      ncrBreakdown: ncrRes.rows
    });
  } catch (err) {
    next(err);
  }
});

export default router;
