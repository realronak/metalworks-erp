import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Plus,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ClipboardCheck,
  Search,
  Filter,
  FileText,
  User,
  ExternalLink,
  ChevronRight
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

export function QualityView() {
  const notify = useNotification();

  const [activeTab, setActiveTab] = useState('inspections'); // 'inspections', 'plans', 'ncrs'
  const [inspections, setInspections] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Reference data
  const [plans, setPlans] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // Modals
  const [showCreateInspModal, setShowCreateInspModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showNcrModal, setShowNcrModal] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [selectedNcr, setSelectedNcr] = useState(null);

  // Forms
  const [inspForm, setInspForm] = useState({
    inspection_plan_id: '',
    inspection_type: 'incoming',
    product_id: '',
    batch_number: '',
    warehouse_id: '',
    inspected_quantity: 10,
    notes: ''
  });

  const [recordForm, setRecordForm] = useState({
    results: [],
    accepted_quantity: 0,
    rejected_quantity: 0,
    quarantined_quantity: 0,
    notes: '',
    auto_create_ncr: false
  });

  const [planForm, setPlanForm] = useState({
    title: '',
    type: 'incoming',
    product_id: '',
    checklist: [
      { parameter: 'Material Thickness Verification', unit: 'mm', min_val: 1.95, max_val: 2.05, critical: true },
      { parameter: 'Surface Visual Finish Inspection', unit: 'visual', min_val: null, max_val: null, critical: true }
    ]
  });

  const [ncrForm, setNcrForm] = useState({
    status: 'open',
    root_cause: '',
    corrective_action: '',
    assigned_to: ''
  });

  const loadReference = async () => {
    try {
      const [plansRes, prodRes, whRes, ncrsRes] = await Promise.all([
        api.get('/quality/plans'),
        api.get('/inventory/products?limit=100'),
        api.get('/inventory/warehouses'),
        api.get('/quality/ncrs')
      ]);
      setPlans(plansRes);
      setProducts(prodRes.data || []);
      setWarehouses(whRes);
      setNcrs(ncrsRes);
    } catch (err) {
      console.error('Failed to load quality reference data:', err);
    }
  };

  const loadInspections = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/quality/inspections', {
        status: statusFilter,
        type: typeFilter,
        search,
        page,
        limit: pagination.limit
      });
      setInspections(res.data);
      setPagination(res.pagination);
    } catch (err) {
      notify.error(err.message || 'Failed to load inspections');
    } finally {
      setLoading(false);
    }
  };

  const loadNcrs = async () => {
    try {
      const res = await api.get('/quality/ncrs');
      setNcrs(res);
    } catch (err) {
      notify.error(err.message || 'Failed to load NCRs');
    }
  };

  useEffect(() => {
    loadReference();
  }, []);

  useEffect(() => {
    if (activeTab === 'inspections') loadInspections(1);
    if (activeTab === 'ncrs') loadNcrs();
  }, [activeTab, statusFilter, typeFilter, search]);

  const handleCreateInspection = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/quality/inspections', inspForm);
      notify.success(`Inspection scheduled: ${res.inspection_number}`);
      setShowCreateInspModal(false);
      loadInspections(1);
    } catch (err) {
      notify.error(err.message || 'Failed to schedule inspection');
    }
  };

  const openRecordModal = async (insp) => {
    setSelectedInspection(insp);
    try {
      const detail = await api.get(`/quality/inspections/${insp.id}`);
      let checklist = detail.plan_checklist || [];
      if (!checklist || checklist.length === 0) {
        checklist = [
          { parameter: 'Dimensional Tolerance Check', unit: 'mm', min_val: 0, max_val: 10, critical: true },
          { parameter: 'Visual Surface Inspection', unit: 'visual', critical: true }
        ];
      }

      const results = checklist.map((ch) => ({
        parameter: ch.parameter,
        unit: ch.unit,
        min_val: ch.min_val,
        max_val: ch.max_val,
        critical: !!ch.critical,
        measured: '',
        pass: true
      }));

      setRecordForm({
        results,
        accepted_quantity: Number(insp.inspected_quantity),
        rejected_quantity: 0,
        quarantined_quantity: 0,
        notes: '',
        auto_create_ncr: false
      });
      setShowRecordModal(true);
    } catch (err) {
      notify.error('Failed to load inspection checklist');
    }
  };

  const handleSaveInspectionResults = async (e) => {
    e.preventDefault();
    try {
      const res = await api.put(`/quality/inspections/${selectedInspection.id}/record`, recordForm);
      notify.success(res.message);
      setShowRecordModal(false);
      setSelectedInspection(null);
      loadInspections(pagination.page);
      loadNcrs();
    } catch (err) {
      notify.error(err.message || 'Failed to record inspection');
    }
  };

  const handleUpdateNcr = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/quality/ncrs/${selectedNcr.id}`, ncrForm);
      notify.success('Nonconformance report updated');
      setShowNcrModal(false);
      setSelectedNcr(null);
      loadNcrs();
    } catch (err) {
      notify.error(err.message || 'Failed to update NCR');
    }
  };

  const handleAddPlanChecklistItem = () => {
    setPlanForm({
      ...planForm,
      checklist: [
        ...planForm.checklist,
        { parameter: 'New Parameter Check', unit: 'mm', min_val: null, max_val: null, critical: false }
      ]
    });
  };

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    try {
      await api.post('/quality/plans', planForm);
      notify.success('Inspection plan created');
      setShowPlanModal(false);
      api.get('/quality/plans').then(setPlans);
    } catch (err) {
      notify.error(err.message || 'Failed to create plan');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Quality Assurance & Nonconformance Control
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Incoming, in-process, and final inspection checklists, numeric caliper limits, and CAPA resolution
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowPlanModal(true)}
            icon={FileText}
          >
            Create Inspection Plan
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setInspForm({
                inspection_plan_id: plans[0]?.id || '',
                inspection_type: 'incoming',
                product_id: products[0]?.id || '',
                batch_number: '',
                warehouse_id: warehouses[0]?.id || '',
                inspected_quantity: 10,
                notes: ''
              });
              setShowCreateInspModal(true);
            }}
            icon={Plus}
          >
            Schedule Inspection
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold gap-6">
        <button
          onClick={() => setActiveTab('inspections')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'inspections'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Inspections Pipeline ({pagination.total})
        </button>

        <button
          onClick={() => setActiveTab('ncrs')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'ncrs'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <AlertOctagon className="w-4 h-4 text-rose-500" />
          Nonconformance Reports (NCR) ({ncrs.length})
        </button>

        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'plans'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Inspection Plans ({plans.length})
        </button>
      </div>

      {/* TAB 1: INSPECTIONS PIPELINE */}
      {activeTab === 'inspections' && (
        <Card>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <input
                type="text"
                placeholder="Search inspection #, product, batch..."
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
                <option value="pending">Pending</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="conditional">Conditional Pass</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
              >
                <option value="">All Types</option>
                <option value="incoming">Incoming Material</option>
                <option value="in_process">In-Process Shop Floor</option>
                <option value="final">Final Assembly</option>
              </select>
            </div>
          </div>

          {loading ? (
            <LoadingSpinner text="Querying quality inspections..." />
          ) : inspections.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No inspections found"
              description="No inspection records match your current filter settings."
              action={
                <Button size="sm" onClick={() => setShowCreateInspModal(true)}>
                  Schedule Inspection
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inspection #</TableHead>
                    <TableHead>Product / Material</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Inspected Qty</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead>Inspector / Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map((insp) => (
                    <TableRow key={insp.id}>
                      <TableCell className="font-mono font-bold text-brand-600 dark:text-brand-400">
                        {insp.inspection_number}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{insp.product_name}</div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {insp.sku} {insp.batch_number && `• Lot: ${insp.batch_number}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="info">{insp.inspection_type.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={insp.status}>{insp.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {insp.inspected_quantity} {insp.uom_code}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {insp.accepted_quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono text-rose-600 dark:text-rose-400 font-bold">
                        {insp.rejected_quantity}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        <div>{insp.inspector_name || 'Unassigned'}</div>
                        <div className="text-[10px] text-slate-400">
                          {insp.inspected_at ? new Date(insp.inspected_at).toLocaleDateString() : 'Awaiting signoff'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {insp.status === 'pending' ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => openRecordModal(insp)}
                            icon={ClipboardCheck}
                          >
                            Record Checklist
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openRecordModal(insp)}
                          >
                            View Checklist
                          </Button>
                        )}
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
                onPageChange={(page) => loadInspections(page)}
              />
            </>
          )}
        </Card>
      )}

      {/* TAB 2: NONCONFORMANCE REPORTS (NCR) */}
      {activeTab === 'ncrs' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NCR Number</TableHead>
                <TableHead>Title / Description</TableHead>
                <TableHead>Product / SKU</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reported By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ncrs.map((ncr) => (
                <TableRow key={ncr.id}>
                  <TableCell className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {ncr.ncr_number}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{ncr.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{ncr.description}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100">{ncr.product_name}</div>
                    <div className="text-[10px] font-mono text-slate-400">{ncr.product_sku}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ncr.severity}>{ncr.severity}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ncr.status}>{ncr.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {ncr.reported_by_name || 'Quality Team'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedNcr(ncr);
                        setNcrForm({
                          status: ncr.status,
                          root_cause: ncr.root_cause || '',
                          corrective_action: ncr.corrective_action || '',
                          assigned_to: ncr.assigned_to || ''
                        });
                        setShowNcrModal(true);
                      }}
                    >
                      CAPA Action
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* TAB 3: INSPECTION PLANS */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div>
                  <span className="font-mono text-[10px] text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider">
                    {p.code}
                  </span>
                  <CardTitle className="mt-0.5">{p.title}</CardTitle>
                </div>
                <Badge variant="info">{p.type}</Badge>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Product Target: <strong className="text-slate-800 dark:text-slate-200">{p.product_name || 'General Raw Stock'}</strong>
                </div>

                <div className="border border-slate-100 dark:border-slate-800 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/40 mb-3 space-y-1.5 text-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Checklist Parameters:</div>
                  {(Array.isArray(p.checklist) ? p.checklist : []).map((ch, idx) => (
                    <div key={idx} className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                      <span>• {ch.parameter}</span>
                      {ch.min_val !== null && (
                        <span className="font-mono text-[10px] text-slate-400">
                          [{ch.min_val} - {ch.max_val} {ch.unit}]
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL: SCHEDULE INSPECTION */}
      <Modal
        isOpen={showCreateInspModal}
        onClose={() => setShowCreateInspModal(false)}
        title="Schedule Quality Inspection"
        description="Initiate incoming, in-process, or final product inspection checklist"
      >
        <form onSubmit={handleCreateInspection} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Inspection Type"
              value={inspForm.inspection_type}
              onChange={(e) => setInspForm({ ...inspForm, inspection_type: e.target.value })}
            >
              <option value="incoming">Incoming Material (Raw Stock / Fasteners)</option>
              <option value="in_process">In-Process (Fabrication / Bending)</option>
              <option value="final">Final Assembly & Enclosure</option>
            </Select>

            <Select
              label="Inspection Plan / Rules"
              value={inspForm.inspection_plan_id}
              onChange={(e) => setInspForm({ ...inspForm, inspection_plan_id: e.target.value })}
            >
              <option value="">Default General Standard Plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.title} ({p.code})</option>
              ))}
            </Select>
          </div>

          <Select
            label="Product to Inspect"
            value={inspForm.product_id}
            onChange={(e) => setInspForm({ ...inspForm, product_id: e.target.value })}
            required
          >
            <option value="">Select Product SKU</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
            ))}
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Batch / Heat Lot #"
              value={inspForm.batch_number}
              onChange={(e) => setInspForm({ ...inspForm, batch_number: e.target.value })}
              placeholder="e.g. LOT-2026-001"
            />

            <Input
              label="Sampling / Inspection Quantity"
              type="number"
              min="1"
              value={inspForm.inspected_quantity}
              onChange={(e) => setInspForm({ ...inspForm, inspected_quantity: e.target.value })}
              required
            />
          </div>

          <Input
            label="Inspector Inspection Notes"
            value={inspForm.notes}
            onChange={(e) => setInspForm({ ...inspForm, notes: e.target.value })}
            placeholder="Special callouts from engineering drawings..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowCreateInspModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Schedule Inspection
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: RECORD INSPECTION RESULTS (STRICT TOLERANCE VALIDATION) */}
      {selectedInspection && (
        <Modal
          isOpen={showRecordModal}
          onClose={() => setShowRecordModal(false)}
          title={`Record Results: ${selectedInspection.inspection_number}`}
          description={`Product: ${selectedInspection.product_name} • Sample Qty: ${selectedInspection.inspected_quantity}`}
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleSaveInspectionResults} className="space-y-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Measurement & Tolerance Checklist:
              </div>
              <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                {recordForm.results.map((res, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded-md border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-4 text-xs">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        {res.parameter}
                        {res.critical && <span className="text-[10px] text-rose-500 font-bold uppercase">(Critical)</span>}
                      </div>
                      {res.min_val !== null && (
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          Allowed: {res.min_val} to {res.max_val} {res.unit}
                        </div>
                      )}
                    </div>

                    <div className="w-32">
                      <input
                        type="text"
                        placeholder="Measured value"
                        value={res.measured}
                        onChange={(e) => {
                          const updated = [...recordForm.results];
                          const val = e.target.value;
                          updated[idx].measured = val;

                          // Auto check numeric tolerance if applicable
                          const num = parseFloat(val);
                          if (!isNaN(num) && updated[idx].min_val !== null && updated[idx].max_val !== null) {
                            updated[idx].pass = num >= updated[idx].min_val && num <= updated[idx].max_val;
                          }

                          setRecordForm({ ...recordForm, results: updated });
                        }}
                        className="w-full text-xs p-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        required
                      />
                    </div>

                    <div>
                      <select
                        value={res.pass ? 'pass' : 'fail'}
                        onChange={(e) => {
                          const updated = [...recordForm.results];
                          updated[idx].pass = e.target.value === 'pass';
                          setRecordForm({ ...recordForm, results: updated });
                        }}
                        className={`text-xs p-1.5 font-semibold rounded border ${
                          res.pass
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
                        }`}
                      >
                        <option value="pass">PASS</option>
                        <option value="fail">FAIL</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Accepted Quantity"
                type="number"
                min="0"
                value={recordForm.accepted_quantity}
                onChange={(e) => setRecordForm({ ...recordForm, accepted_quantity: e.target.value })}
                required
              />

              <Input
                label="Rejected Quantity"
                type="number"
                min="0"
                value={recordForm.rejected_quantity}
                onChange={(e) => setRecordForm({ ...recordForm, rejected_quantity: e.target.value })}
              />

              <Input
                label="Quarantined Quantity"
                type="number"
                min="0"
                value={recordForm.quarantined_quantity}
                onChange={(e) => setRecordForm({ ...recordForm, quarantined_quantity: e.target.value })}
              />
            </div>

            <Input
              label="Inspector Sign-off Remarks"
              value={recordForm.notes}
              onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })}
              placeholder="Calipers calibrated on date, optical comparator inspection..."
            />

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="secondary" onClick={() => setShowRecordModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Submit Quality Inspection
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: NCR CAPA RESOLUTION */}
      {selectedNcr && (
        <Modal
          isOpen={showNcrModal}
          onClose={() => setShowNcrModal(false)}
          title={`Corrective Action: ${selectedNcr.ncr_number}`}
          description={`Issue: ${selectedNcr.title}`}
        >
          <form onSubmit={handleUpdateNcr} className="space-y-4">
            <Select
              label="NCR Lifecycle Status"
              value={ncrForm.status}
              onChange={(e) => setNcrForm({ ...ncrForm, status: e.target.value })}
            >
              <option value="open">Open</option>
              <option value="under_review">Under Engineering Review</option>
              <option value="action_pending">Corrective Action Pending</option>
              <option value="resolved">Resolved & Verified</option>
              <option value="closed">Closed</option>
            </Select>

            <Input
              label="Root Cause Analysis (5-Why)"
              value={ncrForm.root_cause}
              onChange={(e) => setNcrForm({ ...ncrForm, root_cause: e.target.value })}
              placeholder="e.g. Worn punch die edge caused burrs on stamped sheet edges..."
            />

            <Input
              label="Corrective & Preventive Action (CAPA)"
              value={ncrForm.corrective_action}
              onChange={(e) => setNcrForm({ ...ncrForm, corrective_action: e.target.value })}
              placeholder="e.g. Die replacement, CNC program feed rate adjusted..."
            />

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="secondary" onClick={() => setShowNcrModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Update CAPA Record
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: CREATE INSPECTION PLAN */}
      <Modal
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        title="Create Quality Inspection Plan"
        description="Establish repeatable quality checklists and tolerance bounds"
      >
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <Input
            label="Plan Title"
            value={planForm.title}
            onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
            required
            placeholder="e.g. Sheet Metal Thickness & Burr Inspection Plan"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Plan Type"
              value={planForm.type}
              onChange={(e) => setPlanForm({ ...planForm, type: e.target.value })}
            >
              <option value="incoming">Incoming Material</option>
              <option value="in_process">In-Process</option>
              <option value="final">Final Assembly</option>
            </Select>

            <Select
              label="Target Product (Optional)"
              value={planForm.product_id}
              onChange={(e) => setPlanForm({ ...planForm, product_id: e.target.value })}
            >
              <option value="">General (All Products)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowPlanModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Inspection Plan
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default QualityView;
