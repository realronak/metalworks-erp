import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Plus,
  ArrowRightLeft,
  SlidersHorizontal,
  Search,
  Filter,
  Download,
  AlertTriangle,
  History,
  MapPin,
  Package,
  Layers,
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

export function InventoryView() {
  const notify = useNotification();

  const [activeTab, setActiveTab] = useState('products'); // 'products', 'movements', 'warehouses', 'low-stock'
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Reference data
  const [categories, setCategories] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [locations, setLocations] = useState([]);

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Forms
  const [productForm, setProductForm] = useState({
    sku: '',
    name: '',
    description: '',
    category_id: '',
    type: 'raw_material',
    uom_code: 'PCS',
    reorder_point: 10,
    reorder_quantity: 50,
    unit_cost: 0,
    selling_price: 0,
    batch_tracked: false
  });

  const [adjustForm, setAdjustForm] = useState({
    product_id: '',
    warehouse_id: '',
    location_id: '',
    batch_number: '',
    adjustment_type: 'add',
    quantity: 1,
    reason: 'Routine cycle count verification'
  });

  const [transferForm, setTransferForm] = useState({
    product_id: '',
    source_warehouse_id: '',
    source_location_id: '',
    target_warehouse_id: '',
    target_location_id: '',
    batch_number: '',
    quantity: 1,
    notes: 'Floor stock replenishment'
  });

  // Movement Ledger State
  const [movements, setMovements] = useState([]);
  const [movementPagination, setMovementPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [movementTypeFilter, setMovementTypeFilter] = useState('');

  // Low stock list
  const [lowStockItems, setLowStockItems] = useState([]);

  const loadReferenceData = async () => {
    try {
      const [catRes, uomRes, whRes, locRes] = await Promise.all([
        api.get('/inventory/categories'),
        api.get('/inventory/uom'),
        api.get('/inventory/warehouses'),
        api.get('/inventory/locations')
      ]);
      setCategories(catRes);
      setUoms(uomRes);
      setWarehouses(whRes);
      setLocations(locRes);
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  };

  const loadProducts = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/products', {
        search,
        category_id: categoryFilter,
        type: typeFilter,
        page,
        limit: pagination.limit
      });
      setProducts(res.data);
      setPagination(res.pagination);
    } catch (err) {
      notify.error(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async (page = 1) => {
    try {
      const res = await api.get('/inventory/movements', {
        movement_type: movementTypeFilter,
        page,
        limit: movementPagination.limit
      });
      setMovements(res.data);
      setMovementPagination(res.pagination);
    } catch (err) {
      notify.error(err.message || 'Failed to load movement ledger');
    }
  };

  const loadLowStock = async () => {
    try {
      const res = await api.get('/inventory/low-stock');
      setLowStockItems(res);
    } catch (err) {
      notify.error(err.message || 'Failed to load low stock items');
    }
  };

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    if (activeTab === 'products') loadProducts(1);
    if (activeTab === 'movements') loadMovements(1);
    if (activeTab === 'low-stock') loadLowStock();
  }, [activeTab, search, categoryFilter, typeFilter, movementTypeFilter]);

  // Handlers
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      if (selectedProduct) {
        await api.put(`/inventory/products/${selectedProduct.id}`, productForm);
        notify.success('Product updated successfully');
      } else {
        await api.post('/inventory/products', productForm);
        notify.success('Product created successfully');
      }
      setShowProductModal(false);
      setSelectedProduct(null);
      loadProducts(pagination.page);
    } catch (err) {
      notify.error(err.message || 'Failed to save product');
    }
  };

  const handlePostAdjustment = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/inventory/adjust', adjustForm);
      notify.success(`Adjustment posted: ${res.movementCode}`);
      setShowAdjustModal(false);
      loadProducts(pagination.page);
    } catch (err) {
      notify.error(err.message || 'Failed to post adjustment');
    }
  };

  const handlePostTransfer = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/inventory/transfer', transferForm);
      notify.success(`Stock transferred (${res.outCode} -> ${res.inCode})`);
      setShowTransferModal(false);
      loadProducts(pagination.page);
    } catch (err) {
      notify.error(err.message || 'Failed to transfer stock');
    }
  };

  const openAdjustForProduct = (prod) => {
    setAdjustForm({
      product_id: prod.id,
      warehouse_id: warehouses[0]?.id || '',
      location_id: '',
      batch_number: '',
      adjustment_type: 'add',
      quantity: 1,
      reason: 'Physical inventory count adjustment'
    });
    setShowAdjustModal(true);
  };

  const openTransferForProduct = (prod) => {
    setTransferForm({
      product_id: prod.id,
      source_warehouse_id: warehouses[0]?.id || '',
      source_location_id: '',
      target_warehouse_id: warehouses[1]?.id || warehouses[0]?.id || '',
      target_location_id: '',
      batch_number: '',
      quantity: 1,
      notes: 'Internal transfer'
    });
    setShowTransferModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Context Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Inventory & Warehouse Ledger
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Audit-grade stock movement tracking, multi-warehouse allocations, and product specifications
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAdjustModal(true)}
            icon={SlidersHorizontal}
          >
            Adjust Stock
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowTransferModal(true)}
            icon={ArrowRightLeft}
          >
            Transfer Stock
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setSelectedProduct(null);
              setProductForm({
                sku: '',
                name: '',
                description: '',
                category_id: categories[0]?.id || '',
                type: 'raw_material',
                uom_code: uoms[0]?.code || 'PCS',
                reorder_point: 10,
                reorder_quantity: 50,
                unit_cost: 0,
                selling_price: 0,
                batch_tracked: false
              });
              setShowProductModal(true);
            }}
            icon={Plus}
          >
            Add Product SKU
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold gap-6">
        <button
          onClick={() => setActiveTab('products')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'products'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Boxes className="w-4 h-4" />
          Products Catalog ({pagination.total})
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'movements'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          Auditable Movement Ledger
        </button>

        <button
          onClick={() => setActiveTab('low-stock')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'low-stock'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Low Stock Alerts
        </button>

        <button
          onClick={() => setActiveTab('warehouses')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'warehouses'
              ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Warehouses & Bins
        </button>
      </div>

      {/* TAB 1: PRODUCTS CATALOG */}
      {activeTab === 'products' && (
        <Card>
          {/* Filters Bar */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by SKU, name, description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
              >
                <option value="">All Product Types</option>
                <option value="raw_material">Raw Material</option>
                <option value="work_in_progress">Work In Progress (WIP)</option>
                <option value="finished_good">Finished Good</option>
                <option value="consumable">Consumable</option>
              </select>
            </div>
          </div>

          {loading ? (
            <LoadingSpinner text="Querying product catalog from PostgreSQL..." />
          ) : products.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No products found"
              description="No inventory items match your current filter criteria."
              action={
                <Button size="sm" onClick={() => setShowProductModal(true)}>
                  Create New Product
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU / Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const isLow = Number(p.on_hand_quantity) <= Number(p.reorder_point) && Number(p.reorder_point) > 0;
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            {p.name}
                            {isLow && (
                              <span title="Low stock threshold breached">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline" />
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-xs text-brand-600 dark:text-brand-400 mt-0.5">
                            {p.sku}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            {p.category_name || 'Uncategorized'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.type === 'finished_good' ? 'completed' : p.type === 'work_in_progress' ? 'info' : 'default'}>
                            {p.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {p.on_hand_quantity} <span className="text-[10px] text-slate-400">{p.uom_code}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {p.reserved_quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {p.available_quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${Number(p.unit_cost).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openAdjustForProduct(p)}
                              className="px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Adjust Stock"
                            >
                              Adjust
                            </button>
                            <button
                              onClick={() => openTransferForProduct(p)}
                              className="px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Transfer Stock"
                            >
                              Transfer
                            </button>
                            <button
                              onClick={() => {
                                setSelectedProduct(p);
                                setProductForm({
                                  sku: p.sku,
                                  name: p.name,
                                  description: p.description || '',
                                  category_id: p.category_id || '',
                                  type: p.type,
                                  uom_code: p.uom_code,
                                  reorder_point: p.reorder_point,
                                  reorder_quantity: p.reorder_quantity,
                                  unit_cost: p.unit_cost,
                                  selling_price: p.selling_price,
                                  batch_tracked: p.batch_tracked
                                });
                                setShowProductModal(true);
                              }}
                              className="px-2 py-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              Edit
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.pages}
                totalItems={pagination.total}
                pageSize={pagination.limit}
                onPageChange={(page) => loadProducts(page)}
              />
            </>
          )}
        </Card>
      )}

      {/* TAB 2: AUDITABLE MOVEMENT LEDGER */}
      {activeTab === 'movements' && (
        <Card>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Filter Movement Type:
              </span>
              <select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
              >
                <option value="">All Movement Types</option>
                <option value="receipt">Goods Receipts</option>
                <option value="issue">Sales Issues</option>
                <option value="transfer_in">Transfer In</option>
                <option value="transfer_out">Transfer Out</option>
                <option value="production_issue">Production Issue</option>
                <option value="production_receipt">Production Output</option>
                <option value="adjustment_add">Adjustment (+)</option>
                <option value="adjustment_subtract">Adjustment (-)</option>
                <option value="scrap">Scrap</option>
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={() => api.downloadCsv('/inventory/movements', { movement_type: movementTypeFilter }, 'movement_ledger.csv')}
            >
              Export CSV Ledger
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Movement Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Product / SKU</TableHead>
                <TableHead>Warehouse / Bin</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead>Reference / Note</TableHead>
                <TableHead>Timestamp / User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => {
                const isPos = Number(m.quantity) > 0;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">
                      {m.movement_code}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.movement_type.includes('receipt') || m.movement_type.includes('add') ? 'completed' : m.movement_type.includes('scrap') ? 'danger' : 'info'}>
                        {m.movement_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{m.product_name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{m.sku}</div>
                    </TableCell>
                    <TableCell>
                      <div>{m.warehouse_name}</div>
                      {m.location_code && <div className="text-[10px] text-slate-400 font-mono">Bin: {m.location_code}</div>}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {isPos ? `+${m.quantity}` : m.quantity} {m.uom_code}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      ${Number(m.total_cost).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-xs truncate" title={m.notes}>
                      {m.notes || m.reference_id || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      <div>{new Date(m.created_at).toLocaleDateString()}</div>
                      <div className="text-[10px] text-slate-400">{m.user_name || 'System'}</div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Pagination
            currentPage={movementPagination.page}
            totalPages={movementPagination.pages}
            totalItems={movementPagination.total}
            pageSize={movementPagination.limit}
            onPageChange={(page) => loadMovements(page)}
          />
        </Card>
      )}

      {/* TAB 3: LOW STOCK REORDER ALERTS */}
      {activeTab === 'low-stock' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Reorder Replenishment Alerts</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Items where current on-hand stock has dropped below established safety threshold
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {lowStockItems.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                All inventory items are currently above their safety reorder thresholds!
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU / Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead className="text-right">Reorder Point</TableHead>
                    <TableHead className="text-right">Deficit</TableHead>
                    <TableHead className="text-right">Suggested Reorder Qty</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          {item.name}
                        </div>
                        <div className="font-mono text-xs text-brand-600 dark:text-brand-400 mt-0.5">
                          {item.sku}
                        </div>
                      </TableCell>
                      <TableCell>{item.category_name}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {item.current_stock} {item.uom_code}
                      </TableCell>
                      <TableCell className="text-right font-mono">{item.reorder_point}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                        {item.deficit}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-brand-600 dark:text-brand-400">
                        {item.reorder_quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openAdjustForProduct(item)}
                        >
                          Replenish Stock
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 4: WAREHOUSES & LOCATIONS */}
      {activeTab === 'warehouses' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {warehouses.map((w) => (
            <Card key={w.id}>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div>
                    <span className="font-mono text-[10px] text-brand-600 dark:text-brand-400 uppercase tracking-wider font-semibold">
                      {w.code}
                    </span>
                    <CardTitle className="mt-0.5">{w.name}</CardTitle>
                  </div>
                  <Badge variant="completed">Active Facility</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  {w.location}
                </div>

                <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase">Storage Bins</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-base mt-0.5">
                      {w.location_count || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px] uppercase">Total Units Stored</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-base mt-0.5">
                      {Number(w.total_units_stored || 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] font-semibold text-slate-500 mb-2 uppercase">Designated Storage Bins:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {locations.filter(l => l.warehouse_id === w.id).map(loc => (
                      <span key={loc.id} className="font-mono text-[11px] px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {loc.code}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL 1: CREATE / EDIT PRODUCT */}
      <Modal
        isOpen={showProductModal}
        onClose={() => { setShowProductModal(false); setSelectedProduct(null); }}
        title={selectedProduct ? `Edit Product: ${selectedProduct.sku}` : 'Add New Product SKU'}
        description="Configure product specifications, reorder policies, and unit economics"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="SKU Code"
              value={productForm.sku}
              onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
              required
              disabled={!!selectedProduct}
              placeholder="e.g. CRS-2MM-SHT"
            />

            <Select
              label="Category"
              value={productForm.category_id}
              onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>

          <Input
            label="Product Name"
            value={productForm.name}
            onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
            required
            placeholder="e.g. Cold Rolled Steel Sheet 2.0mm"
          />

          <Input
            label="Description"
            value={productForm.description}
            onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
            placeholder="Technical details, alloy grades, tolerances..."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Product Type"
              value={productForm.type}
              onChange={(e) => setProductForm({ ...productForm, type: e.target.value })}
            >
              <option value="raw_material">Raw Material</option>
              <option value="work_in_progress">Work In Progress (WIP)</option>
              <option value="finished_good">Finished Good</option>
              <option value="consumable">Consumable</option>
            </Select>

            <Select
              label="Unit of Measure (UOM)"
              value={productForm.uom_code}
              onChange={(e) => setProductForm({ ...productForm, uom_code: e.target.value })}
            >
              {uoms.map((u) => (
                <option key={u.code} value={u.code}>{u.name} ({u.code})</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Unit Cost ($)"
              type="number"
              step="0.01"
              value={productForm.unit_cost}
              onChange={(e) => setProductForm({ ...productForm, unit_cost: e.target.value })}
              required
            />

            <Input
              label="Selling Price ($)"
              type="number"
              step="0.01"
              value={productForm.selling_price}
              onChange={(e) => setProductForm({ ...productForm, selling_price: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Safety Reorder Threshold"
              type="number"
              value={productForm.reorder_point}
              onChange={(e) => setProductForm({ ...productForm, reorder_point: e.target.value })}
              helperText="Alert generated when stock drops below this"
            />

            <Input
              label="Standard Reorder Quantity"
              type="number"
              value={productForm.reorder_quantity}
              onChange={(e) => setProductForm({ ...productForm, reorder_quantity: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowProductModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {selectedProduct ? 'Update Product' : 'Create Product SKU'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: STOCK ADJUSTMENT */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="Post Manual Stock Adjustment"
        description="Records an audit-grade inventory adjustment with reason logging"
      >
        <form onSubmit={handlePostAdjustment} className="space-y-4">
          <Select
            label="Product"
            value={adjustForm.product_id}
            onChange={(e) => setAdjustForm({ ...adjustForm, product_id: e.target.value })}
            required
          >
            <option value="">Select Product SKU</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
            ))}
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Warehouse"
              value={adjustForm.warehouse_id}
              onChange={(e) => setAdjustForm({ ...adjustForm, warehouse_id: e.target.value })}
              required
            >
              <option value="">Select Warehouse</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </Select>

            <Select
              label="Storage Location (Bin)"
              value={adjustForm.location_id}
              onChange={(e) => setAdjustForm({ ...adjustForm, location_id: e.target.value })}
            >
              <option value="">Default Warehouse Floor</option>
              {locations.filter(l => String(l.warehouse_id) === String(adjustForm.warehouse_id)).map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Adjustment Action"
              value={adjustForm.adjustment_type}
              onChange={(e) => setAdjustForm({ ...adjustForm, adjustment_type: e.target.value })}
            >
              <option value="add">Add Inventory (+)</option>
              <option value="subtract">Subtract Inventory (-)</option>
            </Select>

            <Input
              label="Quantity"
              type="number"
              step="0.001"
              min="0.001"
              value={adjustForm.quantity}
              onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
              required
            />
          </div>

          <Input
            label="Batch / Lot Number (Optional)"
            value={adjustForm.batch_number}
            onChange={(e) => setAdjustForm({ ...adjustForm, batch_number: e.target.value })}
            placeholder="e.g. LOT-2026-001"
          />

          <Input
            label="Adjustment Reason"
            value={adjustForm.reason}
            onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
            required
            placeholder="e.g. Annual physical count variance, supplier count correction..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowAdjustModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Post Adjustment to Ledger
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: WAREHOUSE STOCK TRANSFER */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Transfer Stock Between Facilities"
        description="Performs an atomic transfer and posts transfer_out / transfer_in ledger entries"
      >
        <form onSubmit={handlePostTransfer} className="space-y-4">
          <Select
            label="Product to Transfer"
            value={transferForm.product_id}
            onChange={(e) => setTransferForm({ ...transferForm, product_id: e.target.value })}
            required
          >
            <option value="">Select Product SKU</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
            ))}
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">SOURCE FACILITY</div>
              <Select
                label="Source Warehouse"
                value={transferForm.source_warehouse_id}
                onChange={(e) => setTransferForm({ ...transferForm, source_warehouse_id: e.target.value })}
                required
              >
                <option value="">Select Source</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Select>
            </div>

            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">DESTINATION FACILITY</div>
              <Select
                label="Target Warehouse"
                value={transferForm.target_warehouse_id}
                onChange={(e) => setTransferForm({ ...transferForm, target_warehouse_id: e.target.value })}
                required
              >
                <option value="">Select Destination</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Quantity to Transfer"
              type="number"
              step="0.001"
              min="0.001"
              value={transferForm.quantity}
              onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
              required
            />

            <Input
              label="Batch Number"
              value={transferForm.batch_number}
              onChange={(e) => setTransferForm({ ...transferForm, batch_number: e.target.value })}
              placeholder="e.g. LOT-2026-001"
            />
          </div>

          <Input
            label="Transfer Notes"
            value={transferForm.notes}
            onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
            placeholder="e.g. Material buffer transfer to Plant 1..."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowTransferModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Execute Atomic Transfer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default InventoryView;
