import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE_URL = 'http://localhost:4000';

async function main() {
  console.log('Testing admin scope on Manage Users...');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  await conn.query("UPDATE users SET last_activity_at = NULL, logout_all_at = NULL WHERE username = ?", ['test_device_lock']);
  // Ensure we have a superadmin, admin, and partshop for visibility test
  await conn.query("INSERT IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)", ['test_super', 'hash', 'superadmin']);
  await conn.query("INSERT IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)", ['test_partshop', 'hash', 'partshop']);
  await conn.end();

  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test_device_lock', password: 'password123' })
  });
  if (loginRes.status !== 200) {
    console.error('Admin login failed:', await loginRes.text());
    process.exit(1);
  }
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';

  const preListRes = await fetch(`${BASE_URL}/api/users`, { headers: { cookie } });
  const preList = await preListRes.json();
  for (const uname of ['managed_user1','managed_user_bad']) {
    const u = preList.find(x => x.username === uname);
    if (u) {
      await fetch(`${BASE_URL}/api/users/${u.id}`, { method: 'DELETE', headers: { cookie } });
    }
  }

  console.log('\n[Create user as admin with role=admin (should 403)]');
  const createResBad = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ username: 'managed_user_bad', password: 'u123', role: 'admin' })
  });
  console.log('Create bad status:', createResBad.status);
  if (createResBad.status !== 403) {
    console.error('Expected 403 when admin tries to create non-user role');
    process.exit(1);
  }

  console.log('\n[Create user as admin with role=user]');
  const createRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ username: 'managed_user1', password: 'u123', role: 'user' })
  });
  const createBody = await createRes.json().catch(() => ({}));
  console.log('Create status:', createRes.status, 'role returned:', createBody.role);
  if (createRes.status !== 201 || createBody.role !== 'user') {
    console.error('Expected creation as user role.');
    process.exit(1);
  }

  console.log('\n[List users as admin]');
  const listRes = await fetch(`${BASE_URL}/api/users`, { headers: { cookie } });
  const list = await listRes.json();
  console.log('Users:', list.map(u => `${u.username}:${u.role}`).join(', '));
  
  const hasSuper = list.some(u => u.role === 'superadmin');
  const hasAdmin = list.some(u => u.role === 'admin');
  const hasUser = list.some(u => u.role === 'user');
  const hasPartshop = list.some(u => u.role === 'partshop');

  console.log(`Visibility check: Super=${hasSuper}, Admin=${hasAdmin}, User=${hasUser}, Partshop=${hasPartshop}`);

  if (!hasSuper || !hasAdmin || !hasUser) {
    console.error('Expected admin to see superadmin, admin, and user.');
    process.exit(1);
  }
  if (hasPartshop) {
    console.error('Expected admin NOT to see partshop (based on current implementation).');
    process.exit(1);
  }

  console.log('\n[Try update managed_user1 to admin]');
  const target = list.find(u => u.username === 'managed_user1');
  const putRes = await fetch(`${BASE_URL}/api/users/${target.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ role: 'admin' })
  });
  console.log('PUT status:', putRes.status);
  if (putRes.status !== 403) {
    console.error('Expected 403 when admin changes role to admin');
    process.exit(1);
  }

  console.log('\nSUCCESS: Admin scope enforced.');
}

main().catch(console.error);
