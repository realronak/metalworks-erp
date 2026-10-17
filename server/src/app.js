import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler.js';

// Module Routes
import authRoutes from './modules/auth/auth.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import purchasingRoutes from './modules/purchasing/purchasing.routes.js';
import salesRoutes from './modules/sales/sales.routes.js';
import productionRoutes from './modules/production/production.routes.js';
import qualityRoutes from './modules/quality/quality.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';

const app = express();

// Security and middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', system: 'MetalWorks ERP API', timestamp: new Date().toISOString() });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchasing', purchasingRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);

// 404 Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;
