import React, { useState, useEffect } from 'react';
import {
  Factory,
  Plus,
  Layers,
  Wrench,
  Clock,
  CheckCircle,
  AlertOctagon,
  ArrowRight,
  Boxes,
  Cpu,
  Trash2,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import api from '../../services/api.js';
import { useNotification } from '../../context/NotificationContext.jsx';
import Card, { CardHeader, CardTitle, CardContent } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input, { Select } from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Pagination } from '../../components/ui/Table.jsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

export function ProductionView() {
  const notify = useNotification();

  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'boms', 'downtime'
  const [workOrders, setWorkOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Reference data
  const [boms, setBoms] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [downtimeLogs, setDowntimeLogs] = useState([]);

  // Modals
  const [showWoModal, setShowWoModal] = useState(false);
  const [showBomModal, setShowBomModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showDowntimeModal, setShowDowntimeModal] = useState(false);
  const [selectedWo, setSelectedWo] = useState(null);
  const [woDetail, setWoDetail] = useState(null);
  const [selectedBomDetail, setSelectedBomDetail] = useState(null);

  // Forms
  const [woForm, setWoForm] = useState({
    bom_id: '',
    warehouse_id: '',
    source_warehouse_id: '',
    planned_quantity: 10,
    priority: 'medium',
    planned_start_date: '',
    planned_end_date: '',
    notes: ''
  });

  const [bomForm, setBomForm] = useState({
    product_id: '',
    name: '',
    version: '1.0',
    description: '',
    output_quantity: 1,
    items: [
      { product_id: '', quantity: 1, scrap_factor: 2, notes: '' }
    ]
  });

  const [issueForm, setIssueForm] = useState({
    items: []
  });

  const [completeForm, setCompleteForm] = useState({
    completed_quantity: 0,
    scrapped_quantity: 0,
    batch_number: '',
    notes: ''
  });

  const [downtimeForm, setDowntimeForm] = useState({
    work_order_id: '',
    machine_name: 'Trumpf TruLaser 3030 (4kW Fiber)',
    reason: 'tool_change',
    duration_minutes: 30,
    notes: 'Nozzle calibration and lens cleaning'
  });

  const loadReference = async () => {
    try {
      const [bomRes, prodRes, whRes, dtRes] = await Promise.all([
        api.get('/production/boms'),
        api.get('/inventory/products?limit=100'),
        api.get('/inventory/warehouses'),
        api.get('/production/downtime')
      ]);
      setBoms(bomRes);
      setProducts(prodRes.data || []);
      setWarehouses(whRes);
      setDowntimeLogs(dtRes);
    } catch (err) {
      console.error('Failed to load production reference:', err);
    }
  };

  const loadWorkOrders = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/production/work-orders', {
        status: statusFilter,
        priority: priorityFilter,
        search,
        page,
        limit: pagination.limit
      });
      setWorkOrders(res.data);
      setPagination(res.pagination);
    } catch (err) {
      notify.error(err.message || 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  };

  const loadBoms = async () => {
    try {
      const res = await api.get('/production/boms');
      setBoms(res);
    } catch (err) {
      notify.error(err.message || 'Failed to load BOMs');
    }
  };

  useEffect(() => {
    loadReference();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') loadWorkOrders(1);
    if (activeTab === 'boms') loadBoms();
    if (activeTab === 'downtime') api.get('/production/downtime').then(setDowntimeLogs);
  }, [activeTab, statusFilter, priorityFilter, search]);

  const handleCreateWo = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/production/work-orders', woForm);
      notify.success(`Work order created: ${res.wo_number}. Raw materials reserved.`);
      setShowWoModal(false);
      loadWorkOrders(1);
    } catch (err) {
      notify.error(err.message || 'Failed to create work order');
    }
  };

  const handleAddBomItem = () => {
    setBomForm({
      ...bomForm,
      items: [...bomForm.items, { product_id: '', quantity: 1, scrap_factor: 2, notes: '' }]
    });
  };

  const handleRemoveBomItem = (index) => {
    if (bomForm.items.length === 1) return;
    setBomForm({
      ...bomForm,
      items: bomForm.items.filter((_, i) => i !== index)
    });
  };

  const handleCreateBom = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/production/boms', bomForm);
      notify.success(`BOM created: ${res.bom_number}`);
      setShowBomModal(false);
      loadBoms();
    } catch (err) {
      notify.error(err.message || 'Failed to create BOM');
    }
  };

  const handleViewWo = async (woId) => {
    try {
      const res = await api.get(`/production/work-orders/${woId}`);
      setWoDetail(res);
      setSelectedWo(res.workOrder);
    } catch (err) {
      notify.error(err.message || 'Failed to load work order details');
    }
  };

  const handleUpdateWoStatus = async (woId, status) => {
    try {
      await api.put(`/production/work-orders/${woId}/status`, { status });
      notify.success(`Work order status updated to ${status.toUpperCase()}`);
      loadWorkOrders(pagination.page);
      if (selectedWo) handleViewWo(woId);
    } catch (err) {
      notify.error(err.message || 'Failed to update work order status');
    }
  };

  const openIssueModal = (detail) => {
    const items = (detail.materials || [])
      .filter(m => Number(m.remaining_issue_quantity) > 0)
      .map(m => ({
        material_id: m.id,
        product_id: m.product_id,
        product_name: m.product_name,
        sku: m.sku,
        uom_code: m.uom_code,
        planned_quantity: m.planned_quantity,
        issued_quantity: m.issued_quantity,
        remaining_issue_quantity: Number(m.remaining_issue_quantity),
        quantity: Number(m.remaining_issue_quantity),
        batch_number: ''
      }));

    setIssueForm({ items });
    setShowIssueModal(true);
  };

  const handlePostMaterialIssue = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/production/work-orders/${selectedWo.id}/issue-materials`, issueForm);
      notify.success('Raw materials issued to production floor. Inventory deducted.');
      setShowIssueModal(false);
      handleViewWo(selectedWo.id);
      loadWorkOrders(pagination.page);
    } catch (err) {
      notify.error(err.message || 'Failed to issue materials');
    }
  };

  const openCompleteModal = (detail) => {
    const remainingToProduce = Number(detail.workOrder.planned_quantity) - Number(detail.workOrder.completed_quantity) - Number(detail.workOrder.scrapped_quantity);
    setCompleteForm({
      completed_quantity: Math.max(0, remainingToProduce),
      scrapped_quantity: 0,
      batch_number: detail.workOrder.batch_number || `BATCH-${detail.workOrder.wo_number}`,
      notes: 'Production run finished within tolerance.'
    });
    setShowCompleteModal(true);
  };

  const handlePostCompletion = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/production/work-orders/${selectedWo.id}/complete`, completeForm);
      notify.success('Finished goods intake recorded into inventory!');
      setShowCompleteModal(false);
      handleViewWo(selectedWo.id);
      loadWorkOrders(pagination.page);
    } catch (err) {
      notify.error(err.message || 'Failed to record completion');
    }
  };

  const handleSaveDowntime = async (e) => {
    e.preventDefault();
    try {
      await api.post('/production/downtime', downtimeForm);
      notify.success('Machine downtime logged');
      setShowDowntimeModal(false);
      api.get('/production/downtime').then(setDowntimeLogs);
    } catch (err) {
      notify.error(err.message || 'Failed to log downtime');
    }
  };

  const handleViewBomDetail = async (bomId) => {
    try {
      const res = await api.get(`/production/boms/${bomId}`);
      setSelectedBomDetail(res);
    } catch (err) {
      notify.error(err.message || 'Failed to load BOM detail');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Manufacturing & Production Control
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Bills of Materials (BOM), work orders scheduling, floor material issues, and finished output
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDowntimeForm({
                work_order_id: workOrders[0]?.id || '',
                machine_name: 'Trumpf TruLaser 3030 (4kW Fiber)',
                reason: 'maintenance',
                duration_minutes: 45,
                notes: 'Preventative lubrication & beam alignment'
              });
              setShowDowntimeModal(true);
            }}
            icon={Wrench}
          >
            Log Machine Downtime
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setBomForm({
                product_id: products.find(p => p.type === 'finished_good')?.id || products[0]?.id || '',
                name: '',
                version: '1.0',
                description: '',
                output_quantity: 1,
                items: [
                  { product_id: products.find(p => p.type === 'raw_material')?.id || products[0]?.id || '', quantity: 2, scrap_factor: 2, notes: '' }
                ]
              });
              setShowBomModal(true);
            }}
            icon={Layers}
          >
            Create BOM
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setWoForm({
                bom_id: boms[0]?.id || '',
                warehouse_id: warehouses[0]?.id || '',
                source_warehouse_id: warehouses[0]?.id || '',
                planned_quantity: 10,
                priority: 'medium',
                planned_start_date: '',
                planned_end_date: '',
                notes: ''
              });
              setShowWoModal(true);
            }}
            icon={Plus}
          >
            Schedule Work Order
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold gap-6">
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'orders'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Factory className="w-4 h-4" />
          Work Orders ({pagination.total})
        </button>

        <button
          onClick={() => setActiveTab('boms')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'boms'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Bills of Materials (BOM) ({boms.length})
        </button>

        <button
          onClick={() => setActiveTab('downtime')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'downtime'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Machine Downtime Logs ({downtimeLogs.length})
        </button>
      </div>

      {/* TAB 1: WORK ORDERS */}
      {activeTab === 'orders' && (
        <Card>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <input
                type="text"
                placeholder="Search WO #, product name, SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-3 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
              >
                <option value="">All Statuses</option>
                <option value="planned">Planned</option>
                <option value="released">Released to Floor</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
              >
                <option value="">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {loading ? (
            <LoadingSpinner text="Fetching production work orders..." />
          ) : workOrders.length === 0 ? (
            <EmptyState
              icon={Factory}
              title="No work orders found"
              description="No production orders currently scheduled."
              action={
                <Button size="sm" onClick={() => setShowWoModal(true)}>
                  Schedule Work Order
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WO Number</TableHead>
                    <TableHead>Product / Output</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Target Facility</TableHead>
                    <TableHead className="text-right">Planned Qty</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workOrders.map((wo) => (
                    <TableRow key={wo.id}>
                      <TableCell className="font-mono font-bold text-brand-600 dark:text-brand-400">
                        {wo.wo_number}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{wo.product_name}</div>
                        <div className="text-[11px] font-mono text-slate-400">BOM: {wo.bom_number}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={wo.priority}>{wo.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={wo.status}>{wo.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {wo.warehouse_name}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {wo.planned_quantity} {wo.uom_code}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {wo.completed_quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-brand-600 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, wo.progress_pct || 0)}%` }}
                            ></div>
                          </div>
                          <span className="font-mono text-xs font-semibold">{wo.progress_pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewWo(wo.id)}
                        >
                          Manage Run
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.pages}
                totalItems={pagination.total}
                pageSize={pagination.limit}
                onPageChange={(page) => loadWorkOrders(page)}
              />
            </>
          )}
        </Card>
      )}

      {/* TAB 2: BILLS OF MATERIALS (BOM) */}
      {activeTab === 'boms' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boms.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <div>
                  <div className="font-mono text-[10px] text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider">
                    {b.bom_number} (v{b.version})
                  </div>
                  <CardTitle className="mt-0.5">{b.name}</CardTitle>
                </div>
                <Badge variant="completed">Active</Badge>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                  <span className="text-slate-400">Target Product:</span> <strong className="text-slate-900 dark:text-slate-100">{b.product_name}</strong>
                  <div className="font-mono text-[11px] text-slate-400">{b.product_sku}</div>
                </div>

                <div className="py-2.5 px-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs flex justify-between items-center mb-4">
                  <span className="text-slate-500">Output Yield:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {b.output_quantity} {b.uom_code}
                  </span>
                  <span className="text-slate-500 ml-3">Components:</span>
                  <span className="font-mono font-bold text-brand-600 dark:text-brand-400">
                    {b.component_count || 0} items
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
                  {b.description || 'Standard manufacturing bill of materials assembly specification.'}
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => handleViewBomDetail(b.id)}
                >
                  View Component Lines
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* TAB 3: MACHINE DOWNTIME */}
      {activeTab === 'downtime' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Machine Workstation</TableHead>
                <TableHead>Downtime Reason</TableHead>
                <TableHead className="text-right">Duration (Minutes)</TableHead>
                <TableHead>Work Order #</TableHead>
                <TableHead>Reported Time</TableHead>
                <TableHead>Operator / Logged By</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {downtimeLogs.map((dt) => (
                <TableRow key={dt.id}>
                  <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                    {dt.machine_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={dt.reason === 'breakdown' ? 'danger' : 'warning'}>
                      {dt.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                    {dt.duration_minutes} min
                  </TableCell>
                  <TableCell className="font-mono text-xs text-brand-600 dark:text-brand-400">
                    {dt.wo_number || 'Plant wide'}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {new Date(dt.start_time).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {dt.logged_by_name || 'Floor Operator'}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-xs truncate" title={dt.notes}>
                    {dt.notes || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* MODAL: SCHEDULE WORK ORDER */}
      <Modal
        isOpen={showWoModal}
        onClose={() => setShowWoModal(false)}
        title="Schedule Manufacturing Work Order"
        description="Creates work order, computes bill of materials explosion, and reserves raw stock"
      >
        <form onSubmit={handleCreateWo} className="space-y-4">
          <Select
            label="Bill of Materials (BOM)"
            value={woForm.bom_id}
            onChange={(e) => setWoForm({ ...woForm, bom_id: e.target.value })}
            required
          >
            <option value="">Select BOM Assembly</option>
            {boms.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.bom_number})</option>
            ))}
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Finished Goods Warehouse"
              value={woForm.warehouse_id}
              onChange={(e) => setWoForm({ ...woForm, warehouse_id: e.target.value })}
              required
            >
              <option value="">Select Target Warehouse</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </Select>

            <Select
              label="Source Warehouse (Raw Stock)"
              value={woForm.source_warehouse_id}
              onChange={(e) => setWoForm({ ...woForm, source_warehouse_id: e.target.value })}
              required
            >
              <option value="">Select Source Warehouse</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Planned Production Quantity"
              type="number"
              min="1"
              value={woForm.planned_quantity}
              onChange={(e) => setWoForm({ ...woForm, planned_quantity: e.target.value })}
              required
            />

            <Select
              label="Priority Level"
              value={woForm.priority}
              onChange={(e) => setWoForm({ ...woForm, priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Planned Start Date"
              type="date"
              value={woForm.planned_start_date}
              onChange={(e) => setWoForm({ ...woForm, planned_start_date: e.target.value })}
            />

            <Input
              label="Planned End Date"
              type="date"
              value={woForm.planned_end_date}
              onChange={(e) => setWoForm({ ...woForm, planned_end_date: e.target.value })}
            />
          </div>

          <Input
            label="Production Run Notes"
            value={woForm.notes}
            onChange={(e) => setWoForm({ ...woForm, notes: e.target.value })}
            placeholder="Special manufacturing routing or machine guidelines..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowWoModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Schedule & Reserve Raw Materials
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: CREATE BOM */}
      <Modal
        isOpen={showBomModal}
        onClose={() => setShowBomModal(false)}
        title="Create Bill of Materials (BOM)"
        description="Configure master recipe for fabricated weldments, chassis, and assemblies"
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleCreateBom} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Assembly / Finished Good Product"
              value={bomForm.product_id}
              onChange={(e) => setBomForm({ ...bomForm, product_id: e.target.value })}
              required
            >
              <option value="">Select Target Product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </Select>

            <Input
              label="BOM Recipe Name"
              value={bomForm.name}
              onChange={(e) => setBomForm({ ...bomForm, name: e.target.value })}
              required
              placeholder="e.g. Master Chassis Assembly BOM"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Output Yield Quantity"
              type="number"
              min="1"
              value={bomForm.output_quantity}
              onChange={(e) => setBomForm({ ...bomForm, output_quantity: e.target.value })}
              required
            />
            <Input
              label="Version"
              value={bomForm.version}
              onChange={(e) => setBomForm({ ...bomForm, version: e.target.value })}
              placeholder="1.0"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Component Items Required per Yield:
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={handleAddBomItem} icon={Plus}>
                Add Component
              </Button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5">Component SKU</th>
                    <th className="p-2.5 w-28 text-right">Qty per Yield</th>
                    <th className="p-2.5 w-24 text-right">Scrap %</th>
                    <th className="p-2.5 w-44">Assembly Notes</th>
                    <th className="p-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bomForm.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2">
                        <select
                          value={it.product_id}
                          onChange={(e) => {
                            const updated = [...bomForm.items];
                            updated[idx].product_id = e.target.value;
                            setBomForm({ ...bomForm, items: updated });
                          }}
                          className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                          required
                        >
                          <option value="">Select Component</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={it.quantity}
                          onChange={(e) => {
                            const updated = [...bomForm.items];
                            updated[idx].quantity = e.target.value;
                            setBomForm({ ...bomForm, items: updated });
                          }}
                          className="w-full text-xs p-1.5 text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                          required
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={it.scrap_factor}
                          onChange={(e) => {
                            const updated = [...bomForm.items];
                            updated[idx].scrap_factor = e.target.value;
                            setBomForm({ ...bomForm, items: updated });
                          }}
                          className="w-full text-xs p-1.5 text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={it.notes}
                          onChange={(e) => {
                            const updated = [...bomForm.items];
                            updated[idx].notes = e.target.value;
                            setBomForm({ ...bomForm, items: updated });
                          }}
                          placeholder="e.g. Laser cut, press fit..."
                          className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveBomItem(idx)}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowBomModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Bill of Materials
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: VIEW WORK ORDER RUN DETAILS */}
      {woDetail && (
        <Modal
          isOpen={!!woDetail}
          onClose={() => setWoDetail(null)}
          title={`Work Order: ${woDetail.workOrder.wo_number}`}
          description={`Assembly: ${woDetail.workOrder.product_name} • Planned: ${woDetail.workOrder.planned_quantity} ${woDetail.workOrder.uom_code}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-6">
            {/* Status & Actions Header */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Badge variant={woDetail.workOrder.status} size="md">
                  {woDetail.workOrder.status}
                </Badge>
                <Badge variant={woDetail.workOrder.priority}>
                  {woDetail.workOrder.priority}
                </Badge>
                <div className="text-xs text-slate-500">
                  Target: {woDetail.workOrder.warehouse_name}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {woDetail.workOrder.status === 'planned' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleUpdateWoStatus(woDetail.workOrder.id, 'released')}
                  >
                    Release to Shop Floor
                  </Button>
                )}

                {['planned', 'released', 'in_progress'].includes(woDetail.workOrder.status) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openIssueModal(woDetail)}
                    icon={Boxes}
                  >
                    Issue Raw Materials
                  </Button>
                )}

                {['released', 'in_progress'].includes(woDetail.workOrder.status) && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openCompleteModal(woDetail)}
                    icon={CheckCircle}
                  >
                    Record Output / Scrap
                  </Button>
                )}
              </div>
            </div>

            {/* Material Consumption: Planned vs Issued */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Planned vs Actual Material Consumption
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component / Raw Stock</TableHead>
                    <TableHead className="text-right">Planned Qty</TableHead>
                    <TableHead className="text-right">Issued Qty</TableHead>
                    <TableHead className="text-right">Remaining to Issue</TableHead>
                    <TableHead className="text-right">Warehouse Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {woDetail.materials.map((mat) => (
                    <TableRow key={mat.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{mat.product_name}</div>
                        <div className="text-xs font-mono text-slate-400">{mat.sku}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {mat.planned_quantity} {mat.uom_code}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {mat.issued_quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {mat.remaining_issue_quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-500">
                        {mat.warehouse_available_stock}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Work order downtime logs */}
            {woDetail.downtime && woDetail.downtime.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Downtime Logged on This Run
                </h4>
                <div className="space-y-2">
                  {woDetail.downtime.map((dt) => (
                    <div key={dt.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs flex justify-between items-center">
                      <div>
                        <strong>{dt.machine_name}</strong>
                        <span className="text-slate-400 mx-2">•</span>
                        <Badge variant="warning">{dt.reason}</Badge>
                        <span className="text-slate-400 ml-2">{dt.notes}</span>
                      </div>
                      <div className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        {dt.duration_minutes} min
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* MODAL: ISSUE RAW MATERIALS */}
      <Modal
        isOpen={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        title="Issue Raw Materials to Shop Floor"
        description="Deducts stock from source warehouse, releases reserved balance, and posts ledger entries"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handlePostMaterialIssue} className="space-y-4">
          <div className="space-y-3">
            {issueForm.items.map((it, idx) => (
              <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">{it.product_name}</div>
                  <div className="text-[10px] font-mono text-slate-400">
                    SKU: {it.sku} • Outstanding required: {it.remaining_issue_quantity} {it.uom_code}
                  </div>
                </div>

                <div className="w-36">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Issue Qty</label>
                  <input
                    type="number"
                    max={it.remaining_issue_quantity}
                    min="0.001"
                    step="0.001"
                    value={it.quantity}
                    onChange={(e) => {
                      const updated = [...issueForm.items];
                      updated[idx].quantity = e.target.value;
                      setIssueForm({ items: updated });
                    }}
                    className="w-full text-xs p-1.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    required
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowIssueModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Confirm Material Issue
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: RECORD OUTPUT / SCRAP */}
      <Modal
        isOpen={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        title="Record Production Completion & Scrap"
        description="Receives finished goods into target warehouse and records scrap metrics"
      >
        <form onSubmit={handlePostCompletion} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Completed Quantity (Yield)"
              type="number"
              min="0"
              step="0.001"
              value={completeForm.completed_quantity}
              onChange={(e) => setCompleteForm({ ...completeForm, completed_quantity: e.target.value })}
              required
              helperText="Added to warehouse finished stock"
            />

            <Input
              label="Scrapped / Defective Quantity"
              type="number"
              min="0"
              step="0.001"
              value={completeForm.scrapped_quantity}
              onChange={(e) => setCompleteForm({ ...completeForm, scrapped_quantity: e.target.value })}
              helperText="Logged as manufacturing scrap"
            />
          </div>

          <Input
            label="Finished Goods Batch / Lot #"
            value={completeForm.batch_number}
            onChange={(e) => setCompleteForm({ ...completeForm, batch_number: e.target.value })}
            placeholder="e.g. BATCH-2026-001"
          />

          <Input
            label="Completion Notes"
            value={completeForm.notes}
            onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
            placeholder="Inspection sign-off, operator remarks..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowCompleteModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Post Finished Goods Intake
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: LOG DOWNTIME */}
      <Modal
        isOpen={showDowntimeModal}
        onClose={() => setShowDowntimeModal(false)}
        title="Log Machine Workstation Downtime"
        description="Records equipment stoppage for OEE and production efficiency reports"
      >
        <form onSubmit={handleSaveDowntime} className="space-y-4">
          <Input
            label="Machine / Workstation Name"
            value={downtimeForm.machine_name}
            onChange={(e) => setDowntimeForm({ ...downtimeForm, machine_name: e.target.value })}
            required
            placeholder="e.g. Trumpf TruLaser 3030 Fiber"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Downtime Reason"
              value={downtimeForm.reason}
              onChange={(e) => setDowntimeForm({ ...downtimeForm, reason: e.target.value })}
            >
              <option value="breakdown">Unscheduled Breakdown</option>
              <option value="tool_change">Tool / Die Change</option>
              <option value="maintenance">Preventative Maintenance</option>
              <option value="material_shortage">Material Shortage</option>
              <option value="operator_unavailable">Operator Unavailable</option>
              <option value="setup">Setup & Programming</option>
              <option value="other">Other</option>
            </Select>

            <Input
              label="Duration (Minutes)"
              type="number"
              min="1"
              value={downtimeForm.duration_minutes}
              onChange={(e) => setDowntimeForm({ ...downtimeForm, duration_minutes: e.target.value })}
              required
            />
          </div>

          <Input
            label="Corrective Action / Remarks"
            value={downtimeForm.notes}
            onChange={(e) => setDowntimeForm({ ...downtimeForm, notes: e.target.value })}
            placeholder="Root cause, replacement parts used..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowDowntimeModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Record Machine Downtime
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: BOM DETAILS */}
      {selectedBomDetail && (
        <Modal
          isOpen={!!selectedBomDetail}
          onClose={() => setSelectedBomDetail(null)}
          title={`BOM Specification: ${selectedBomDetail.bom.bom_number}`}
          description={`${selectedBomDetail.bom.name} • Yield: ${selectedBomDetail.bom.output_quantity} ${selectedBomDetail.bom.uom_code}`}
          maxWidth="max-w-3xl"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Position</TableHead>
                <TableHead>Component SKU / Name</TableHead>
                <TableHead className="text-right">Quantity Required</TableHead>
                <TableHead className="text-right">Scrap Rate</TableHead>
                <TableHead>Assembly Routing Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedBomDetail.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">#{it.position}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{it.component_name}</div>
                    <div className="font-mono text-xs text-brand-600 dark:text-brand-400">{it.component_sku}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {it.quantity} {it.uom_code}
                  </TableCell>
                  <TableCell className="text-right font-mono text-slate-500">
                    {it.scrap_factor}%
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {it.notes || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Modal>
      )}
    </div>
  );
}

export default ProductionView;
