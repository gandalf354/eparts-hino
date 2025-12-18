import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import 'dotenv/config';

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER, 
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const username = 'test_device_lock';
  const password = 'password123';
  const hash = await bcrypt.hash(password, 10);

  // Clean up old test user if exists
  await conn.query('DELETE FROM users WHERE username = ?', [username]);

  // Insert new test user
  await conn.query(
    'INSERT INTO users (username, password_hash, role, posisi) VALUES (?, ?, ?, ?)',
    [username, hash, 'admin', 'Engine']
  );

  console.log(`User ${username} created/reset.`);
  await conn.end();
}

main().catch(console.error);