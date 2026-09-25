/**
 * Development seed script for Doodh Wala.
 *
 * NEVER run automatically in production.
 *
 * Dev credentials:
 *   Admin:    mobile 919999999999 / password Admin@12345
 *   Supplier: mobile 919888888888 / password Supplier@12345
 *
 * Marketplace (Phase 2-4) demo users — password Marketplace@12345 for all:
 *   919777000001  Active farm owner (Green Valley Dairy, ACTIVE, 2 areas, 2 products)
 *   919777000002  Farm owner with a PENDING_APPROVAL farm (Sunrise Dairy Farm)
 *   919777000003  Delivery staff member of Green Valley Dairy
 *   919777000004  Customer with 2 addresses + 1 pending service request
 *   919777000005  Not-yet-registered mobile with a pending customer invitation
 *   919777000006  Customer with an ACTIVE connection + subscription
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { resolvePostgresSsl } from '../../common/utils/postgres-ssl.util';

/** Inserts a user (idempotent on mobile_number) and returns its canonical id. */
async function upsertUser(
  qr: QueryRunner,
  params: {
    id: string;
    name: string;
    mobileNumber: string;
    passwordHash: string;
    role: string;
  },
): Promise<string> {
  await qr.query(
    `INSERT INTO users (id, name, mobile_number, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
     ON CONFLICT (mobile_number) DO NOTHING`,
    [
      params.id,
      params.name,
      params.mobileNumber,
      params.passwordHash,
      params.role,
    ],
  );
  const row = await qr.query(
    `SELECT id FROM users WHERE mobile_number = $1 LIMIT 1`,
    [params.mobileNumber],
  );
  return row[0].id as string;
}

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run seeds in production');
  }

  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: resolvePostgresSsl(process.env.DATABASE_URL, process.env.DATABASE_SSL),
  });
  await ds.initialize();
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
    const adminHash = await bcrypt.hash('Admin@12345', rounds);
    const supplierHash = await bcrypt.hash('Supplier@12345', rounds);

    const adminId = uuidv4();
    const supplierId = uuidv4();
    const customerIds = [uuidv4(), uuidv4(), uuidv4()];
    const subscriptionIds = [uuidv4(), uuidv4(), uuidv4()];

    await qr.query(
      `INSERT INTO users (id, name, mobile_number, password_hash, role, status)
       VALUES ($1, 'Platform Admin', '919999999999', $2, 'PLATFORM_OWNER', 'ACTIVE')
       ON CONFLICT (mobile_number) DO NOTHING`,
      [adminId, adminHash],
    );

    await qr.query(
      `INSERT INTO users (id, name, mobile_number, password_hash, role, status)
       VALUES ($1, 'Demo Supplier', '919888888888', $2, 'FARM_OWNER', 'ACTIVE')
       ON CONFLICT (mobile_number) DO NOTHING`,
      [supplierId, supplierHash],
    );

    const supplierRow = await qr.query(
      `SELECT id FROM users WHERE mobile_number = '919888888888' LIMIT 1`,
    );
    const sid = supplierRow[0].id as string;

    await qr.query(
      `INSERT INTO supplier_profiles (id, user_id, business_name, address)
       VALUES ($1, $2, 'Sharma Dairy', 'Pune, MH')
       ON CONFLICT (user_id) DO NOTHING`,
      [uuidv4(), sid],
    );

    const names = ['Ramesh Patil', 'Sita Deshmukh', 'Asha Kulkarni'];
    const mobiles = ['919700000001', '919700000002', '919700000003'];
    for (let i = 0; i < 3; i++) {
      await qr.query(
        `INSERT INTO customers (id, supplier_id, name, mobile_number, status, version)
         VALUES ($1, $2, $3, $4, 'ACTIVE', 1)
         ON CONFLICT DO NOTHING`,
        [customerIds[i], sid, names[i], mobiles[i]],
      );
      const row = await qr.query(
        `SELECT id FROM customers WHERE supplier_id = $1 AND mobile_number = $2 LIMIT 1`,
        [sid, mobiles[i]],
      );
      customerIds[i] = row[0].id as string;
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const monthStart = `${y}-${m}-01`;

    for (let i = 0; i < 3; i++) {
      await qr.query(
        `INSERT INTO milk_subscriptions
         (id, supplier_id, customer_id, milk_type, default_quantity, rate_per_litre,
          delivery_shift, start_date, status, version)
         VALUES ($1, $2, $3, $4, $5, $6, 'MORNING', $7, 'ACTIVE', 1)
         ON CONFLICT DO NOTHING`,
        [
          subscriptionIds[i],
          sid,
          customerIds[i],
          i === 0 ? 'COW' : i === 1 ? 'BUFFALO' : 'TONED',
          '1.500',
          i === 1 ? '70.00' : '60.00',
          monthStart,
        ],
      );
    }

    // Deliveries for first 5 days of current month as DELIVERED for customer 0
    let milkAmount = 0;
    for (let day = 1; day <= 5; day++) {
      const date = `${y}-${m}-${String(day).padStart(2, '0')}`;
      const amount = (1.5 * 60).toFixed(2);
      milkAmount += Number(amount);
      await qr.query(
        `INSERT INTO milk_deliveries
         (id, supplier_id, customer_id, subscription_id, delivery_date, delivery_shift,
          quantity, rate_per_litre, amount, status, client_reference_id, version, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, 'MORNING', '1.500', '60.00', $6, 'DELIVERED', $7, 1, $2)
         ON CONFLICT DO NOTHING`,
        [
          uuidv4(),
          sid,
          customerIds[0],
          subscriptionIds[0],
          date,
          amount,
          uuidv4(),
        ],
      );
    }

    const billId = uuidv4();
    const totalAmount = milkAmount.toFixed(2);
    await qr.query(
      `INSERT INTO monthly_bills
       (id, supplier_id, customer_id, billing_month, total_delivery_days, total_quantity,
        milk_amount, previous_balance, discount, adjustment, total_amount, paid_amount,
        remaining_balance, status, generated_at)
       VALUES ($1, $2, $3, $4, 5, '7.500', $5, '0.00', '0.00', '0.00', $5, '0.00', $5, 'ISSUED', now())
       ON CONFLICT DO NOTHING`,
      [billId, sid, customerIds[0], monthStart, totalAmount],
    );
    const billRow = await qr.query(
      `SELECT id FROM monthly_bills WHERE customer_id = $1 AND billing_month = $2 LIMIT 1`,
      [customerIds[0], monthStart],
    );
    const resolvedBillId = billRow[0].id as string;

    const paid = (milkAmount / 2).toFixed(2);
    const remaining = (milkAmount - Number(paid)).toFixed(2);
    await qr.query(
      `INSERT INTO payments
       (id, supplier_id, customer_id, bill_id, amount, payment_method, payment_date,
        client_reference_id, version, recorded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 'UPI', $6, $7, 1, $2)
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(),
        sid,
        customerIds[0],
        resolvedBillId,
        paid,
        monthStart,
        uuidv4(),
      ],
    );

    await qr.query(
      `UPDATE monthly_bills
       SET paid_amount = $1, remaining_balance = $2, status = 'PARTIALLY_PAID'
       WHERE id = $3`,
      [paid, remaining, resolvedBillId],
    );

    // ------------------------------------------------------------------
    // Marketplace (Phase 2-4) seed data
    // ------------------------------------------------------------------
    const marketplaceHash = await bcrypt.hash('Marketplace@12345', rounds);

    const activeFarmOwnerId = await upsertUser(qr, {
      id: uuidv4(),
      name: 'Green Valley Owner',
      mobileNumber: '919777000001',
      passwordHash: marketplaceHash,
      role: 'FARM_OWNER',
    });
    const pendingFarmOwnerId = await upsertUser(qr, {
      id: uuidv4(),
      name: 'New Farm Owner',
      mobileNumber: '919777000002',
      passwordHash: marketplaceHash,
      role: 'FARM_OWNER',
    });
    // TEMP: delivery-staff disabled — restore next update (keep demo user for data integrity)
    const deliveryStaffId = await upsertUser(qr, {
      id: uuidv4(),
      name: 'Delivery Staff Demo',
      mobileNumber: '919777000003',
      passwordHash: marketplaceHash,
      role: 'DELIVERY_STAFF', // UI disabled; seed kept for FK/demo data
    });
    const customerId = await upsertUser(qr, {
      id: uuidv4(),
      name: 'Marketplace Customer',
      mobileNumber: '919777000004',
      passwordHash: marketplaceHash,
      role: 'CUSTOMER',
    });
    const connectedCustomerId = await upsertUser(qr, {
      id: uuidv4(),
      name: 'Connected Customer',
      mobileNumber: '919777000006',
      passwordHash: marketplaceHash,
      role: 'CUSTOMER',
    });

    // --- Active, approved farm with 2 service areas + 2 products ---
    const activeFarmId = uuidv4();
    await qr.query(
      `INSERT INTO farms
       (id, name, business_name, description, mobile_number, address_line_1, area, city, state, postal_code,
        status, approved_at, created_by_user_id)
       VALUES ($1, 'Green Valley Dairy', 'Green Valley Dairy Pvt Ltd', 'Farm-fresh cow and buffalo milk delivered daily.',
               '919777000001', '12 Farm Road', 'Kothrud', 'Pune', 'Maharashtra', '411038',
               'ACTIVE', now(), $2)
       ON CONFLICT DO NOTHING`,
      [activeFarmId, activeFarmOwnerId],
    );
    const activeFarmRow = await qr.query(
      `SELECT id FROM farms WHERE created_by_user_id = $1 LIMIT 1`,
      [activeFarmOwnerId],
    );
    const activeFarm = activeFarmRow[0].id as string;

    await qr.query(
      `INSERT INTO farm_members (id, farm_id, user_id, member_role, status, joined_at)
       VALUES ($1, $2, $3, 'OWNER', 'ACTIVE', now())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), activeFarm, activeFarmOwnerId],
    );
    await qr.query(
      `INSERT INTO farm_members (id, farm_id, user_id, member_role, status, joined_at)
       VALUES ($1, $2, $3, 'DELIVERY_STAFF', 'ACTIVE', now())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), activeFarm, deliveryStaffId],
    );

    await qr.query(
      `INSERT INTO farm_service_areas (id, farm_id, area_name, city, state, postal_code, status)
       VALUES ($1, $2, 'Kothrud', 'Pune', 'Maharashtra', '411038', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [uuidv4(), activeFarm],
    );
    await qr.query(
      `INSERT INTO farm_service_areas (id, farm_id, area_name, city, state, postal_code, status)
       VALUES ($1, $2, 'Baner', 'Pune', 'Maharashtra', '411045', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [uuidv4(), activeFarm],
    );

    const cowProductId = uuidv4();
    await qr.query(
      `INSERT INTO farm_milk_products
       (id, farm_id, name, milk_type, description, current_rate_per_litre, minimum_quantity,
        maximum_quantity, available_shifts, is_available)
       VALUES ($1, $2, 'Fresh Cow Milk', 'COW', 'Pure cow milk from grass-fed cattle',
               '60.00', '0.500', '10.000', $3::jsonb, true)
       ON CONFLICT DO NOTHING`,
      [cowProductId, activeFarm, JSON.stringify(['MORNING', 'EVENING'])],
    );
    const buffaloProductId = uuidv4();
    await qr.query(
      `INSERT INTO farm_milk_products
       (id, farm_id, name, milk_type, description, current_rate_per_litre, minimum_quantity,
        maximum_quantity, available_shifts, is_available)
       VALUES ($1, $2, 'Rich Buffalo Milk', 'BUFFALO', 'High-fat buffalo milk',
               '75.00', '0.500', '8.000', $3::jsonb, true)
       ON CONFLICT DO NOTHING`,
      [buffaloProductId, activeFarm, JSON.stringify(['MORNING'])],
    );
    const cowProductRow = await qr.query(
      `SELECT id FROM farm_milk_products WHERE farm_id = $1 AND milk_type = 'COW' LIMIT 1`,
      [activeFarm],
    );
    const buffaloProductRow = await qr.query(
      `SELECT id FROM farm_milk_products WHERE farm_id = $1 AND milk_type = 'BUFFALO' LIMIT 1`,
      [activeFarm],
    );
    const cowProduct = cowProductRow[0].id as string;
    const buffaloProduct = buffaloProductRow[0].id as string;

    await qr.query(
      `INSERT INTO milk_rate_history (id, farm_product_id, rate_per_litre, effective_from, created_by_user_id)
       VALUES ($1, $2, '60.00', CURRENT_DATE, $3)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), cowProduct, activeFarmOwnerId],
    );
    await qr.query(
      `INSERT INTO milk_rate_history (id, farm_product_id, rate_per_litre, effective_from, created_by_user_id)
       VALUES ($1, $2, '75.00', CURRENT_DATE, $3)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), buffaloProduct, activeFarmOwnerId],
    );

    // --- Pending (not-yet-approved) farm ---
    const pendingFarmId = uuidv4();
    await qr.query(
      `INSERT INTO farms
       (id, name, mobile_number, address_line_1, area, city, state, postal_code,
        status, created_by_user_id)
       VALUES ($1, 'Sunrise Dairy Farm', '919777000002', '4 New Lane', 'Wakad', 'Pune', 'Maharashtra', '411057',
               'PENDING_APPROVAL', $2)
       ON CONFLICT DO NOTHING`,
      [pendingFarmId, pendingFarmOwnerId],
    );
    const pendingFarmRow = await qr.query(
      `SELECT id FROM farms WHERE created_by_user_id = $1 LIMIT 1`,
      [pendingFarmOwnerId],
    );
    const pendingFarm = pendingFarmRow[0].id as string;
    await qr.query(
      `INSERT INTO farm_members (id, farm_id, user_id, member_role, status, joined_at)
       VALUES ($1, $2, $3, 'OWNER', 'ACTIVE', now())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), pendingFarm, pendingFarmOwnerId],
    );

    // --- Customer with 2 addresses (one inside, one outside the farm's area) ---
    const homeAddressId = uuidv4();
    await qr.query(
      `INSERT INTO customer_addresses
       (id, customer_user_id, label, address_line_1, area, city, state, postal_code, is_default)
       VALUES ($1, $2, 'Home', '12 MG Road', 'Kothrud', 'Pune', 'Maharashtra', '411038', true)
       ON CONFLICT DO NOTHING`,
      [homeAddressId, customerId],
    );
    await qr.query(
      `INSERT INTO customer_addresses
       (id, customer_user_id, label, address_line_1, area, city, state, postal_code, is_default)
       VALUES ($1, $2, 'Office', '5 Business Park', 'Andheri', 'Mumbai', 'Maharashtra', '400058', false)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), customerId],
    );
    const homeAddressRow = await qr.query(
      `SELECT id FROM customer_addresses WHERE customer_user_id = $1 AND is_default = true LIMIT 1`,
      [customerId],
    );
    const homeAddress = homeAddressRow[0].id as string;

    // --- Pending service request from the customer to the active farm ---
    await qr.query(
      `INSERT INTO customer_service_requests
       (id, farm_id, customer_user_id, address_id, product_id, quantity, delivery_shift,
        preferred_start_date, delivery_instructions, status)
       VALUES ($1, $2, $3, $4, $5, '1.000', 'MORNING', CURRENT_DATE + INTERVAL '3 days',
               'Please leave with the security guard', 'PENDING')
       ON CONFLICT DO NOTHING`,
      [uuidv4(), activeFarm, customerId, homeAddress, cowProduct],
    );

    // --- Pending customer invitation (not-yet-registered mobile number) ---
    await qr.query(
      `INSERT INTO farm_customer_invitations
       (id, farm_id, mobile_number, customer_name, product_id, quantity, delivery_shift,
        proposed_rate, preferred_start_date, status, invited_by_user_id, expires_at)
       VALUES ($1, $2, '919777000005', 'Prospective Customer', $3, '1.000', 'MORNING',
               '75.00', CURRENT_DATE + INTERVAL '5 days', 'PENDING', $4, now() + INTERVAL '7 days')
       ON CONFLICT DO NOTHING`,
      [uuidv4(), activeFarm, buffaloProduct, activeFarmOwnerId],
    );

    // --- Active connection + subscription (already-onboarded customer) ---
    await qr.query(
      `INSERT INTO farm_customer_connections (id, farm_id, customer_user_id, status, connected_at)
       VALUES ($1, $2, $3, 'ACTIVE', now())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), activeFarm, connectedCustomerId],
    );
    const connectedLedgerCustomerId = uuidv4();
    await qr.query(
      `INSERT INTO customers (id, supplier_id, customer_user_id, name, mobile_number, status, version)
       VALUES ($1, $2, $3, 'Connected Customer', '919777000006', 'ACTIVE', 1)
       ON CONFLICT DO NOTHING`,
      [connectedLedgerCustomerId, activeFarmOwnerId, connectedCustomerId],
    );
    const connectedLedgerRow = await qr.query(
      `SELECT id FROM customers WHERE supplier_id = $1 AND customer_user_id = $2 LIMIT 1`,
      [activeFarmOwnerId, connectedCustomerId],
    );
    const connectedLedgerCustomer = connectedLedgerRow[0].id as string;
    await qr.query(
      `INSERT INTO milk_subscriptions
       (id, supplier_id, customer_id, milk_type, default_quantity, rate_per_litre,
        delivery_shift, start_date, status, version)
       VALUES ($1, $2, $3, 'COW', '1.000', '60.00', 'MORNING', $4, 'ACTIVE', 1)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), activeFarmOwnerId, connectedLedgerCustomer, monthStart],
    );

    await qr.commitTransaction();

    console.log('Seed completed successfully');
    console.log('');
    console.log('--- Legacy ledger credentials ---');
    console.log('Admin: 919999999999 / Admin@12345');
    console.log('Supplier: 919888888888 / Supplier@12345');
    console.log('');
    console.log('--- Marketplace (Phase 2-4) credentials ---');
    console.log('Password for all marketplace demo users: Marketplace@12345');
    console.log('Active farm owner (Green Valley Dairy, ACTIVE): 919777000001');
    console.log(
      'Pending farm owner (Sunrise Dairy Farm, PENDING_APPROVAL): 919777000002',
    );
    console.log('Delivery staff (member of Green Valley Dairy): 919777000003');
    console.log(
      'Customer with 2 addresses + 1 pending service request (Green Valley Dairy): 919777000004',
    );
    console.log(
      'Not-yet-registered mobile with a pending customer invitation: 919777000005',
    );
    console.log(
      'Customer with an ACTIVE connection + subscription to Green Valley Dairy: 919777000006',
    );
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
    await ds.destroy();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
