import 'dotenv/config';
import mysql from 'mysql2/promise';

const dbConfig = (() => {
  const pwd = process.env.DB_PASSWORD;
  const socket = process.env.DB_SOCKET;
  const base = socket
    ? {
        socketPath: socket,
        user: process.env.DB_USER || 'root',
        database: process.env.DB_NAME || 'db_partkatalog'
      }
    : {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        database: process.env.DB_NAME || 'db_partkatalog'
      };
  return pwd ? { ...base, password: pwd } : base;
})();

async function run() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const sql = "ALTER TABLE illustrations ADD COLUMN no_posisi VARCHAR(255) DEFAULT '' AFTER nama_posisi";
    console.log('Running SQL:', sql);
    await connection.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists, skipping.');
    } else {
      console.error('Migration failed:', err);
    }
  } finally {
    await connection.end();
  }
}

run();
