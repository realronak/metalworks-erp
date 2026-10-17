# MetalWorks ERP — Technical Architecture & Engineering Specification

## 1. System Overview
**MetalWorks ERP** is a modern manufacturing resource planning and inventory control platform engineered for small-to-medium metal fabrication and precision manufacturing businesses.

The architecture emphasizes:
- **Strict Data Integrity**: Append-only stock movement ledger, PostgreSQL database-level constraints, and atomic ACID transactions.
- **Pure JavaScript ES Modules**: Modern JavaScript frontend and backend with zero TypeScript dependencies.
- **Enterprise Design System**: High-density interface inspired by Linear and Vercel, with instant Light, Dark, and System theme switching without layout or color flashes.
- **Role-Based Access Control (RBAC)**: Backend-enforced permissions for Administrator, Purchasing, Warehouse, Production, Sales, and Quality Control personas.

---

## 2. Database Design & Transaction Isolation

### Core Schemas
1. **Inventory & Movement Ledger**
   - `products`: Product master table supporting raw materials, WIP sub-assemblies, finished goods, and consumables.
   - `stock_levels`: Current available and reserved quantity balances by warehouse, location/bin, and lot number.
   - `stock_movements`: Append-only auditable ledger. Direct balance edits are prohibited; all quantities are adjusted via signed movement transactions (`receipt`, `issue`, `transfer_in`, `transfer_out`, `production_issue`, `production_receipt`, `adjustment_add`, `adjustment_subtract`, `scrap`).

2. **Purchasing & Goods Receipts**
   - `purchase_orders` & `purchase_order_items`: Vendor commitments, expected delivery dates, subtotal, tax calculations, and status progression (`draft` -> `approved` -> `partially_received` -> `completed` -> `cancelled`).
   - `goods_receipts` & `goods_receipt_items`: Receipt transactions that atomically record stock intake, update item received balances, and advance purchase order statuses.

3. **Production & Bill of Materials**
   - `bill_of_materials` & `bom_items`: Recipes with component ratios and scrap percentage factors.
   - `work_orders`: Production schedule with priority tiers (`urgent`, `high`, `medium`, `low`) and status states (`planned`, `released`, `in_progress`, `completed`, `cancelled`).
   - `work_order_materials`: Planned vs issued materials with automated reservation upon work order creation and physical deduction upon floor release.
   - `machine_downtime`: Stoppage tracking for Overall Equipment Effectiveness (OEE) and loss analysis.

4. **Quality Control & Nonconformance**
   - `inspection_plans`: Standardized checklist criteria with numeric caliper/gauge tolerances and critical failure flags.
   - `quality_inspections`: Real-time inspection records. Strict integrity rules ensure inspections cannot pass if critical tolerance checks fail.
   - `nonconformance_reports` (NCR): Corrective and Preventative Action (CAPA) tracking with 5-Why root cause logging.

5. **Concurrency & Atomicity Protection**
   - High-concurrency operations (e.g. stock reservation, goods intake, document numbering generation) use `SELECT ... FOR UPDATE` row locks within `withTransaction` blocks.
   - Document sequences (e.g. `PO-2026-0001`, `WO-2026-0001`) use dedicated sequence table locking to eliminate race conditions and collisions.

---

## 3. Security & Authentication Architecture
- **Authentication**: Cryptographic password hashing using `bcryptjs` (salt rounds: 10), signed JSON Web Tokens (JWT) stored in HTTP-only cookies or Bearer headers.
- **Authorization**: Centralized `requireRoles(...)` middleware enforcing least-privilege access at every API route.
- **Audit Trails**: Non-repudiable audit logging in `audit_logs` capturing user identity, action code, entity target, IP address, and payload snapshots.
- **Safe Error Boundary**: PostgreSQL constraint codes (23505 unique, 23503 foreign key, 23514 check) translated to clean client error responses without leaking stack traces or credentials.
