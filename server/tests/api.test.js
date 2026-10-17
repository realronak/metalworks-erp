import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/db/connection.js';

describe('MetalWorks ERP Backend Integration Tests', () => {
  let adminToken = '';
  let clerkToken = '';

  beforeAll(async () => {
    // Authenticate as Admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.token).toBeDefined();
    adminToken = adminRes.body.token;

    // Authenticate as Warehouse Clerk
    const clerkRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'clerk', password: 'warehouse123' });
    expect(clerkRes.status).toBe(200);
    clerkToken = clerkRes.body.token;
  });

  it('1. Health Check endpoint returns 200 OK', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.system).toContain('MetalWorks ERP');
  });

  it('2. Auth rejection on invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid credentials');
  });

  it('3. /api/auth/me returns current user details', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.role).toBe('admin');
  });

  it('4. RBAC: Warehouse clerk cannot access admin-only users list', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${clerkToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Forbidden');
  });

  it('5. RBAC: Admin can access admin users list', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('6. Dashboard returns accurate operational metrics', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.inventory).toBeDefined();
    expect(res.body.inventory.valuation).toBeGreaterThan(0);
    expect(res.body.purchasing.openPoCount).toBeGreaterThanOrEqual(1);
    expect(res.body.production.totalWorkOrders).toBeGreaterThanOrEqual(1);
  });

  it('7. Inventory products listing with pagination and stock calculation', async () => {
    const res = await request(app)
      .get('/api/inventory/products?page=1&limit=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.pagination.total).toBeGreaterThan(0);
    expect(res.body.data[0].on_hand_quantity).toBeDefined();
  });

  it('8. Auditable movement ledger records transaction history', async () => {
    const res = await request(app)
      .get('/api/inventory/movements')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].movement_code).toBeDefined();
  });

  it('9. Purchasing: Fetch purchase orders list and order items', async () => {
    const res = await request(app)
      .get('/api/purchasing/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('10. Production: Fetch BOMs and Work Orders', async () => {
    const bomsRes = await request(app)
      .get('/api/production/boms')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(bomsRes.status).toBe(200);
    expect(bomsRes.body.length).toBeGreaterThan(0);

    const woRes = await request(app)
      .get('/api/production/work-orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(woRes.status).toBe(200);
    expect(woRes.body.data.length).toBeGreaterThan(0);
  });

  it('11. Quality: Fetch inspections and Nonconformance Reports (NCR)', async () => {
    const inspRes = await request(app)
      .get('/api/quality/inspections')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(inspRes.status).toBe(200);
    expect(inspRes.body.data.length).toBeGreaterThan(0);

    const ncrRes = await request(app)
      .get('/api/quality/ncrs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ncrRes.status).toBe(200);
    expect(ncrRes.body.length).toBeGreaterThan(0);
  });
});
