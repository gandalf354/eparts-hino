import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE_URL = 'http://localhost:4000';

async function main() {
  console.log('Starting Single Device Login Test...');

  // 1. Login first time (Device A)
  console.log('\n[Step 1] Logging in as Device A...');
  const loginRes1 = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test_device_lock', password: 'password123' })
  });

  if (loginRes1.status !== 200) {
    console.error('Failed to login Device A:', await loginRes1.text());
    process.exit(1);
  }

  const cookie = loginRes1.headers.get('set-cookie');
  console.log('Login Device A success. Cookie:', cookie ? 'Received' : 'Missing');

  // 2. Check Database for last_activity_at
  console.log('\n[Step 2] Checking Database for last_activity_at...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [rows] = await conn.query('SELECT last_activity_at FROM users WHERE username = ?', ['test_device_lock']);
  await conn.end();

  if (rows.length === 0) {
    console.error('User not found in DB');
    process.exit(1);
  }

  const lastActivity = rows[0].last_activity_at;
  console.log('last_activity_at in DB:', lastActivity);

  if (!lastActivity) {
    console.error('last_activity_at is NULL!');
    process.exit(1);
  }

  // Check if time is recent (within 1 minute)
  const diff = Date.now() - new Date(lastActivity).getTime();
  console.log(`Time difference: ${diff}ms`);
  if (Math.abs(diff) > 60000) { // Allow 1 min drift
     console.error('last_activity_at is too old or in future');
     process.exit(1);
  }
  console.log('Database verification passed.');

  // 3. Login second time (Device B)
  console.log('\n[Step 3] Attempting login as Device B (should fail)...');
  const loginRes2 = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test_device_lock', password: 'password123' })
  });

  console.log('Device B Login Status:', loginRes2.status);
  const body2 = await loginRes2.json();
  console.log('Device B Response:', body2);

  if (loginRes2.status === 403 && body2.error === 'user_active_elsewhere') {
    console.log('\nSUCCESS: Single device login restriction is working!');
  } else {
    console.error('\nFAILURE: Device B was able to login or got wrong error.');
    process.exit(1);
  }
}

main().catch(console.error);
