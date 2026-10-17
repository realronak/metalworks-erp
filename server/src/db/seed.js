import bcrypt from 'bcryptjs';
import pool, { withTransaction } from './connection.js';

export async function runSeeds() {
  console.log('🌱 Starting database seeding...');
  
  await withTransaction(async (client) => {
    // 1. Company Settings
    await client.query(`
      INSERT INTO company_settings (id, company_name, tax_id, email, phone, address, currency)
      VALUES (1, 'MetalWorks Precision Fabrication & ERP', 'US-8849201', 'ops@metalworksprecision.com', '+1 (555) 742-9900', '100 Foundry Way, Suite 400, Industrial Park, OH 44101', 'USD')
      ON CONFLICT (id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        tax_id = EXCLUDED.tax_id,
        email = EXCLUDED.email;
    `);

    // 2. Document Numbering Sequences
    const docSequences = [
      ['PO', 'PO', 1004, 4, '{prefix}-{year}-{number}'],
      ['SO', 'SO', 2005, 4, '{prefix}-{year}-{number}'],
      ['WO', 'WO', 3006, 4, '{prefix}-{year}-{number}'],
      ['GRN', 'GRN', 4003, 4, '{prefix}-{year}-{number}'],
      ['DEL', 'DEL', 5002, 4, '{prefix}-{year}-{number}'],
      ['INV', 'INV', 6003, 4, '{prefix}-{year}-{number}'],
      ['ADJ', 'ADJ', 7002, 4, '{prefix}-{year}-{number}'],
      ['NCR', 'NCR', 8002, 4, '{prefix}-{year}-{number}'],
      ['INSP', 'INSP', 9004, 4, '{prefix}-{year}-{number}'],
      ['MOV', 'MOV', 10015, 5, '{prefix}-{number}']
    ];
    for (const [docType, prefix, nextVal, padding, format] of docSequences) {
      await client.query(`
        INSERT INTO document_sequences (doc_type, prefix, next_val, padding, format)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (doc_type) DO UPDATE SET
          prefix = EXCLUDED.prefix,
          padding = EXCLUDED.padding;
      `, [docType, prefix, nextVal, padding, format]);
    }

    // 3. Users for each role
    const saltRounds = 10;
    const adminPass = await bcrypt.hash('admin123', saltRounds);
    const buyerPass = await bcrypt.hash('purchasing123', saltRounds);
    const whPass = await bcrypt.hash('warehouse123', saltRounds);
    const prodPass = await bcrypt.hash('production123', saltRounds);
    const qcPass = await bcrypt.hash('qc123', saltRounds);
    const salesPass = await bcrypt.hash('sales123', saltRounds);

    const users = [
      ['admin', 'admin@metalworks.io', adminPass, 'Alexander Wright', 'admin'],
      ['buyer', 'purchasing@metalworks.io', buyerPass, 'Sarah Jenkins', 'purchasing'],
      ['clerk', 'warehouse@metalworks.io', whPass, 'Marcus Rodriguez', 'warehouse'],
      ['operator', 'production@metalworks.io', prodPass, 'Elena Rostova', 'production'],
      ['inspector', 'qc@metalworks.io', qcPass, 'David Chen', 'qc'],
      ['salesrep', 'sales@metalworks.io', salesPass, 'Jessica Miller', 'sales']
    ];

    for (const [uname, email, hash, fullName, role] of users) {
      await client.query(`
        INSERT INTO users (username, email, password_hash, full_name, role)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (username) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role;
      `, [uname, email, hash, fullName, role]);
    }

    // 4. Units of Measure
    const uoms = [
      ['KG', 'Kilograms'],
      ['M', 'Meters'],
      ['PCS', 'Pieces'],
      ['SHEET', 'Standard Sheets'],
      ['BOX', 'Carton Boxes'],
      ['LTR', 'Liters']
    ];
    for (const [code, name] of uoms) {
      await client.query(`
        INSERT INTO units_of_measure (code, name)
        VALUES ($1, $2)
        ON CONFLICT (code) DO NOTHING;
      `, [code, name]);
    }

    // 5. Categories
    const categories = [
      ['Raw Sheet & Plate', 'Cold rolled steel, hot rolled, aluminum and stainless flat sheets'],
      ['Bar & Tube Stock', 'Structural angles, square tubing, round solid bars'],
      ['Hardware & Fasteners', 'Rivets, PEM nuts, hex bolts, machine screws, washers'],
      ['Sub-Assemblies', 'Fabricated weldments, punched sub-panels, bent brackets'],
      ['Finished Enclosures', 'Completed sheet metal chassis, server racks, electrical enclosures'],
      ['Consumables & Gas', 'Welding wire, cutting gas, powder coating pigments, abrasives']
    ];
    for (const [name, desc] of categories) {
      await client.query(`
        INSERT INTO categories (name, description)
        VALUES ($1, $2)
        ON CONFLICT (name) DO NOTHING;
      `, [name, desc]);
    }

    // 6. Warehouses & Locations
    const { rows: whRows } = await client.query(`
      INSERT INTO warehouses (code, name, location)
      VALUES 
        ('MAIN', 'Central Logistics & Raw Warehouse', 'Building A, Industrial Park'),
        ('FAB-1', 'Main Production & Assembly Plant', 'Building B, Industrial Park'),
        ('QUARANTINE', 'Quality Quarantine & Hold Area', 'Building A - North Bay QA')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, code;
    `);

    const whMap = {};
    const allWh = await client.query('SELECT id, code FROM warehouses');
    allWh.rows.forEach(r => { whMap[r.code] = r.id; });

    // Locations
    const locations = [
      [whMap['MAIN'], 'RAW-A1', 'Raw Sheet Rack A1'],
      [whMap['MAIN'], 'RAW-A2', 'Raw Sheet Rack A2'],
      [whMap['MAIN'], 'HDW-B1', 'Fasteners Storage Bin B1'],
      [whMap['MAIN'], 'RCV-DOCK', 'Main Receiving Dock'],
      [whMap['MAIN'], 'STAGING', 'Outbound Shipping Staging'],
      [whMap['FAB-1'], 'CUT-WIP', 'Laser Cutting WIP Staging'],
      [whMap['FAB-1'], 'BEND-WIP', 'Brake Press WIP Buffer'],
      [whMap['FAB-1'], 'ASY-BAY1', 'Final Assembly Bay 1'],
      [whMap['QUARANTINE'], 'QC-HOLD', 'Quarantine Inspection Bay']
    ];
    for (const [whId, code, name] of locations) {
      await client.query(`
        INSERT INTO warehouse_locations (warehouse_id, code, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (warehouse_id, code) DO NOTHING;
      `, [whId, code, name]);
    }

    const locMap = {};
    const allLoc = await client.query('SELECT id, code FROM warehouse_locations');
    allLoc.rows.forEach(r => { locMap[r.code] = r.id; });

    // 7. Products
    const catMap = {};
    const allCat = await client.query('SELECT id, name FROM categories');
    allCat.rows.forEach(r => { catMap[r.name] = r.id; });

    const products = [
      {
        sku: 'CRS-2MM-SHT',
        name: 'Cold Rolled Steel Sheet 2.0mm (4x8ft)',
        description: 'Standard 2000x1000x2.0mm mild steel sheet for laser cutting and CNC bending',
        category_id: catMap['Raw Sheet & Plate'],
        type: 'raw_material',
        uom_code: 'SHEET',
        reorder_point: 20,
        reorder_quantity: 50,
        unit_cost: 42.50,
        selling_price: 0,
        batch_tracked: true,
        specifications: { thickness_mm: 2.0, material_grade: 'CR4 / DC01', standard: 'ASTM A1008' }
      },
      {
        sku: 'AL-6061-3MM',
        name: 'Aluminum Plate 6061-T6 3.0mm',
        description: 'Aerospace/electronic grade structural aluminum plate for lightweight enclosures',
        category_id: catMap['Raw Sheet & Plate'],
        type: 'raw_material',
        uom_code: 'SHEET',
        reorder_point: 15,
        reorder_quantity: 30,
        unit_cost: 68.00,
        selling_price: 0,
        batch_tracked: true,
        specifications: { thickness_mm: 3.0, alloy: '6061-T6', finish: 'Mill Finish' }
      },
      {
        sku: 'SS304-TUBE-25',
        name: 'Stainless Steel Square Tube 25x25x2mm',
        description: 'Grade 304 stainless square tube for rigid framework and structural racks',
        category_id: catMap['Bar & Tube Stock'],
        type: 'raw_material',
        uom_code: 'M',
        reorder_point: 40,
        reorder_quantity: 100,
        unit_cost: 11.20,
        selling_price: 0,
        batch_tracked: true,
        specifications: { outer_dim_mm: 25, wall_thickness_mm: 2.0, grade: 'AISI 304' }
      },
      {
        sku: 'FAST-PEM-M6',
        name: 'Self-Clinching Blind Nut PEM M6',
        description: 'M6 steel threaded insert for sheet metal panels',
        category_id: catMap['Hardware & Fasteners'],
        type: 'raw_material',
        uom_code: 'PCS',
        reorder_point: 500,
        reorder_quantity: 2000,
        unit_cost: 0.18,
        selling_price: 0,
        batch_tracked: false,
        specifications: { thread: 'M6x1.0', material: 'Zinc-plated Carbon Steel' }
      },
      {
        sku: 'FAST-HEX-M6-20',
        name: 'Hex Cap Bolt M6x20mm Grade 8.8',
        description: 'High tensile zinc-plated hex bolt for heavy assembly',
        category_id: catMap['Hardware & Fasteners'],
        type: 'raw_material',
        uom_code: 'PCS',
        reorder_point: 300,
        reorder_quantity: 1000,
        unit_cost: 0.22,
        selling_price: 0,
        batch_tracked: false,
        specifications: { thread: 'M6x1.0', length_mm: 20, grade: '8.8' }
      },
      {
        sku: 'WIP-CHASSIS-42U',
        name: 'Cut & Formed 42U Server Chassis Sub-Frame',
        description: 'Punched and CNC-bent internal rail frame ready for final welding and powder coat',
        category_id: catMap['Sub-Assemblies'],
        type: 'work_in_progress',
        uom_code: 'PCS',
        reorder_point: 5,
        reorder_quantity: 15,
        unit_cost: 145.00,
        selling_price: 0,
        batch_tracked: true,
        specifications: { height_ru: 42, depth_mm: 1000, stages: ['Laser Cut', 'Brake Press'] }
      },
      {
        sku: 'WIP-BRACKET-MNT',
        name: 'Precision Mounting Bracket Set (Pair)',
        description: 'Formed structural brackets for enclosure mounting',
        category_id: catMap['Sub-Assemblies'],
        type: 'work_in_progress',
        uom_code: 'PCS',
        reorder_point: 20,
        reorder_quantity: 50,
        unit_cost: 18.50,
        selling_price: 0,
        batch_tracked: true,
        specifications: { tolerance_mm: 0.1, hole_diam_mm: 6.5 }
      },
      {
        sku: 'FG-RACK-42U',
        name: 'Industrial Data Center Server Rack 42U - Heavy Duty',
        description: 'Complete 42U high-ventilation server cabinet with lockable mesh doors and cable management',
        category_id: catMap['Finished Enclosures'],
        type: 'finished_good',
        uom_code: 'PCS',
        reorder_point: 5,
        reorder_quantity: 10,
        unit_cost: 380.00,
        selling_price: 749.00,
        batch_tracked: true,
        specifications: { height_mm: 2000, width_mm: 600, depth_mm: 1070, max_load_kg: 1200 }
      },
      {
        sku: 'FG-ENC-IP65',
        name: 'NEMA 4X / IP65 Weatherproof Industrial Electrical Enclosure',
        description: 'Sealed CNC laser-cut welded enclosure with polyurethane gasketing and quarter-turn locks',
        category_id: catMap['Finished Enclosures'],
        type: 'finished_good',
        uom_code: 'PCS',
        reorder_point: 8,
        reorder_quantity: 20,
        unit_cost: 110.00,
        selling_price: 245.00,
        batch_tracked: true,
        specifications: { dimensions_mm: '600x400x250', ip_rating: 'IP65', material: 'AISI 304 Stainless' }
      }
    ];

    for (const p of products) {
      await client.query(`
        INSERT INTO products (
          sku, name, description, category_id, type, uom_code, 
          reorder_point, reorder_quantity, unit_cost, selling_price, 
          batch_tracked, specifications
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (sku) DO UPDATE SET
          name = EXCLUDED.name,
          unit_cost = EXCLUDED.unit_cost,
          selling_price = EXCLUDED.selling_price;
      `, [
        p.sku, p.name, p.description, p.category_id, p.type, p.uom_code,
        p.reorder_point, p.reorder_quantity, p.unit_cost, p.selling_price,
        p.batch_tracked, JSON.stringify(p.specifications)
      ]);
    }

    const prodMap = {};
    const allProd = await client.query('SELECT id, sku FROM products');
    allProd.rows.forEach(r => { prodMap[r.sku] = r.id; });

    // 8. Stock Movements & Initial Stock Levels
    const initialStocks = [
      { sku: 'CRS-2MM-SHT', wh: 'MAIN', loc: 'RAW-A1', batch: 'LOT-2026-CRS-01', qty: 65, cost: 42.50 },
      { sku: 'AL-6061-3MM', wh: 'MAIN', loc: 'RAW-A2', batch: 'LOT-2026-AL-01', qty: 28, cost: 68.00 },
      { sku: 'SS304-TUBE-25', wh: 'MAIN', loc: 'RAW-A1', batch: 'LOT-2026-SS-01', qty: 180, cost: 11.20 },
      { sku: 'FAST-PEM-M6', wh: 'MAIN', loc: 'HDW-B1', batch: '', qty: 4500, cost: 0.18 },
      { sku: 'FAST-HEX-M6-20', wh: 'MAIN', loc: 'HDW-B1', batch: '', qty: 2200, cost: 0.22 },
      { sku: 'WIP-CHASSIS-42U', wh: 'FAB-1', loc: 'CUT-WIP', batch: 'BATCH-WO-3001', qty: 8, cost: 145.00 },
      { sku: 'WIP-BRACKET-MNT', wh: 'FAB-1', loc: 'BEND-WIP', batch: 'BATCH-WO-3002', qty: 42, cost: 18.50 },
      { sku: 'FG-RACK-42U', wh: 'MAIN', loc: 'STAGING', batch: 'FG-2026-001', qty: 12, cost: 380.00 },
      { sku: 'FG-ENC-IP65', wh: 'MAIN', loc: 'STAGING', batch: 'FG-2026-002', qty: 18, cost: 110.00 }
    ];

    let movIndex = 1;
    for (const item of initialStocks) {
      const pId = prodMap[item.sku];
      const wId = whMap[item.wh];
      const lId = locMap[item.loc];
      const movCode = `MOV-INIT-${String(movIndex++).padStart(4, '0')}`;

      // Insert stock level
      await client.query(`
        INSERT INTO stock_levels (product_id, warehouse_id, location_id, batch_number, quantity, reserved_quantity)
        VALUES ($1, $2, $3, $4, $5, 0)
        ON CONFLICT (product_id, warehouse_id, location_id, batch_number) DO UPDATE SET
          quantity = EXCLUDED.quantity;
      `, [pId, wId, lId, item.batch, item.qty]);

      // Insert ledger entry
      await client.query(`
        INSERT INTO stock_movements (
          movement_code, movement_type, product_id, warehouse_id, location_id,
          batch_number, quantity, unit_cost, total_cost, reference_type, reference_id, notes
        )
        VALUES ($1, 'receipt', $2, $3, $4, $5, $6, $7, $8, 'initial_balance', 'SYSTEM_SETUP', 'Initial inventory balance setup')
        ON CONFLICT (movement_code) DO NOTHING;
      `, [
        movCode, pId, wId, lId, item.batch, item.qty, item.cost,
        (item.qty * item.cost).toFixed(4)
      ]);
    }

    // 9. Suppliers
    const suppliers = [
      ['SUP-001', 'Apex Steel Mills Inc.', 'Robert Kowalski', 'orders@apexsteel.com', '+1 (555) 301-8811', 'Cleveland, OH', 'US-TAX-39104', 'Net 30'],
      ['SUP-002', 'Alumitech Extrusions Ltd.', 'Carla Vasquez', 'sales@alumitech.net', '+1 (555) 442-9922', 'Pittsburgh, PA', 'US-TAX-55201', 'Net 45'],
      ['SUP-003', 'Precision Hardware & Fasteners', 'Brian Thompson', 'brian@precisionhardware.com', '+1 (555) 881-2300', 'Detroit, MI', 'US-TAX-77299', 'Net 15']
    ];

    for (const [code, name, contact, email, phone, addr, tax, terms] of suppliers) {
      await client.query(`
        INSERT INTO suppliers (code, name, contact_name, email, phone, address, tax_id, payment_terms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
      `, [code, name, contact, email, phone, addr, tax, terms]);
    }

    const supMap = {};
    const allSup = await client.query('SELECT id, code FROM suppliers');
    allSup.rows.forEach(r => { supMap[r.code] = r.id; });

    // 10. Customers
    const customers = [
      ['CUST-001', 'CloudScale Data Centers', 'Frank Reynolds', 'procurement@cloudscale.net', '+1 (555) 600-4411', '100 Tech Way, Reston, VA', '100 Tech Way, Reston, VA', 'US-TAX-1011', 'Net 30', 100000],
      ['CUST-002', 'NovaTech Automation Corp', 'Linda Zhao', 'purchasing@novatech-auto.com', '+1 (555) 777-1299', '88 Robotics Blvd, Austin, TX', '88 Robotics Blvd, Austin, TX', 'US-TAX-2022', 'Net 30', 50000],
      ['CUST-003', 'Apex Defense & Marine Systems', 'Commander John Vance', 'j.vance@apexdefense.mil', '+1 (555) 909-3300', 'Naval Pier 4, Norfolk, VA', 'Naval Pier 4, Norfolk, VA', 'US-TAX-3033', 'Net 60', 250000]
    ];

    for (const [code, name, contact, email, phone, bill, ship, tax, terms, credit] of customers) {
      await client.query(`
        INSERT INTO customers (code, name, contact_name, email, phone, billing_address, shipping_address, tax_id, payment_terms, credit_limit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
      `, [code, name, contact, email, phone, bill, ship, tax, terms, credit]);
    }

    const custMap = {};
    const allCust = await client.query('SELECT id, code FROM customers');
    allCust.rows.forEach(r => { custMap[r.code] = r.id; });

    // 11. Bill of Materials (BOM)
    // BOM 1: 42U Server Rack Enclosure
    const { rows: bom1 } = await client.query(`
      INSERT INTO bill_of_materials (bom_number, product_id, version, name, description, output_quantity)
      VALUES ('BOM-RACK-42U-V1', $1, '1.0', 'Standard 42U Server Enclosure Master BOM', 'Complete fabrication and assembly BOM for 42U server rack', 1)
      ON CONFLICT (bom_number) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [prodMap['FG-RACK-42U']]);

    const bom1Id = bom1[0].id;
    await client.query('DELETE FROM bom_items WHERE bom_id = $1', [bom1Id]);
    await client.query(`
      INSERT INTO bom_items (bom_id, product_id, quantity, scrap_factor, position, notes)
      VALUES
        ($1, $2, 4, 2.0, 1, 'Laser cut mild steel sheet 2mm for side and top panels'),
        ($1, $3, 12, 1.5, 2, 'Square stainless steel tube 25x25mm structural corner posts'),
        ($1, $4, 48, 5.0, 3, 'Self-clinching PEM nuts M6 for mounting rails'),
        ($1, $5, 36, 3.0, 4, 'Grade 8.8 Hex bolts M6x20mm assembly hardware'),
        ($1, $6, 1, 0.0, 5, 'Pre-formed 42U sub-frame assembly');
    `, [
      bom1Id,
      prodMap['CRS-2MM-SHT'],
      prodMap['SS304-TUBE-25'],
      prodMap['FAST-PEM-M6'],
      prodMap['FAST-HEX-M6-20'],
      prodMap['WIP-CHASSIS-42U']
    ]);

    // BOM 2: NEMA IP65 Enclosure
    const { rows: bom2 } = await client.query(`
      INSERT INTO bill_of_materials (bom_number, product_id, version, name, description, output_quantity)
      VALUES ('BOM-ENC-IP65-V1', $1, '1.0', 'NEMA 4X Weatherproof Enclosure BOM', 'Precision sheet metal fabrication BOM', 1)
      ON CONFLICT (bom_number) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [prodMap['FG-ENC-IP65']]);

    const bom2Id = bom2[0].id;
    await client.query('DELETE FROM bom_items WHERE bom_id = $1', [bom2Id]);
    await client.query(`
      INSERT INTO bom_items (bom_id, product_id, quantity, scrap_factor, position, notes)
      VALUES
        ($1, $2, 2, 2.0, 1, 'Aluminum 6061 3mm plate for enclosure body and door'),
        ($1, $3, 8, 3.0, 2, 'M6 PEM clinch nuts for backplate mounting'),
        ($1, $4, 2, 0.0, 3, 'Formed mounting bracket pair');
    `, [
      bom2Id,
      prodMap['AL-6061-3MM'],
      prodMap['FAST-PEM-M6'],
      prodMap['WIP-BRACKET-MNT']
    ]);

    // 12. Sample Work Orders
    const { rows: wo1 } = await client.query(`
      INSERT INTO work_orders (
        wo_number, bom_id, product_id, warehouse_id, source_warehouse_id,
        status, priority, planned_quantity, completed_quantity, scrapped_quantity,
        planned_start_date, planned_end_date, actual_start_date, batch_number, notes
      )
      VALUES (
        'WO-2026-0001', $1, $2, $3, $3,
        'in_progress', 'high', 10, 4, 1,
        CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE + INTERVAL '2 days', NOW() - INTERVAL '2 days',
        'BATCH-WO-2026-01', 'High-priority server rack order for CloudScale Data Centers'
      )
      ON CONFLICT (wo_number) DO UPDATE SET status = EXCLUDED.status
      RETURNING id;
    `, [bom1Id, prodMap['FG-RACK-42U'], whMap['MAIN']]);

    const wo1Id = wo1[0].id;
    await client.query('DELETE FROM work_order_materials WHERE work_order_id = $1', [wo1Id]);
    await client.query(`
      INSERT INTO work_order_materials (work_order_id, product_id, planned_quantity, allocated_quantity, issued_quantity, unit_cost)
      VALUES
        ($1, $2, 40, 40, 20, 42.50),
        ($1, $3, 120, 120, 60, 11.20),
        ($1, $4, 480, 480, 240, 0.18),
        ($1, $5, 360, 360, 180, 0.22);
    `, [
      wo1Id,
      prodMap['CRS-2MM-SHT'],
      prodMap['SS304-TUBE-25'],
      prodMap['FAST-PEM-M6'],
      prodMap['FAST-HEX-M6-20']
    ]);

    // 13. Sample Purchase Order & Receipt
    const { rows: po1 } = await client.query(`
      INSERT INTO purchase_orders (
        po_number, supplier_id, status, order_date, expected_delivery_date,
        subtotal, tax_amount, total_amount, notes
      )
      VALUES (
        'PO-2026-0001', $1, 'partially_received', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '5 days',
        3400.00, 272.00, 3672.00, 'Replenishment order for high grade cold rolled steel sheets'
      )
      ON CONFLICT (po_number) DO UPDATE SET status = EXCLUDED.status
      RETURNING id;
    `, [supMap['SUP-001']]);

    const po1Id = po1[0].id;
    await client.query('DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [po1Id]);
    const { rows: poItem1 } = await client.query(`
      INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, received_quantity, unit_price, tax_rate, line_total)
      VALUES ($1, $2, 80, 30, 42.50, 8.0, 3400.00)
      RETURNING id;
    `, [po1Id, prodMap['CRS-2MM-SHT']]);

    // Goods Receipt linked to PO
    const { rows: grn1 } = await client.query(`
      INSERT INTO goods_receipts (receipt_number, purchase_order_id, supplier_id, warehouse_id, receipt_date, supplier_delivery_note, notes)
      VALUES ('GRN-2026-0001', $1, $2, $3, CURRENT_DATE - INTERVAL '1 day', 'DN-APEX-99201', 'Partial delivery: 30 sheets received in excellent condition')
      ON CONFLICT (receipt_number) DO UPDATE SET notes = EXCLUDED.notes
      RETURNING id;
    `, [po1Id, supMap['SUP-001'], whMap['MAIN']]);

    const grn1Id = grn1[0].id;
    await client.query('DELETE FROM goods_receipt_items WHERE receipt_id = $1', [grn1Id]);
    await client.query(`
      INSERT INTO goods_receipt_items (receipt_id, po_item_id, product_id, location_id, batch_number, quantity_received, quantity_accepted, quantity_rejected, unit_cost)
      VALUES ($1, $2, $3, $4, 'LOT-2026-CRS-02', 30, 30, 0, 42.50);
    `, [grn1Id, poItem1[0].id, prodMap['CRS-2MM-SHT'], locMap['RCV-DOCK']]);

    // 14. Sample Sales Order & Invoice
    const { rows: so1 } = await client.query(`
      INSERT INTO sales_orders (
        so_number, customer_id, status, order_date, delivery_date,
        subtotal, discount_amount, tax_amount, total_amount, notes
      )
      VALUES (
        'SO-2026-0001', $1, 'in_production', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '10 days',
        7490.00, 245.00, 579.60, 7824.60, 'Production order for CloudScale Data Centers new facility'
      )
      ON CONFLICT (so_number) DO UPDATE SET status = EXCLUDED.status
      RETURNING id;
    `, [custMap['CUST-001']]);

    const so1Id = so1[0].id;
    await client.query('DELETE FROM sales_order_items WHERE sales_order_id = $1', [so1Id]);
    await client.query(`
      INSERT INTO sales_order_items (sales_order_id, product_id, quantity, delivered_quantity, unit_price, discount_percent, tax_rate, line_total)
      VALUES ($1, $2, 10, 0, 749.00, 3.27, 8.0, 7490.00);
    `, [so1Id, prodMap['FG-RACK-42U']]);

    // Invoice
    await client.query(`
      INSERT INTO invoices (invoice_number, sales_order_id, customer_id, status, issue_date, due_date, total_amount, paid_amount, payment_method, notes)
      VALUES ('INV-2026-0001', $1, $2, 'partially_paid', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '29 days', 7824.60, 3000.00, 'Wire Transfer', 'Advance deposit received')
      ON CONFLICT (invoice_number) DO UPDATE SET status = EXCLUDED.status;
    `, [so1Id, custMap['CUST-001']]);

    // 15. Inspection Plans & Quality Inspections
    const { rows: plan1 } = await client.query(`
      INSERT INTO inspection_plans (code, title, type, product_id, checklist)
      VALUES (
        'PLAN-INSP-CRS', 'Incoming Inspection Plan: Cold Rolled Steel Sheet', 'incoming', $1,
        $2::jsonb
      )
      ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title
      RETURNING id;
    `, [
      prodMap['CRS-2MM-SHT'],
      JSON.stringify([
        { parameter: 'Thickness Check (Micrometer)', unit: 'mm', min_val: 1.95, max_val: 2.05, critical: true },
        { parameter: 'Surface Scratch / Rust Inspection', unit: 'visual', min_val: null, max_val: null, critical: true },
        { parameter: 'Width & Length Squareness', unit: 'mm', min_val: 998, max_val: 1002, critical: false }
      ])
    ]);

    const { rows: insp1 } = await client.query(`
      INSERT INTO quality_inspections (
        inspection_number, inspection_plan_id, inspection_type, product_id,
        batch_number, warehouse_id, goods_receipt_id, status,
        inspected_quantity, accepted_quantity, rejected_quantity, quarantined_quantity,
        results, notes, inspected_at
      )
      VALUES (
        'INSP-2026-0001', $1, 'incoming', $2,
        'LOT-2026-CRS-02', $3, $4, 'passed',
        30, 30, 0, 0,
        $5::jsonb, 'All 30 steel sheets within 2.0mm +/- 0.03mm thickness tolerance. Clean finish without oxidation.', NOW() - INTERVAL '18 hours'
      )
      ON CONFLICT (inspection_number) DO UPDATE SET status = EXCLUDED.status
      RETURNING id;
    `, [
      plan1[0].id, prodMap['CRS-2MM-SHT'], whMap['MAIN'], grn1Id,
      JSON.stringify([
        { parameter: 'Thickness Check (Micrometer)', measured: 1.99, pass: true },
        { parameter: 'Surface Scratch / Rust Inspection', measured: 'Pass - Clean', pass: true },
        { parameter: 'Width & Length Squareness', measured: 1000.5, pass: true }
      ])
    ]);

    // Nonconformance Report (NCR)
    await client.query(`
      INSERT INTO nonconformance_reports (
        ncr_number, inspection_id, product_id, severity, title,
        description, root_cause, corrective_action, status
      )
      VALUES (
        'NCR-2026-0001', $1, $2, 'minor', 'Minor edge burr on pre-stamped bracket batch',
        'Sampling of bracket batch showed deburring operation was skipped during shift transition.',
        'Secondary deburring tumbler machine maintenance log was incomplete.',
        'Parts routed to manual vibratory finishing station for 20-minute tumble cycle.',
        'resolved'
      )
      ON CONFLICT (ncr_number) DO UPDATE SET status = EXCLUDED.status;
    `, [insp1[0].id, prodMap['WIP-BRACKET-MNT']]);

    // 16. Machine Downtime
    await client.query(`
      INSERT INTO machine_downtime (work_order_id, machine_name, reason, duration_minutes, start_time, end_time, notes)
      VALUES 
        ($1, 'Trumpf TruLaser 3030 (4kW Fiber)', 'tool_change', 35, NOW() - INTERVAL '1 day 2 hours', NOW() - INTERVAL '1 day 1 hour 25 minutes', 'Nozzle centering and ceramic ring replacement'),
        ($1, 'Amada HFE-M2 1003 Press Brake', 'maintenance', 50, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours 10 minutes', 'Hydraulic fluid filter inspection and upper clamp recalibration')
    `, [wo1Id]);

    // 17. Initial Audit Log
    await client.query(`
      INSERT INTO audit_logs (username, action, entity_type, entity_id, details)
      VALUES ('admin', 'SYSTEM_INITIALIZE', 'DATABASE', 'ALL', '{"event": "System initialized with comprehensive MetalWorks ERP dataset"}'::jsonb);
    `);
  });

  console.log('✅ Database seeding complete with realistic manufacturing data!');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  runSeeds()
    .then(() => pool.end())
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}
