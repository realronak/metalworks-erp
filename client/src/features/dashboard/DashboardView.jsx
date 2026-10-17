import React, { useState, useEffect } from 'react';
import {
  Boxes,
  AlertTriangle,
  ShoppingBag,
  ShoppingCart,
  Factory,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
  PackageCheck,
  Clock,
  Layers
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import api from '../../services/api.js';
import { useTheme } from '../../theme/ThemeContext.jsx';
import KpiCard from '../../components/ui/KpiCard.jsx';
import Card, { CardHeader, CardTitle, CardContent } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx';

export function DashboardView({ onNavigate }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, chartsRes, activityRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/charts'),
        api.get('/dashboard/activity?limit=7')
      ]);
      setStats(statsRes);
      setCharts(chartsRes);
      setActivity(activityRes);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading && !stats) {
    return <LoadingSpinner text="Computing operational metrics from PostgreSQL..." />;
  }

  // Formatting currency
  const formatCur = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Manufacturing Operations Command
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time stock valuation, order pipeline, production output, and quality audit
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
            icon={RefreshCw}
          >
            Refresh Metrics
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Inventory Valuation"
          value={formatCur(stats?.inventory?.valuation)}
          subtitle={`${stats?.inventory?.totalProducts || 0} active SKU items`}
          icon={Boxes}
          onClick={() => onNavigate && onNavigate('inventory')}
        />

        <KpiCard
          title="Low Stock Reorders"
          value={stats?.inventory?.lowStockCount || 0}
          subtitle="Items below threshold"
          icon={AlertTriangle}
          variant={stats?.inventory?.lowStockCount > 0 ? 'warning' : 'default'}
          onClick={() => onNavigate && onNavigate('inventory')}
        />

        <KpiCard
          title="Open Purchase Orders"
          value={stats?.purchasing?.openPoCount || 0}
          subtitle={formatCur(stats?.purchasing?.openPoValue)}
          icon={ShoppingBag}
          onClick={() => onNavigate && onNavigate('purchasing')}
        />

        <KpiCard
          title="Open Sales Orders"
          value={stats?.sales?.openSoCount || 0}
          subtitle={formatCur(stats?.sales?.openSoValue)}
          icon={ShoppingCart}
          onClick={() => onNavigate && onNavigate('sales')}
        />

        <KpiCard
          title="Work Orders"
          value={stats?.production?.inProgressCount || 0}
          subtitle={`${stats?.production?.avgCompletionRate || 0}% avg completion`}
          icon={Factory}
          onClick={() => onNavigate && onNavigate('production')}
        />

        <KpiCard
          title="Pending QC"
          value={stats?.quality?.pendingInspections || 0}
          subtitle={`${stats?.quality?.openNcrs || 0} open NCR issues`}
          icon={ShieldCheck}
          variant={stats?.quality?.openNcrs > 0 ? 'danger' : 'default'}
          onClick={() => onNavigate && onNavigate('quality')}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Commercial Flow: Sales vs Purchasing */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Commercial Flow: Sales vs Purchasing</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monthly revenue from customer sales vs supplier procurement volume
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {charts?.monthlyTrends && charts.monthlyTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={charts.monthlyTrends}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="month" stroke={textColor} fontSize={11} tickLine={false} />
                    <YAxis
                      stroke={textColor}
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => `$${val / 1000}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: tooltipBg,
                        borderColor: tooltipBorder,
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                        color: isDark ? '#f8fafc' : '#0f172a'
                      }}
                      formatter={(val) => formatCur(val)}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      name="Sales Revenue"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorSales)"
                    />
                    <Area
                      type="monotone"
                      dataKey="purchases"
                      name="Purchasing Spend"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorPurchases)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No monthly trend records available yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stock Valuation by Material Category */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Inventory Valuation by Category</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Total value of raw sheets, assemblies, tubes, and finished goods
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {charts?.inventoryByCategory && charts.inventoryByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.inventoryByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis
                      type="number"
                      stroke={textColor}
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => `$${val / 1000}k`}
                    />
                    <YAxis
                      dataKey="category"
                      type="category"
                      stroke={textColor}
                      fontSize={11}
                      tickLine={false}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: tooltipBg,
                        borderColor: tooltipBorder,
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                        color: isDark ? '#f8fafc' : '#0f172a'
                      }}
                      formatter={(val) => [formatCur(val), 'Stock Value']}
                    />
                    <Bar
                      dataKey="value"
                      fill="#4f46e5"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No inventory category valuation records available.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Ledger Activity Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div>
              <CardTitle>Auditable Movement Ledger (Recent Activity)</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Chronological stock intake, production issues, transfers, and receipts
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate && onNavigate('inventory')}
            >
              View Full Ledger
              <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activity.length > 0 ? (
              activity.map((item) => {
                const isPositive = Number(item.quantity) > 0;
                return (
                  <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        isPositive ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        <PackageCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <span>{item.product_name}</span>
                          <span className="font-mono text-[11px] text-slate-400">({item.sku})</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                          <span className="capitalize">{item.movement_type.replace(/_/g, ' ')}</span>
                          <span>•</span>
                          <span>{item.warehouse_name}</span>
                          <span>•</span>
                          <span>By {item.user_name || 'System'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-sm font-bold font-mono ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        {isPositive ? `+${item.quantity}` : item.quantity}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                No recent stock movements recorded.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default DashboardView;
