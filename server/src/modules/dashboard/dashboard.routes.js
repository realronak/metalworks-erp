import { Router } from 'express';
import pool from '../../db/connection.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Main KPI Stats
router.get('/stats', async (req, res, next) => {
  try {
    // 1. Total Inventory Valuation and SKU count
    const invValQuery = `
      SELECT 
        COUNT(DISTINCT p.id)::int AS total_products,
        COALESCE(SUM(sl.total_qty * p.unit_cost), 0)::numeric(15, 2) AS total_inventory_value,
        COUNT(DISTINCT CASE WHEN sl.total_qty <= p.reorder_point AND p.reorder_point > 0 THEN p.id END)::int AS low_stock_count
      FROM products p
      LEFT JOIN (
        SELECT product_id, SUM(quantity) as total_qty
        FROM stock_levels
        GROUP BY product_id
      ) sl ON sl.product_id = p.id
      WHERE p.is_active = true;
    `;

    // 2. Open Purchase Orders
    const poQuery = `
      SELECT 
        COUNT(*)::int AS open_po_count,
        COALESCE(SUM(total_amount), 0)::numeric(15, 2) AS open_po_value
      FROM purchase_orders
      WHERE status IN ('draft', 'approved', 'partially_received');
    `;

    // 3. Open Sales Orders
    const soQuery = `
      SELECT 
        COUNT(*)::int AS open_so_count,
        COALESCE(SUM(total_amount), 0)::numeric(15, 2) AS open_so_value
      FROM sales_orders
      WHERE status IN ('quotation', 'confirmed', 'in_production', 'partially_delivered');
    `;

    // 4. Production Work Orders
    const woQuery = `
      SELECT 
        COUNT(*)::int AS total_work_orders,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress_wo_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed_wo_count,
        COALESCE(AVG(CASE WHEN planned_quantity > 0 THEN (completed_quantity / planned_quantity) * 100 END), 0)::numeric(5, 1) AS avg_completion_rate
      FROM work_orders;
    `;

    // 5. Quality Status
    const qcQuery = `
      SELECT 
        COUNT(CASE WHEN status = 'pending' THEN 1 END)::int AS pending_inspections,
        COUNT(CASE WHEN status = 'passed' THEN 1 END)::int AS passed_inspections,
        COUNT(CASE WHEN status = 'failed' THEN 1 END)::int AS failed_inspections
      FROM quality_inspections;
    `;

    // 6. NCR count
    const ncrQuery = `
      SELECT COUNT(*)::int AS open_ncrs
      FROM nonconformance_reports
      WHERE status IN ('open', 'under_review', 'action_pending');
    `;

    const [invRes, poRes, soRes, woRes, qcRes, ncrRes] = await Promise.all([
      pool.query(invValQuery),
      pool.query(poQuery),
      pool.query(soQuery),
      pool.query(woQuery),
      pool.query(qcQuery),
      pool.query(ncrQuery)
    ]);

    res.json({
      inventory: {
        totalProducts: invRes.rows[0].total_products,
        valuation: Number(invRes.rows[0].total_inventory_value),
        lowStockCount: invRes.rows[0].low_stock_count
      },
      purchasing: {
        openPoCount: poRes.rows[0].open_po_count,
        openPoValue: Number(poRes.rows[0].open_po_value)
      },
      sales: {
        openSoCount: soRes.rows[0].open_so_count,
        openSoValue: Number(soRes.rows[0].open_so_value)
      },
      production: {
        totalWorkOrders: woRes.rows[0].total_work_orders,
        inProgressCount: woRes.rows[0].in_progress_wo_count,
        completedCount: woRes.rows[0].completed_wo_count,
        avgCompletionRate: Number(woRes.rows[0].avg_completion_rate)
      },
      quality: {
        pendingInspections: qcRes.rows[0].pending_inspections,
        passedInspections: qcRes.rows[0].passed_inspections,
        failedInspections: qcRes.rows[0].failed_inspections,
        openNcrs: ncrRes.rows[0].open_ncrs
      }
    });
  } catch (err) {
    next(err);
  }
});

// Operational Charts Data
router.get('/charts', async (req, res, next) => {
  try {
    // Inventory breakdown by Category
    const categoryChartQuery = `
      SELECT 
        c.name AS category,
        COUNT(p.id)::int AS item_count,
        COALESCE(SUM(sl.quantity * p.unit_cost), 0)::numeric(15, 2) AS total_value
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      GROUP BY c.id, c.name
      ORDER BY total_value DESC;
    `;

    // Production Status breakdown
    const prodStatusQuery = `
      SELECT status, COUNT(*)::int AS count
      FROM work_orders
      GROUP BY status;
    `;

    // Recent 6-month monthly financial volume (POs vs SOs)
    const financialTrendsQuery = `
      WITH months AS (
        SELECT TO_CHAR(d, 'YYYY-MM') AS month_label, d
        FROM generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
          DATE_TRUNC('month', CURRENT_DATE),
          '1 month'::interval
        ) d
      )
      SELECT 
        m.month_label AS month,
        COALESCE((
          SELECT SUM(total_amount) 
          FROM sales_orders 
          WHERE TO_CHAR(order_date, 'YYYY-MM') = m.month_label AND status != 'cancelled'
        ), 0)::numeric(15, 2) AS sales_volume,
        COALESCE((
          SELECT SUM(total_amount) 
          FROM purchase_orders 
          WHERE TO_CHAR(order_date, 'YYYY-MM') = m.month_label AND status != 'cancelled'
        ), 0)::numeric(15, 2) AS purchase_volume
      FROM months m
      ORDER BY m.d ASC;
    `;

    const [catRes, prodRes, trendRes] = await Promise.all([
      pool.query(categoryChartQuery),
      pool.query(prodStatusQuery),
      pool.query(financialTrendsQuery)
    ]);

    res.json({
      inventoryByCategory: catRes.rows.map(r => ({
        category: r.category,
        itemCount: r.item_count,
        value: Number(r.total_value)
      })),
      productionByStatus: prodRes.rows,
      monthlyTrends: trendRes.rows.map(r => ({
        month: r.month,
        sales: Number(r.sales_volume),
        purchases: Number(r.purchase_volume)
      }))
    });
  } catch (err) {
    next(err);
  }
});

// Recent Operational Activity Feed
router.get('/activity', async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const query = `
      SELECT 
        sm.id,
        sm.movement_code,
        sm.movement_type,
        sm.quantity,
        sm.unit_cost,
        sm.created_at,
        p.name AS product_name,
        p.sku,
        w.name AS warehouse_name,
        u.full_name AS user_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN warehouses w ON sm.warehouse_id = w.id
      LEFT JOIN users u ON sm.created_by = u.id
      ORDER BY sm.created_at DESC
      LIMIT $1;
    `;

    const { rows } = await pool.query(query, [parseInt(limit, 10)]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
