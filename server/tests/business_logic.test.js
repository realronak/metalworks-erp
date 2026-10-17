import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/db/connection.js';

describe('MetalWorks ERP Business Logic & Transactional Tests', () => {
  let adminToken = '';

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;
  });

  it('1. Stock adjustment adds stock and logs to movement ledger', async () => {
    // Fetch product CRS-2MM-SHT
    const prodRes = await request(app)
      .get('/api/inventory/products?search=CRS-2MM-SHT')
      .set('Authorization', `Bearer ${adminToken}`);
    const product = prodRes.body.data[0];
    const initialQty = Number(product.on_hand_quantity);

    // Fetch warehouse MAIN
    const whRes = await request(app)
      .get('/api/inventory/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    const mainWh = whRes.body.find(w => w.code === 'MAIN');

    // Post Adjustment (+5 units)
    const adjRes = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        product_id: product.id,
        warehouse_id: mainWh.id,
        adjustment_type: 'add',
        quantity: 5,
        reason: 'Cycle count physical inventory audit'
      });
    expect(adjRes.status).toBe(200);
    expect(adjRes.body.movementCode).toMatch(/^ADJ-/);

    // Verify product stock increased
    const afterRes = await request(app)
      .get(`/api/inventory/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(Number(afterRes.body.product.total_on_hand)).toBe(initialQty + 5);
  });

  it('2. Stock adjustment prevents subtracting more than available stock', async () => {
    const prodRes = await request(app)
      .get('/api/inventory/products?search=CRS-2MM-SHT')
      .set('Authorization', `Bearer ${adminToken}`);
    const product = prodRes.body.data[0];

    const whRes = await request(app)
      .get('/api/inventory/warehouses')
      .set('Authorization', `Bearer ${adminToken}`);
    const mainWh = whRes.body.find(w => w.code === 'MAIN');

    // Attempt to subtract 999,999 units
    const failRes = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        product_id: product.id,
        warehouse_id: mainWh.id,
        adjustment_type: 'subtract',
        quantity: 999999,
        reason: 'Invalid subtraction test'
      });
    expect(failRes.status).toBe(400);
    expect(failRes.body.error).toContain('Insufficient available stock');
  });

  it('3. Quality Inspection failing critical parameter cannot pass and generates NCR', async () => {
    // Fetch a product
    const prodRes = await request(app)
      .get('/api/inventory/products')
      .set('Authorization', `Bearer ${adminToken}`);
    const prod = prodRes.body.data[0];

    // Create an inspection request
    const createInsp = await request(app)
      .post('/api/quality/inspections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        product_id: prod.id,
        inspection_type: 'in_process',
        inspected_quantity: 10,
        notes: 'Pre-assembly inspection test'
      });
    expect(createInsp.status).toBe(201);
    const inspId = createInsp.body.id;

    // Record results with a failing critical test
    const recordRes = await request(app)
      .put(`/api/quality/inspections/${inspId}/record`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        accepted_quantity: 0,
        rejected_quantity: 10,
        results: [
          { parameter: 'Critical Hole Diameter Tolerance', unit: 'mm', critical: true, pass: false, measured: 5.2 }
        ],
        notes: 'Hole diameter out of spec on 100% of samples.'
      });

    expect(recordRes.status).toBe(200);
    expect(recordRes.body.inspection.status).toBe('failed');
    expect(recordRes.body.ncr).toBeDefined();
    expect(recordRes.body.ncr.severity).toBe('critical');
  });
});
