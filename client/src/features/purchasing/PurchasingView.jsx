import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  CheckCircle,
  XCircle,
  PackageCheck,
  Search,
  Filter,
  Users,
  FileText,
  Trash2,
  Calendar,
  AlertCircle
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

export function PurchasingView() {
  const notify = useNotification();

  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'suppliers', 'receipts'
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Reference data
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // Modals
  const [showPoModal, setShowPoModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);

  // Forms
  const [poForm, setPoForm] = useState({
    supplier_id: '',
    expected_delivery_date: '',
    notes: '',
    items: [
      { product_id: '', quantity: 10, unit_price: 0, tax_rate: 8 }
    ]
  });

  const [supplierForm, setSupplierForm] = useState({
    code: '',
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    tax_id: '',
    payment_terms: 'Net 30'
  });

  const [receiptForm, setReceiptForm] = useState({
    purchase_order_id: '',
    warehouse_id: '',
    supplier_delivery_note: '',
    notes: '',
    items: []
  });

  const loadReference = async () => {
    try {
      const [supRes, prodRes, whRes] = await Promise.all([
        api.get('/purchasing/suppliers'),
        api.get('/inventory/products?limit=100'),
        api.get('/inventory/warehouses')
      ]);
      setSuppliers(supRes);
      setProducts(prodRes.data || []);
      setWarehouses(whRes);
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  };

  const loadOrders = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/purchasing/orders', {
        status: statusFilter,
        search,
        page,
        limit: pagination.limit
      });
      setOrders(res.data);
      setPagination(res.pagination);
    } catch (err) {
      notify.error(err.message || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const res = await api.get('/purchasing/suppliers');
      setSuppliers(res);
    } catch (err) {
      notify.error(err.message || 'Failed to load suppliers');
    }
  };

  useEffect(() => {
    loadReference();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') loadOrders(1);
    if (activeTab === 'suppliers') loadSuppliers();
  }, [activeTab, statusFilter, search]);

  const handleAddLineItem = () => {
    setPoForm({
      ...poForm,
      items: [...poForm.items, { product_id: '', quantity: 1, unit_price: 0, tax_rate: 8 }]
    });
  };

  const handleRemoveLineItem = (index) => {
    if (poForm.items.length === 1) return;
    setPoForm({
      ...poForm,
      items: poForm.items.filter((_, i) => i !== index)
    });
  };

  const handleLineItemChange = (index, field, value) => {
    const updated = [...poForm.items];
    updated[index][field] = value;

    // Auto-fill unit_cost if product selected
    if (field === 'product_id') {
      const selected = products.find(p => String(p.id) === String(value));
      if (selected) {
        updated[index].unit_price = Number(selected.unit_cost) || 0;
      }
    }

    setPoForm({ ...poForm, items: updated });
  };

  const handleCreatePo = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/purchasing/orders', poForm);
      notify.success(`Purchase order created: ${res.po_number}`);
      setShowPoModal(false);
      loadOrders(1);
    } catch (err) {
      notify.error(err.message || 'Failed to create purchase order');
    }
  };

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    try {
      await api.post('/purchasing/suppliers', supplierForm);
      notify.success('Supplier record added');
      setShowSupplierModal(false);
      loadSuppliers();
    } catch (err) {
      notify.error(err.message || 'Failed to add supplier');
    }
  };

  const handleViewOrder = async (orderId) => {
    try {
      const res = await api.get(`/purchasing/orders/${orderId}`);
      setOrderDetail(res);
      setSelectedOrder(res.order);
    } catch (err) {
      notify.error(err.message || 'Failed to fetch order details');
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      await api.put(`/purchasing/orders/${orderId}/status`, { status: newStatus });
      notify.success(`Purchase order marked as ${newStatus.toUpperCase()}`);
      loadOrders(pagination.page);
      if (selectedOrder) handleViewOrder(orderId);
    } catch (err) {
      notify.error(err.message || 'Failed to update order status');
    }
  };

  const openGoodsReceiptModal = (orderWithDetails) => {
    const defaultWh = warehouses[0]?.id || '';
    const receiptItems = (orderWithDetails.items || [])
      .filter(item => Number(item.remaining_quantity) > 0)
      .map(item => ({
        po_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        remaining_quantity: Number(item.remaining_quantity),
        quantity_received: Number(item.remaining_quantity),
        batch_number: `LOT-${orderWithDetails.order.po_number}-${item.sku}`,
        location_id: ''
      }));

    setReceiptForm({
      purchase_order_id: orderWithDetails.order.id,
      warehouse_id: defaultWh,
      supplier_delivery_note: '',
      notes: `Receipt for ${orderWithDetails.order.po_number}`,
      items: receiptItems
    });

    setShowReceiptModal(true);
  };

  const handlePostReceipt = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/purchasing/receipts', receiptForm);
      notify.success(`Goods Receipt ${res.receipt.receipt_number} posted! Stock levels updated.`);
      setShowReceiptModal(false);
      setOrderDetail(null);
      setSelectedOrder(null);
      loadOrders(pagination.page);
    } catch (err) {
      notify.error(err.message || 'Failed to post goods receipt');
    }
  };

  // Compute PO Form summary
  const subtotal = poForm.items.reduce((acc, it) => acc + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0);
  const tax = poForm.items.reduce((acc, it) => acc + ((Number(it.quantity || 0) * Number(it.unit_price || 0)) * (Number(it.tax_rate || 0) / 100)), 0);
  const total = subtotal + tax;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Purchasing & Procurement
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Vendor management, purchase orders, approval workflows, and warehouse goods intake
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowSupplierModal(true)}
            icon={Users}
          >
            Add Supplier
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setPoForm({
                supplier_id: suppliers[0]?.id || '',
                expected_delivery_date: '',
                notes: '',
                items: [
                  { product_id: products[0]?.id || '', quantity: 10, unit_price: Number(products[0]?.unit_cost || 0), tax_rate: 8 }
                ]
              });
              setShowPoModal(true);
            }}
            icon={Plus}
          >
            Create Purchase Order
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
          <ShoppingBag className="w-4 h-4" />
          Purchase Orders ({pagination.total})
        </button>

        <button
          onClick={() => setActiveTab('suppliers')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'suppliers'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Suppliers Directory ({suppliers.length})
        </button>
      </div>

      {/* TAB 1: PURCHASE ORDERS */}
      {activeTab === 'orders' && (
        <Card>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by PO number, supplier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="partially_received">Partially Received</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {loading ? (
            <LoadingSpinner text="Fetching purchase orders..." />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No purchase orders"
              description="No purchase order records match your criteria."
              action={
                <Button size="sm" onClick={() => setShowPoModal(true)}>
                  Create New PO
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Expected Delivery</TableHead>
                    <TableHead className="text-right">Line Items</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-mono font-bold text-brand-600 dark:text-brand-400">
                        {po.po_number}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{po.supplier_name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{po.supplier_code}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={po.status}>{po.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(po.order_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {po.line_item_count}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        ${Number(po.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewOrder(po.id)}
                        >
                          View Details
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
                onPageChange={(page) => loadOrders(page)}
              />
            </>
          )}
        </Card>
      )}

      {/* TAB 2: SUPPLIERS */}
      {activeTab === 'suppliers' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Code / Name</TableHead>
                <TableHead>Primary Contact</TableHead>
                <TableHead>Email / Phone</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead className="text-right">Total Orders</TableHead>
                <TableHead className="text-right">Lifetime Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</div>
                    <div className="text-xs font-mono text-brand-600 dark:text-brand-400 mt-0.5">{s.code}</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700 dark:text-slate-300">
                    {s.contact_name || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    <div>{s.email || '—'}</div>
                    <div className="text-[10px] text-slate-400">{s.phone}</div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      {s.payment_terms}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.po_count || 0}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    ${Number(s.total_spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* MODAL: CREATE PURCHASE ORDER */}
      <Modal
        isOpen={showPoModal}
        onClose={() => setShowPoModal(false)}
        title="Create Purchase Order"
        description="Generates an atomic sequence PO number and sets initial draft state"
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleCreatePo} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Supplier"
              value={poForm.supplier_id}
              onChange={(e) => setPoForm({ ...poForm, supplier_id: e.target.value })}
              required
            >
              <option value="">Select Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </Select>

            <Input
              label="Expected Delivery Date"
              type="date"
              value={poForm.expected_delivery_date}
              onChange={(e) => setPoForm({ ...poForm, expected_delivery_date: e.target.value })}
            />
          </div>

          {/* Line items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Purchase Order Line Items ({poForm.items.length})
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={handleAddLineItem} icon={Plus}>
                Add Item
              </Button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5">Product SKU</th>
                    <th className="p-2.5 w-24 text-right">Quantity</th>
                    <th className="p-2.5 w-32 text-right">Unit Price ($)</th>
                    <th className="p-2.5 w-24 text-right">Tax (%)</th>
                    <th className="p-2.5 w-28 text-right">Line Total</th>
                    <th className="p-2.5 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {poForm.items.map((line, idx) => {
                    const lineSub = Number(line.quantity || 0) * Number(line.unit_price || 0);
                    const lineTax = lineSub * (Number(line.tax_rate || 0) / 100);
                    const lineTotal = lineSub + lineTax;

                    return (
                      <tr key={idx}>
                        <td className="p-2">
                          <select
                            value={line.product_id}
                            onChange={(e) => handleLineItemChange(idx, 'product_id', e.target.value)}
                            className="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                            required
                          >
                            <option value="">Select Item</option>
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
                            value={line.quantity}
                            onChange={(e) => handleLineItemChange(idx, 'quantity', e.target.value)}
                            className="w-full text-xs p-1.5 text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => handleLineItemChange(idx, 'unit_price', e.target.value)}
                            className="w-full text-xs p-1.5 text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={line.tax_rate}
                            onChange={(e) => handleLineItemChange(idx, 'tax_rate', e.target.value)}
                            className="w-full text-xs p-1.5 text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-semibold">
                          ${lineTotal.toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLineItem(idx)}
                            className="text-slate-400 hover:text-rose-500"
                            title="Remove line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Calculations Summary */}
            <div className="flex justify-end mt-3">
              <div className="w-64 space-y-1.5 text-xs text-right">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span className="font-mono font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tax Amount:</span>
                  <span className="font-mono font-medium">${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-900 dark:text-slate-100 font-bold border-t border-slate-200 dark:border-slate-800 pt-1.5 text-sm">
                  <span>Total Amount:</span>
                  <span className="font-mono text-brand-600 dark:text-brand-400">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <Input
            label="Internal Notes"
            value={poForm.notes}
            onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
            placeholder="Special delivery instructions, contact details..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowPoModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Purchase Order
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: ADD SUPPLIER */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title="Add Supplier Record"
        description="Add a new verified raw materials or components vendor"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          <Input
            label="Supplier Company Name"
            value={supplierForm.name}
            onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
            required
            placeholder="e.g. Apex Industrial Steel Corp"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Supplier Code (Optional)"
              value={supplierForm.code}
              onChange={(e) => setSupplierForm({ ...supplierForm, code: e.target.value })}
              placeholder="e.g. SUP-004"
            />
            <Input
              label="Contact Person"
              value={supplierForm.contact_name}
              onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })}
              placeholder="e.g. John Doe"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={supplierForm.email}
              onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
              placeholder="orders@supplier.com"
            />
            <Input
              label="Phone"
              value={supplierForm.phone}
              onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <Input
            label="Billing & Dispatch Address"
            value={supplierForm.address}
            onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
            placeholder="City, State, Zip, Country"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Tax Registration ID"
              value={supplierForm.tax_id}
              onChange={(e) => setSupplierForm({ ...supplierForm, tax_id: e.target.value })}
              placeholder="e.g. US-TAX-12345"
            />
            <Input
              label="Payment Terms"
              value={supplierForm.payment_terms}
              onChange={(e) => setSupplierForm({ ...supplierForm, payment_terms: e.target.value })}
              placeholder="e.g. Net 30, Net 45"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowSupplierModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Supplier
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: VIEW PO DETAILS & ACTIONS */}
      {orderDetail && (
        <Modal
          isOpen={!!orderDetail}
          onClose={() => setOrderDetail(null)}
          title={`Purchase Order: ${orderDetail.order.po_number}`}
          description={`Issued to ${orderDetail.order.supplier_name}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-6">
            {/* Status & Actions Header */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Badge variant={orderDetail.order.status} size="md">
                  {orderDetail.order.status}
                </Badge>
                <div className="text-xs text-slate-500">
                  Ordered on {new Date(orderDetail.order.order_date).toLocaleDateString()}
                  {orderDetail.order.approver_name && ` • Approved by ${orderDetail.order.approver_name}`}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {orderDetail.order.status === 'draft' && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleUpdateStatus(orderDetail.order.id, 'approved')}
                      icon={CheckCircle}
                    >
                      Approve PO
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleUpdateStatus(orderDetail.order.id, 'cancelled')}
                      icon={XCircle}
                    >
                      Cancel PO
                    </Button>
                  </>
                )}

                {['approved', 'partially_received'].includes(orderDetail.order.status) && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openGoodsReceiptModal(orderDetail)}
                    icon={PackageCheck}
                  >
                    Receive Goods (GRN)
                  </Button>
                )}
              </div>
            </div>

            {/* Line items table with received progress */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Ordered Items Breakdown
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product / SKU</TableHead>
                    <TableHead className="text-right">Ordered Qty</TableHead>
                    <TableHead className="text-right">Received Qty</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderDetail.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{item.product_name}</div>
                        <div className="font-mono text-xs text-slate-400">{item.sku}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{item.quantity} {item.uom_code}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {item.received_quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {item.remaining_quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono">${Number(item.unit_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono font-bold">${Number(item.line_total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Past Goods Receipts */}
            {orderDetail.receipts && orderDetail.receipts.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Posted Goods Receipts History
                </h4>
                <div className="space-y-2">
                  {orderDetail.receipts.map((gr) => (
                    <div key={gr.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{gr.receipt_number}</span>
                        <span className="text-slate-400 mx-2">•</span>
                        <span className="text-slate-600 dark:text-slate-300">Received at {gr.warehouse_name}</span>
                        {gr.supplier_delivery_note && (
                          <span className="text-slate-400 ml-2">(DN: {gr.supplier_delivery_note})</span>
                        )}
                      </div>
                      <div className="text-slate-500">
                        {new Date(gr.receipt_date).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* MODAL: GOODS RECEIPT (GRN INTAKE TO INVENTORY) */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title="Receive Goods (Stock Intake)"
        description="Validates quantities, increases inventory balance, and posts auditable ledger entries"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handlePostReceipt} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Receiving Warehouse Facility"
              value={receiptForm.warehouse_id}
              onChange={(e) => setReceiptForm({ ...receiptForm, warehouse_id: e.target.value })}
              required
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </Select>

            <Input
              label="Supplier Delivery Note #"
              value={receiptForm.supplier_delivery_note}
              onChange={(e) => setReceiptForm({ ...receiptForm, supplier_delivery_note: e.target.value })}
              placeholder="e.g. DN-19820-A"
            />
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Items to Receive:
            </div>
            <div className="space-y-3">
              {receiptForm.items.map((it, idx) => (
                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center gap-3">
                  <div className="flex-1">
                    <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">{it.product_name}</div>
                    <div className="text-[10px] font-mono text-slate-400">
                      SKU: {it.sku} • Outstanding Ordered: {it.remaining_quantity}
                    </div>
                  </div>

                  <div className="w-32">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Receive Qty</label>
                    <input
                      type="number"
                      max={it.remaining_quantity}
                      min="0.001"
                      step="0.001"
                      value={it.quantity_received}
                      onChange={(e) => {
                        const updated = [...receiptForm.items];
                        updated[idx].quantity_received = e.target.value;
                        setReceiptForm({ ...receiptForm, items: updated });
                      }}
                      className="w-full text-xs p-1.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      required
                    />
                  </div>

                  <div className="w-44">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Batch / Lot #</label>
                    <input
                      type="text"
                      value={it.batch_number}
                      onChange={(e) => {
                        const updated = [...receiptForm.items];
                        updated[idx].batch_number = e.target.value;
                        setReceiptForm({ ...receiptForm, items: updated });
                      }}
                      className="w-full text-xs p-1.5 font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Input
            label="Receipt Inspection Notes"
            value={receiptForm.notes}
            onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })}
            placeholder="Inspection visual condition, pallet condition..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowReceiptModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Post Goods Receipt & Increase Stock
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default PurchasingView;
