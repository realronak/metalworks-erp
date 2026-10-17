-- 001_initial_schema.sql
-- MetalWorks ERP Core Schema

-- Enable UUID extension if needed in future
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users and Authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'purchasing', 'warehouse', 'production', 'sales', 'qc')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Company Profile and Settings
CREATE TABLE IF NOT EXISTS company_settings (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(150) NOT NULL,
  tax_id VARCHAR(50),
  email VARCHAR(100),
  phone VARCHAR(50),
  address TEXT,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Document Numbering Sequences
CREATE TABLE IF NOT EXISTS document_sequences (
  doc_type VARCHAR(30) PRIMARY KEY,
  prefix VARCHAR(10) NOT NULL,
  next_val INT NOT NULL DEFAULT 1,
  padding INT NOT NULL DEFAULT 4,
  format VARCHAR(50) NOT NULL DEFAULT '{prefix}-{year}-{number}'
);

-- 4. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(50),
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- 5. Categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Units of Measure
CREATE TABLE IF NOT EXISTS units_of_measure (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

-- 7. Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Warehouse Locations
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id SERIAL PRIMARY KEY,
  warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (warehouse_id, code)
);

-- 9. Products
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('raw_material', 'work_in_progress', 'finished_good', 'consumable')),
  uom_code VARCHAR(10) NOT NULL REFERENCES units_of_measure(code),
  reorder_point NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  reorder_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (reorder_quantity >= 0),
  unit_cost NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  selling_price NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  batch_tracked BOOLEAN NOT NULL DEFAULT false,
  specifications JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);

-- 10. Stock Levels (Aggregated location balance)
CREATE TABLE IF NOT EXISTS stock_levels (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  location_id INT REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
  batch_number VARCHAR(50) NOT NULL DEFAULT '',
  quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id, location_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_stock_prod_wh ON stock_levels(product_id, warehouse_id);

-- 11. Auditable Stock Movement Ledger
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  movement_code VARCHAR(50) UNIQUE NOT NULL,
  movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN (
    'receipt', 'issue', 'transfer_in', 'transfer_out', 
    'adjustment_add', 'adjustment_subtract', 
    'production_issue', 'production_receipt', 'scrap', 'reversal'
  )),
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  location_id INT REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
  batch_number VARCHAR(50) NOT NULL DEFAULT '',
  quantity NUMERIC(15, 4) NOT NULL,
  unit_cost NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(15, 4) NOT NULL DEFAULT 0,
  reference_type VARCHAR(50),
  reference_id VARCHAR(50),
  notes TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_mov_prod ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_wh ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_ref ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_date ON stock_movements(created_at DESC);

-- 12. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  contact_name VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(50),
  address TEXT,
  tax_id VARCHAR(50),
  payment_terms VARCHAR(50) DEFAULT 'Net 30',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'partially_received', 'completed', 'cancelled')),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  subtotal NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  approved_by INT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

-- 14. Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(15, 4) NOT NULL CHECK (quantity > 0),
  received_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_price NUMERIC(15, 4) NOT NULL CHECK (unit_price >= 0),
  tax_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(15, 4) NOT NULL
);

-- 15. Goods Receipts
CREATE TABLE IF NOT EXISTS goods_receipts (
  id SERIAL PRIMARY KEY,
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  purchase_order_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id INT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_delivery_note VARCHAR(100),
  notes TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Goods Receipt Items
CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id SERIAL PRIMARY KEY,
  receipt_id INT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_item_id INT REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id INT REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
  batch_number VARCHAR(50) DEFAULT '',
  quantity_received NUMERIC(15, 4) NOT NULL CHECK (quantity_received > 0),
  quantity_accepted NUMERIC(15, 4) NOT NULL DEFAULT 0,
  quantity_rejected NUMERIC(15, 4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(15, 4) NOT NULL DEFAULT 0
);

-- 17. Customers
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  contact_name VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(50),
  billing_address TEXT,
  shipping_address TEXT,
  tax_id VARCHAR(50),
  payment_terms VARCHAR(50) DEFAULT 'Net 30',
  credit_limit NUMERIC(15, 4) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. Sales Orders
CREATE TABLE IF NOT EXISTS sales_orders (
  id SERIAL PRIMARY KEY,
  so_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'quotation' CHECK (status IN ('quotation', 'confirmed', 'in_production', 'partially_delivered', 'delivered', 'completed', 'cancelled')),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  subtotal NUMERIC(15, 4) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_so_status ON sales_orders(status);

-- 19. Sales Order Items
CREATE TABLE IF NOT EXISTS sales_order_items (
  id SERIAL PRIMARY KEY,
  sales_order_id INT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(15, 4) NOT NULL CHECK (quantity > 0),
  delivered_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(15, 4) NOT NULL CHECK (unit_price >= 0),
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(15, 4) NOT NULL
);

-- 20. Deliveries
CREATE TABLE IF NOT EXISTS deliveries (
  id SERIAL PRIMARY KEY,
  delivery_number VARCHAR(50) UNIQUE NOT NULL,
  sales_order_id INT NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tracking_number VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'shipped' CHECK (status IN ('pending', 'shipped', 'delivered', 'returned')),
  notes TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. Delivery Items
CREATE TABLE IF NOT EXISTS delivery_items (
  id SERIAL PRIMARY KEY,
  delivery_id INT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  so_item_id INT REFERENCES sales_order_items(id) ON DELETE SET NULL,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id INT REFERENCES warehouse_locations(id) ON DELETE RESTRICT,
  batch_number VARCHAR(50) DEFAULT '',
  quantity NUMERIC(15, 4) NOT NULL CHECK (quantity > 0)
);

-- 22. Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  sales_order_id INT REFERENCES sales_orders(id) ON DELETE SET NULL,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('draft', 'unpaid', 'partially_paid', 'paid', 'cancelled')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  total_amount NUMERIC(15, 4) NOT NULL,
  paid_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(100),
  notes TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 23. Bills of Materials (BOM)
CREATE TABLE IF NOT EXISTS bill_of_materials (
  id SERIAL PRIMARY KEY,
  bom_number VARCHAR(50) UNIQUE NOT NULL,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  name VARCHAR(150) NOT NULL,
  description TEXT,
  output_quantity NUMERIC(15, 4) NOT NULL DEFAULT 1 CHECK (output_quantity > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. BOM Items
CREATE TABLE IF NOT EXISTS bom_items (
  id SERIAL PRIMARY KEY,
  bom_id INT NOT NULL REFERENCES bill_of_materials(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(15, 4) NOT NULL CHECK (quantity > 0),
  scrap_factor NUMERIC(5, 2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 1,
  notes TEXT
);

-- 25. Work Orders
CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY,
  wo_number VARCHAR(50) UNIQUE NOT NULL,
  bom_id INT NOT NULL REFERENCES bill_of_materials(id) ON DELETE RESTRICT,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  source_warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  sales_order_id INT REFERENCES sales_orders(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'released', 'in_progress', 'completed', 'cancelled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  planned_quantity NUMERIC(15, 4) NOT NULL CHECK (planned_quantity > 0),
  completed_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (completed_quantity >= 0),
  scrapped_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (scrapped_quantity >= 0),
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date TIMESTAMPTZ,
  actual_end_date TIMESTAMPTZ,
  batch_number VARCHAR(50) DEFAULT '',
  notes TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status);

-- 26. Work Order Material Consumption
CREATE TABLE IF NOT EXISTS work_order_materials (
  id SERIAL PRIMARY KEY,
  work_order_id INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  planned_quantity NUMERIC(15, 4) NOT NULL CHECK (planned_quantity > 0),
  allocated_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (allocated_quantity >= 0),
  issued_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),
  unit_cost NUMERIC(15, 4) NOT NULL DEFAULT 0
);

-- 27. Machine Downtime
CREATE TABLE IF NOT EXISTS machine_downtime (
  id SERIAL PRIMARY KEY,
  work_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL,
  machine_name VARCHAR(100) NOT NULL,
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('breakdown', 'tool_change', 'maintenance', 'material_shortage', 'operator_unavailable', 'setup', 'other')),
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  notes TEXT,
  logged_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 28. Inspection Plans
CREATE TABLE IF NOT EXISTS inspection_plans (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(150) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('incoming', 'in_process', 'final')),
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  checklist JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 29. Quality Inspections
CREATE TABLE IF NOT EXISTS quality_inspections (
  id SERIAL PRIMARY KEY,
  inspection_number VARCHAR(50) UNIQUE NOT NULL,
  inspection_plan_id INT REFERENCES inspection_plans(id) ON DELETE SET NULL,
  inspection_type VARCHAR(30) NOT NULL CHECK (inspection_type IN ('incoming', 'in_process', 'final')),
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_number VARCHAR(50) DEFAULT '',
  warehouse_id INT REFERENCES warehouses(id) ON DELETE SET NULL,
  goods_receipt_id INT REFERENCES goods_receipts(id) ON DELETE SET NULL,
  work_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'conditional')),
  inspected_quantity NUMERIC(15, 4) NOT NULL CHECK (inspected_quantity > 0),
  accepted_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  rejected_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  quarantined_quantity NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (quarantined_quantity >= 0),
  results JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  inspector_id INT REFERENCES users(id) ON DELETE SET NULL,
  inspected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qc_status ON quality_inspections(status);

-- 30. Nonconformance Reports (NCR)
CREATE TABLE IF NOT EXISTS nonconformance_reports (
  id SERIAL PRIMARY KEY,
  ncr_number VARCHAR(50) UNIQUE NOT NULL,
  inspection_id INT REFERENCES quality_inspections(id) ON DELETE SET NULL,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('minor', 'medium', 'critical')),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  root_cause TEXT,
  corrective_action TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'action_pending', 'resolved', 'closed')),
  assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
  reported_by INT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ncr_status ON nonconformance_reports(status);
