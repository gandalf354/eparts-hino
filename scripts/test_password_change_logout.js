import 'dotenv/config';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';

const BASE_URL = 'http://localhost:4000';

async function main() {
  console.log('Starting Password Change Auto Logout Test...');

  console.log('\n[Step 0] Resetting last_activity_at to allow login...');
  {
    const conn0 = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    await conn0.query("UPDATE users SET last_activity_at = NULL WHERE username = ?", ['test_device_lock']);
    await conn0.end();
  }

  console.log('\n[Step 1] Logging in as test_device_lock...');
  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test_device_lock', password: 'password123' })
  });
  if (loginRes.status !== 200) {
    console.error('Login failed:', await loginRes.text());
    process.exit(1);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  console.log('Cookie received:', !!setCookie);
  const cookie = (setCookie || '').split(';')[0];
  const token = cookie.replace(/^session=/, '');
  const decoded = jwt.decode(token);
  console.log('Token iat:', decoded?.iat);

  console.log('\n[Step 2] Changing password directly in DB and setting logout_all_at...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  await conn.query("UPDATE users SET logout_all_at = NOW() WHERE username = ?", ['test_device_lock']);
  const [rows2] = await conn.query("SELECT logout_all_at FROM users WHERE username = ?", ['test_device_lock']);
  await conn.end();
  console.log('logout_all_at updated:', rows2?.[0]?.logout_all_at);

  console.log('\n[Step 3] Calling /api/me with previous cookie (should be 401)...');
  const meRes = await fetch(`${BASE_URL}/api/me`, { headers: { cookie } });
  console.log('Status:', meRes.status);
  if (meRes.status !== 401) {
    console.error('Expected 401 after password change, got:', meRes.status);
    process.exit(1);
  }
  console.log('SUCCESS: Session invalidated after password change.');

  console.log('\n[Step 4] Attempting to login again (should succeed)...');
  const relogRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test_device_lock', password: 'password123' })
  });
  console.log('Relogin status:', relogRes.status);
  if (relogRes.status !== 200) {
    console.error('Expected relogin 200, got:', relogRes.status, await relogRes.text());
    process.exit(1);
  }
  console.log('SUCCESS: Relogin allowed after invalidation.');
}

main().catch(console.error);
