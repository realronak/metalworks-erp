# MetalWorks ERP — Precision Manufacturing & Inventory Platform

MetalWorks ERP is an enterprise manufacturing resource planning and inventory control application built with a modern JavaScript stack, PostgreSQL ACID transactions, and a design system inspired by Linear and Vercel.

---

## 🛠️ Technology Stack

- **Frontend**: Plain JavaScript ES Modules, React 18, Vite, Tailwind CSS, Lucide Icons, Recharts.
- **Backend**: Node.js, Express, Plain JavaScript ES Modules, Centralized Error Handling & Validation.
- **Database**: PostgreSQL with `pg` (node-postgres), atomic transactions, parameterized SQL, reproducible migrations, and seed datasets.
- **Testing**: Vitest with Supertest API integration suites.
- **Deployment**: Docker Compose and multi-stage container builds.
- **Strict Adherence**: 100% Plain JavaScript. No TypeScript, Python, or MongoDB dependencies.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18+ (tested on Node v20/v26)
- **PostgreSQL**: v14+ running locally or via Docker
- **npm**: v9+

### 2. Database Setup & Configuration
Create the database in PostgreSQL:
```bash
createdb metalworks_erp
```
Or with psql:
```sql
CREATE DATABASE metalworks_erp;
```

Copy the environment file:
```bash
cp .env.example .env
cp server/.env.example server/.env
```
Ensure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `server/.env` match your PostgreSQL credentials.

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Migrations & Seed Data
```bash
# Run schema migrations
npm run db:migrate

# Seed manufacturing dataset (products, BOMs, POs, SOs, work orders, demo users)
npm run db:seed
```

### 5. Start the Development Servers
```bash
npm run dev
```
- **Web Interface**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`

---

## 🧪 Running Automated Tests

Run the full Vitest backend integration and business logic test suite:
```bash
npm test
```
The test suite verifies:
- Health check endpoints
- Authentication and rejection on invalid credentials
- Role-based access control (RBAC) permission boundaries
- Dashboard live calculations
- Product queries & stock ledger entries
- Purchase order and goods receipt status progression
- Quality inspection pass/fail verification & automatic NCR generation
- Inventory subtraction prevention on insufficient stock

---

## 👥 Demo User Personas & Credentials

The seed data provides accounts for testing each operational role:

| Role | Username | Password | Operational Responsibilities |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `admin123` | Full system access, users, settings, sequences, audit logs |
| **Purchasing Lead** | `buyer` | `purchasing123` | Supplier records, Purchase Orders, Goods Receipts (GRN) |
| **Warehouse Manager**| `clerk` | `warehouse123` | Stock adjustments, facility transfers, location bins |
| **Production Supervisor**| `operator` | `production123`| Bill of Materials (BOM), Work Orders, Material Issues, Output |
| **Quality Inspector** | `inspector`| `qc123` | Inspection plans, caliper checks, tolerance tests, NCRs |
| **Sales Executive** | `salesrep` | `sales123` | Customer accounts, Quotations, Sales Orders, Invoices |

*Note: You can also use the **Quick Demo Persona** switcher in the top bar to test roles with a single click.*

---

## 📦 Key Functional Modules

1. **Dashboard**: High-density operational KPIs (inventory valuation, reorders, open POs/SOs, production progress, pending QC), commercial cash-flow area charts, category valuation bars, and real-time movement feed.
2. **Inventory & Warehouse**: Products catalog with live on-hand/reserved stock, stock adjustments with reason logging, atomic warehouse-to-warehouse transfers, low-stock reorder alerts, and an append-only movement ledger.
3. **Purchasing & Procurement**: Vendor management, multi-line purchase orders with tax computation, approval workflows, and transactional goods receipts (GRN) that atomically update warehouse balances.
4. **Sales & Customer Management**: Customer directory, quotes and sales orders, warehouse delivery fulfillment with automatic inventory deduction, and invoice payment tracking.
5. **Manufacturing & Production**: Multi-level Bills of Materials (BOM) with scrap allowances, work orders with priority levels, raw material reservations and shop-floor issues, finished goods completion receipts, and machine downtime logging.
6. **Quality Control & NCR**: Standardized inspection plans with numeric caliper tolerances, incoming/in-process/final inspections with strict failure enforcement, and Nonconformance Reports (NCR) with CAPA tracking.
7. **System Administration**: User accounts management, company legal settings, configurable document numbering sequences with concurrency protection, and detailed audit logs.
8. **Enterprise Reports**: Reconciled valuation summaries, supplier procurement spend, customer sales revenues, production scrap rates, and quality inspection pass/fail ratios with direct CSV export.

---

## 🐳 Optional Docker Deployment

```bash
docker compose up --build
```
This builds and launches the PostgreSQL database container, Node.js API server, and Nginx-served static React client.
