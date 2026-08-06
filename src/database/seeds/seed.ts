/**
 * Development seed script for Doodh Khata.
 *
 * NEVER run automatically in production.
 *
 * Dev credentials:
 *   Admin:    mobile 919999999999 / password Admin@12345
 *   Supplier: mobile 919888888888 / password Supplier@12345
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { resolvePostgresSsl } from '../../common/utils/postgres-ssl.util';

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

    const paid = (milkAmount / 2).toFixed(2);
    const remaining = (milkAmount - Number(paid)).toFixed(2);
    await qr.query(
      `INSERT INTO payments
       (id, supplier_id, customer_id, bill_id, amount, payment_method, payment_date,
        client_reference_id, version, recorded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 'UPI', $6, $7, 1, $2)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), sid, customerIds[0], billId, paid, monthStart, uuidv4()],
    );

    await qr.query(
      `UPDATE monthly_bills
       SET paid_amount = $1, remaining_balance = $2, status = 'PARTIALLY_PAID'
       WHERE id = $3`,
      [paid, remaining, billId],
    );

    await qr.commitTransaction();

    console.log('Seed completed successfully');

    console.log('Admin: 919999999999 / Admin@12345');

    console.log('Supplier: 919888888888 / Supplier@12345');
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
