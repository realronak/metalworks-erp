import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Plus,
  Truck,
  FileCheck,
  Search,
  DollarSign,
  CheckCircle,
  CreditCard,
  UserCheck,
  Trash2
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

export function SalesView() {
  const notify = useNotification();

  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'customers', 'invoices'
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Reference data
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // Modals
  const [showSoModal, setShowSoModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Invoices list
  const [invoices, setInvoices] = useState([]);

  // Forms
  const [soForm, setSoForm] = useState({
    customer_id: '',
    delivery_date: '',
    notes: '',
    is_quote: false,
    items: [
      { product_id: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 8 }
    ]
  });

  const [customerForm, setCustomerForm] = useState({
    code: '',
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    billing_address: '',
    shipping_address: '',
    tax_id: '',
    payment_terms: 'Net 30',
    credit_limit: 50000
  });

  const [deliveryForm, setDeliveryForm] = useState({
    sales_order_id: '',
    warehouse_id: '',
    tracking_number: '',
    notes: '',
    items: []
  });

  const [paymentForm, setPaymentForm] = useState({
    amount_paid: 0,
    payment_method: 'Wire Transfer',
    payment_reference: ''
  });

  const loadReference = async () => {
    try {
      const [custRes, prodRes, whRes] = await Promise.all([
        api.get('/sales/customers'),
        api.get('/inventory/products?limit=100'),
        api.get('/inventory/warehouses')
      ]);
      setCustomers(custRes);
      setProducts(prodRes.data || []);
      setWarehouses(whRes);
    } catch (err) {
      console.error('Failed to load sales reference data:', err);
    }
  };

  const loadOrders = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/sales/orders', {
        status: statusFilter,
        search,
        page,
        limit: pagination.limit
      });
      setOrders(res.data);
      setPagination(res.pagination);
    } catch (err) {
      notify.error(err.message || 'Failed to load sales orders');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await api.get('/sales/customers');
      setCustomers(res);
    } catch (err) {
      notify.error(err.message || 'Failed to load customers');
    }
  };

  const loadInvoices = async () => {
    try {
      const res = await api.get('/sales/invoices');
      setInvoices(res);
    } catch (err) {
      notify.error(err.message || 'Failed to load invoices');
    }
  };

  useEffect(() => {
    loadReference();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') loadOrders(1);
    if (activeTab === 'customers') loadCustomers();
    if (activeTab === 'invoices') loadInvoices();
  }, [activeTab, statusFilter, search]);

  const handleAddLineItem = () => {
    setSoForm({
      ...soForm,
      items: [...soForm.items, { product_id: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 8 }]
    });
  };

  const handleRemoveLineItem = (index) => {
    if (soForm.items.length === 1) return;
    setSoForm({
      ...soForm,
      items: soForm.items.filter((_, i) => i !== index)
    });
  };

  const handleLineItemChange = (index, field, value) => {
    const updated = [...soForm.items];
    updated[index][field] = value;

    if (field === 'product_id') {
      const selected = products.find(p => String(p.id) === String(value));
      if (selected) {
        updated[index].unit_price = Number(selected.selling_price) || Number(selected.unit_cost) * 1.5;
      }
    }

    setSoForm({ ...soForm, items: updated });
  };

  const handleCreateSo = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/sales/orders', soForm);
      notify.success(`Sales order created: ${res.so_number}`);
      setShowSoModal(false);
      loadOrders(1);
    } catch (err) {
      notify.error(err.message || 'Failed to create sales order');
    }
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    try {
      await api.post('/sales/customers', customerForm);
      notify.success('Customer account created');
      setShowCustomerModal(false);
      loadCustomers();
    } catch (err) {
      notify.error(err.message || 'Failed to create customer');
    }
  };

  const handleViewOrder = async (orderId) => {
    try {
      const res = await api.get(`/sales/orders/${orderId}`);
      setOrderDetail(res);
      setSelectedOrder(res.order);
    } catch (err) {
      notify.error(err.message || 'Failed to fetch order details');
    }
  };

  const openDeliveryModal = (orderWithDetails) => {
    const defaultWh = warehouses[0]?.id || '';
    const deliveryItems = (orderWithDetails.items || [])
      .filter(item => Number(item.remaining_delivery_quantity) > 0)
      .map(item => ({
        so_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        remaining_quantity: Number(item.remaining_delivery_quantity),
        quantity: Number(item.remaining_delivery_quantity),
        location_id: ''
      }));

    setDeliveryForm({
      sales_order_id: orderWithDetails.order.id,
      warehouse_id: defaultWh,
      tracking_number: `TRK-${Math.floor(100000 + Math.random() * 900000)}`,
      notes: `Fulfillment for ${orderWithDetails.order.so_number}`,
      items: deliveryItems
    });

    setShowDeliveryModal(true);
  };

  const handleDispatchDelivery = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/sales/deliveries', deliveryForm);
      notify.success(`Delivery ${res.delivery.delivery_number} dispatched! Inventory deducted.`);
      setShowDeliveryModal(false);
      setOrderDetail(null);
      setSelectedOrder(null);
      loadOrders(pagination.page);
    } catch (err) {
      notify.error(err.message || 'Failed to dispatch delivery');
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/sales/invoices/${selectedInvoice.id}/payment`, paymentForm);
      notify.success('Payment recorded successfully');
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      loadInvoices();
    } catch (err) {
      notify.error(err.message || 'Failed to record payment');
    }
  };

  // Compute subtotal, discount, tax, total
  const subtotal = soForm.items.reduce((acc, it) => acc + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0);
  const discount = soForm.items.reduce((acc, it) => acc + ((Number(it.quantity || 0) * Number(it.unit_price || 0)) * (Number(it.discount_percent || 0) / 100)), 0);
  const tax = (subtotal - discount) * 0.08;
  const total = subtotal - discount + tax;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Sales & Customer Fulfillment
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Client quotes, sales orders, warehouse dispatch fulfillment, and invoice collections
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCustomerModal(true)}
            icon={UserCheck}
          >
            Add Customer
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setSoForm({
                customer_id: customers[0]?.id || '',
                delivery_date: '',
                notes: '',
                is_quote: false,
                items: [
                  { product_id: products[0]?.id || '', quantity: 1, unit_price: Number(products[0]?.selling_price || 0), discount_percent: 0, tax_rate: 8 }
                ]
              });
              setShowSoModal(true);
            }}
            icon={Plus}
          >
            Create Sales Order
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
          <ShoppingCart className="w-4 h-4" />
          Sales Orders ({pagination.total})
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'customers'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Customers ({customers.length})
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'invoices'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          Invoices & Payments
        </button>
      </div>

      {/* TAB 1: SALES ORDERS */}
      {activeTab === 'orders' && (
        <Card>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by SO number, customer..."
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
                <option value="quotation">Quotation</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_production">In Production</option>
                <option value="partially_delivered">Partially Delivered</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {loading ? (
            <LoadingSpinner text="Fetching sales orders from PostgreSQL..." />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="No sales orders"
              description="No sales order records match your criteria."
              action={
                <Button size="sm" onClick={() => setShowSoModal(true)}>
                  Create Sales Order
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SO Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Target Delivery</TableHead>
                    <TableHead className="text-right">Line Items</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((so) => (
                    <TableRow key={so.id}>
                      <TableCell className="font-mono font-bold text-brand-600 dark:text-brand-400">
                        {so.so_number}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{so.customer_name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{so.customer_code}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={so.status}>{so.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(so.order_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {so.delivery_date ? new Date(so.delivery_date).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {so.line_item_count}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        ${Number(so.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewOrder(so.id)}
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

      {/* TAB 2: CUSTOMERS */}
      {activeTab === 'customers' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Code / Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Email / Phone</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead className="text-right">Credit Limit</TableHead>
                <TableHead className="text-right">Lifetime Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{c.name}</div>
                    <div className="text-xs font-mono text-brand-600 dark:text-brand-400 mt-0.5">{c.code}</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700 dark:text-slate-300">
                    {c.contact_name || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    <div>{c.email || '—'}</div>
                    <div className="text-[10px] text-slate-400">{c.phone}</div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      {c.payment_terms}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${Number(c.credit_limit || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    ${Number(c.total_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* TAB 3: INVOICES & PAYMENTS */}
      {activeTab === 'invoices' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">Paid Amount</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const balanceDue = Number(inv.total_amount) - Number(inv.paid_amount);
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono font-bold text-brand-600 dark:text-brand-400">
                      {inv.invoice_number}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{inv.customer_name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{inv.customer_code}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={inv.status}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(inv.issue_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(inv.due_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      ${Number(inv.total_amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      ${Number(inv.paid_amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                      ${balanceDue.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.status !== 'paid' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setPaymentForm({
                              amount_paid: balanceDue,
                              payment_method: 'Wire Transfer',
                              payment_reference: `REF-${Math.floor(100000 + Math.random() * 900000)}`
                            });
                            setShowPaymentModal(true);
                          }}
                          icon={DollarSign}
                        >
                          Collect Payment
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* MODAL: CREATE SALES ORDER */}
      <Modal
        isOpen={showSoModal}
        onClose={() => setShowSoModal(false)}
        title="Create Sales Order / Quotation"
        description="Records customer order lines, applies discount rates, and validates tax"
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleCreateSo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Customer"
              value={soForm.customer_id}
              onChange={(e) => setSoForm({ ...soForm, customer_id: e.target.value })}
              required
            >
              <option value="">Select Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </Select>

            <Input
              label="Delivery Commitment Date"
              type="date"
              value={soForm.delivery_date}
              onChange={(e) => setSoForm({ ...soForm, delivery_date: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Order Line Items ({soForm.items.length})
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={handleAddLineItem} icon={Plus}>
                Add Line Item
              </Button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-2.5">Product SKU</th>
                    <th className="p-2.5 w-24 text-right">Quantity</th>
                    <th className="p-2.5 w-28 text-right">Unit Price</th>
                    <th className="p-2.5 w-20 text-right">Disc %</th>
                    <th className="p-2.5 w-28 text-right">Line Total</th>
                    <th className="p-2.5 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {soForm.items.map((line, idx) => {
                    const gross = Number(line.quantity || 0) * Number(line.unit_price || 0);
                    const net = gross * (1 - (Number(line.discount_percent || 0) / 100));
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
                            max="100"
                            step="0.5"
                            value={line.discount_percent}
                            onChange={(e) => handleLineItemChange(idx, 'discount_percent', e.target.value)}
                            className="w-full text-xs p-1.5 text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-semibold">
                          ${net.toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLineItem(idx)}
                            className="text-slate-400 hover:text-rose-500"
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

            <div className="flex justify-end mt-3">
              <div className="w-64 space-y-1.5 text-xs text-right">
                <div className="flex justify-between text-slate-500">
                  <span>Gross Subtotal:</span>
                  <span className="font-mono">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Discount:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">-${discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tax (8%):</span>
                  <span className="font-mono">${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-900 dark:text-slate-100 font-bold border-t border-slate-200 dark:border-slate-800 pt-1.5 text-sm">
                  <span>Total Amount:</span>
                  <span className="font-mono text-brand-600 dark:text-brand-400">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <Input
            label="Order Notes"
            value={soForm.notes}
            onChange={(e) => setSoForm({ ...soForm, notes: e.target.value })}
            placeholder="Special packing notes, client PO number..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowSoModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Confirm & Book Order
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: VIEW SO DETAILS */}
      {orderDetail && (
        <Modal
          isOpen={!!orderDetail}
          onClose={() => setOrderDetail(null)}
          title={`Sales Order: ${orderDetail.order.so_number}`}
          description={`Customer: ${orderDetail.order.customer_name}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Badge variant={orderDetail.order.status} size="md">
                  {orderDetail.order.status}
                </Badge>
                <div className="text-xs text-slate-500">
                  Booked on {new Date(orderDetail.order.order_date).toLocaleDateString()}
                </div>
              </div>

              <div>
                {!['completed', 'cancelled'].includes(orderDetail.order.status) && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openDeliveryModal(orderDetail)}
                    icon={Truck}
                  >
                    Dispatch Shipment
                  </Button>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Order Fulfillment Progress
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product / SKU</TableHead>
                    <TableHead className="text-right">Ordered Qty</TableHead>
                    <TableHead className="text-right">Delivered Qty</TableHead>
                    <TableHead className="text-right">Outstanding Qty</TableHead>
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
                        {item.delivered_quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {item.remaining_delivery_quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono">${Number(item.unit_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono font-bold">${Number(item.line_total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Shipment Dispatches */}
            {orderDetail.deliveries && orderDetail.deliveries.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Completed Deliveries
                </h4>
                <div className="space-y-2">
                  {orderDetail.deliveries.map((del) => (
                    <div key={del.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{del.delivery_number}</span>
                        <span className="text-slate-400 mx-2">•</span>
                        <span>Dispatched from {del.warehouse_name}</span>
                        {del.tracking_number && (
                          <span className="text-slate-400 ml-2 font-mono">(Tracking: {del.tracking_number})</span>
                        )}
                      </div>
                      <Badge variant="completed">Shipped</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* MODAL: DISPATCH DELIVERY (DEDUCTS STOCK) */}
      <Modal
        isOpen={showDeliveryModal}
        onClose={() => setShowDeliveryModal(false)}
        title="Dispatch Warehouse Delivery"
        description="Fulfills sales order, deducts stock from warehouse, and posts issue movement ledger"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleDispatchDelivery} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Source Warehouse Facility"
              value={deliveryForm.warehouse_id}
              onChange={(e) => setDeliveryForm({ ...deliveryForm, warehouse_id: e.target.value })}
              required
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </Select>

            <Input
              label="Carrier Tracking Reference"
              value={deliveryForm.tracking_number}
              onChange={(e) => setDeliveryForm({ ...deliveryForm, tracking_number: e.target.value })}
            />
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Items to Dispatch:
            </div>
            <div className="space-y-3">
              {deliveryForm.items.map((it, idx) => (
                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">{it.product_name}</div>
                    <div className="text-[10px] font-mono text-slate-400">
                      SKU: {it.sku} • Outstanding: {it.remaining_quantity}
                    </div>
                  </div>

                  <div className="w-32">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Ship Qty</label>
                    <input
                      type="number"
                      max={it.remaining_quantity}
                      min="0.001"
                      step="0.001"
                      value={it.quantity}
                      onChange={(e) => {
                        const updated = [...deliveryForm.items];
                        updated[idx].quantity = e.target.value;
                        setDeliveryForm({ ...deliveryForm, items: updated });
                      }}
                      className="w-full text-xs p-1.5 font-mono text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      required
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Input
            label="Shipment Notes"
            value={deliveryForm.notes}
            onChange={(e) => setDeliveryForm({ ...deliveryForm, notes: e.target.value })}
            placeholder="Bill of lading, driver details..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowDeliveryModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Confirm Dispatch & Deduct Stock
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: COLLECT INVOICE PAYMENT */}
      {selectedInvoice && (
        <Modal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          title={`Record Payment: ${selectedInvoice.invoice_number}`}
          description={`Customer: ${selectedInvoice.customer_name} • Total: $${Number(selectedInvoice.total_amount).toFixed(2)}`}
        >
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <Input
              label="Payment Amount ($)"
              type="number"
              step="0.01"
              value={paymentForm.amount_paid}
              onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })}
              required
            />

            <Select
              label="Payment Method"
              value={paymentForm.payment_method}
              onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
            >
              <option value="Wire Transfer">Wire Transfer</option>
              <option value="ACH Direct Debit">ACH Direct Debit</option>
              <option value="Corporate Credit Card">Corporate Credit Card</option>
              <option value="Check">Check</option>
            </Select>

            <Input
              label="Payment Reference / Transaction ID"
              value={paymentForm.payment_reference}
              onChange={(e) => setPaymentForm({ ...paymentForm, payment_reference: e.target.value })}
              placeholder="e.g. WIRE-88192-TX"
            />

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Post Payment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: ADD CUSTOMER */}
      <Modal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        title="Add Customer Account"
        description="Create commercial customer account for invoicing and sales orders"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4">
          <Input
            label="Customer Company Name"
            value={customerForm.name}
            onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
            required
            placeholder="e.g. CloudScale Systems Corp"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contact Person"
              value={customerForm.contact_name}
              onChange={(e) => setCustomerForm({ ...customerForm, contact_name: e.target.value })}
              placeholder="e.g. Jane Doe"
            />
            <Input
              label="Customer Code"
              value={customerForm.code}
              onChange={(e) => setCustomerForm({ ...customerForm, code: e.target.value })}
              placeholder="e.g. CUST-004"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={customerForm.email}
              onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
              placeholder="procurement@client.com"
            />
            <Input
              label="Phone"
              value={customerForm.phone}
              onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <Input
            label="Billing & Shipping Address"
            value={customerForm.billing_address}
            onChange={(e) => setCustomerForm({ ...customerForm, billing_address: e.target.value, shipping_address: e.target.value })}
            placeholder="Address"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Payment Terms"
              value={customerForm.payment_terms}
              onChange={(e) => setCustomerForm({ ...customerForm, payment_terms: e.target.value })}
            />
            <Input
              label="Credit Limit ($)"
              type="number"
              value={customerForm.credit_limit}
              onChange={(e) => setCustomerForm({ ...customerForm, credit_limit: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowCustomerModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Customer Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default SalesView;
