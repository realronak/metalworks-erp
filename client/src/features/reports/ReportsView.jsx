import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Download,
  Printer,
  Boxes,
  ShoppingBag,
  TrendingUp,
  Factory,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import api from '../../services/api.js';
import { useNotification } from '../../context/NotificationContext.jsx';
import Card, { CardHeader, CardTitle, CardContent } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.jsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx';

export function ReportsView() {
  const notify = useNotification();

  const [activeReport, setActiveReport] = useState('inventory'); // 'inventory', 'purchasing', 'sales', 'production', 'quality'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReport = async (reportType) => {
    setLoading(true);
    try {
      let res = null;
      if (reportType === 'inventory') {
        res = await api.get('/reports/inventory-valuation');
      } else if (reportType === 'purchasing') {
        res = await api.get('/reports/purchasing-summary');
      } else if (reportType === 'sales') {
        res = await api.get('/reports/sales-performance');
      } else if (reportType === 'production') {
        res = await api.get('/reports/production-efficiency');
      } else if (reportType === 'quality') {
        res = await api.get('/reports/quality-metrics');
      }
      setData(res);
    } catch (err) {
      notify.error(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport(activeReport);
  }, [activeReport]);

  const handleExportCsv = () => {
    if (activeReport === 'inventory') {
      api.downloadCsv('/reports/inventory-valuation', {}, 'inventory_valuation.csv');
    } else if (activeReport === 'purchasing') {
      api.downloadCsv('/reports/purchasing-summary', {}, 'purchasing_summary.csv');
    } else if (activeReport === 'sales') {
      api.downloadCsv('/reports/sales-performance', {}, 'sales_performance.csv');
    } else {
      notify.info('Direct CSV export available for commercial and inventory datasets.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Enterprise Reports & Analytics
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Audit-reconciled operational valuations, vendor spend, commercial revenue, and factory efficiency
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            icon={Printer}
          >
            Print-Friendly View
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleExportCsv}
            icon={Download}
          >
            Export CSV Dataset
          </Button>
        </div>
      </div>

      {/* Report Selector Pills */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 text-xs">
        <button
          onClick={() => setActiveReport('inventory')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeReport === 'inventory'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <Boxes className="w-4 h-4" />
          Inventory Valuation
        </button>

        <button
          onClick={() => setActiveReport('purchasing')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeReport === 'purchasing'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Purchasing & Vendor Spend
        </button>

        <button
          onClick={() => setActiveReport('sales')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeReport === 'sales'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Sales & Client Revenue
        </button>

        <button
          onClick={() => setActiveReport('production')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeReport === 'production'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <Factory className="w-4 h-4" />
          Production Yield & Scrap
        </button>

        <button
          onClick={() => setActiveReport('quality')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeReport === 'quality'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Quality & Defect Rates
        </button>
      </div>

      {loading ? (
        <LoadingSpinner text="Reconciling records with PostgreSQL..." />
      ) : (
        <>
          {/* 1. INVENTORY VALUATION REPORT */}
          {activeReport === 'inventory' && data && (
            <div className="space-y-4">
              <div className="p-4 bg-brand-50/50 dark:bg-brand-950/20 border border-brand-200/50 dark:border-brand-800/40 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider">
                    Total Enterprise Inventory Valuation
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                    ${Number(data.summary?.grand_total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Active Stock Catalog</div>
                  <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
                    {data.summary?.total_items || 0} unique SKUs
                  </div>
                </div>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">On Hand Qty</TableHead>
                      <TableHead className="text-right">Reserved</TableHead>
                      <TableHead className="text-right">Total Valuation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                          {item.sku}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          {item.product_name}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {item.category_name || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.type === 'finished_good' ? 'completed' : 'default'}>
                            {item.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${Number(item.unit_cost).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {item.on_hand_qty} <span className="text-[10px] text-slate-400 font-normal">{item.uom_code}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {item.reserved_qty}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          ${Number(item.total_valuation).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* 2. PURCHASING REPORT */}
          {activeReport === 'purchasing' && Array.isArray(data) && (
            <Card>
              <CardHeader>
                <CardTitle>Procurement Spend by Supplier</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier Code</TableHead>
                    <TableHead>Supplier Company Name</TableHead>
                    <TableHead className="text-right">POs Issued</TableHead>
                    <TableHead className="text-right">Subtotal Spend</TableHead>
                    <TableHead className="text-right">Tax Incurred</TableHead>
                    <TableHead className="text-right">Total Procurement Volume</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((s) => (
                    <TableRow key={s.supplier_id}>
                      <TableCell className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                        {s.supplier_code}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                        {s.supplier_name}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {s.po_count}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${Number(s.subtotal_spend).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-500">
                        ${Number(s.tax_spend).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        ${Number(s.total_spend).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* 3. SALES PERFORMANCE REPORT */}
          {activeReport === 'sales' && Array.isArray(data) && (
            <Card>
              <CardHeader>
                <CardTitle>Commercial Sales Revenue by Customer</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Code</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead className="text-right">Orders Booked</TableHead>
                    <TableHead className="text-right">Gross Volume</TableHead>
                    <TableHead className="text-right">Discounts</TableHead>
                    <TableHead className="text-right">Net Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((c) => (
                    <TableRow key={c.customer_id}>
                      <TableCell className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                        {c.customer_code}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.customer_name}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {c.order_count}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${Number(c.gross_revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                        -${Number(c.discounts_given).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        ${Number(c.net_revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* 4. PRODUCTION EFFICIENCY */}
          {activeReport === 'production' && data && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Production Yield & Scrap Rate by Product</CardTitle>
                </CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product / SKU</TableHead>
                      <TableHead className="text-right">Work Orders Run</TableHead>
                      <TableHead className="text-right">Planned Units</TableHead>
                      <TableHead className="text-right">Completed Output</TableHead>
                      <TableHead className="text-right">Scrap Units</TableHead>
                      <TableHead className="text-right">Scrap Rate %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.outputAndScrap?.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{item.product_name}</div>
                          <div className="font-mono text-xs text-brand-600 dark:text-brand-400">{item.sku}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{item.total_work_orders}</TableCell>
                        <TableCell className="text-right font-mono">{item.planned_units}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                          {item.completed_units}
                        </TableCell>
                        <TableCell className="text-right font-mono text-rose-600 dark:text-rose-400">
                          {item.scrapped_units}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {item.scrap_rate_pct}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Equipment Downtime Loss Breakdown</CardTitle>
                </CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Downtime Reason</TableHead>
                      <TableHead className="text-right">Stoppage Incidents</TableHead>
                      <TableHead className="text-right">Total Hours Lost</TableHead>
                      <TableHead className="text-right">Total Minutes Lost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.downtimeByReason?.map((dt, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant={dt.reason === 'breakdown' ? 'danger' : 'warning'}>
                            {dt.reason}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{dt.incident_count}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {(Number(dt.total_minutes_lost) / 60).toFixed(1)} hrs
                        </TableCell>
                        <TableCell className="text-right font-mono text-rose-600 dark:text-rose-400">
                          {dt.total_minutes_lost} min
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* 5. QUALITY METRICS */}
          {activeReport === 'quality' && data && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quality Inspection Pass vs Rejection Rates</CardTitle>
                </CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Inspection Phase</TableHead>
                      <TableHead className="text-right">Inspections Total</TableHead>
                      <TableHead className="text-right">Passed Runs</TableHead>
                      <TableHead className="text-right">Failed Runs</TableHead>
                      <TableHead className="text-right">Total Inspected Qty</TableHead>
                      <TableHead className="text-right">Accepted Qty</TableHead>
                      <TableHead className="text-right">Rejected Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.inspectionsByType?.map((insp, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant="info">{insp.inspection_type.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">{insp.total_inspections}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                          {insp.passed_count}
                        </TableCell>
                        <TableCell className="text-right font-mono text-rose-600 dark:text-rose-400 font-bold">
                          {insp.failed_count}
                        </TableCell>
                        <TableCell className="text-right font-mono">{insp.total_inspected_qty}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {insp.total_accepted_qty}
                        </TableCell>
                        <TableCell className="text-right font-mono text-rose-600 dark:text-rose-400">
                          {insp.total_rejected_qty}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ReportsView;
