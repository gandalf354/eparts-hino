
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

async function migrate() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    // Check if column exists first
    const [cols] = await connection.query("SHOW COLUMNS FROM users LIKE 'posisi'");
    if (cols.length > 0) {
      console.log("Column 'posisi' already exists in 'users' table.");
    } else {
      // Use the exact enum definition from illustrations
      const sql = "ALTER TABLE users ADD COLUMN posisi ENUM('Engine','Powertrain','Chassis/Tool','Electrical','Cabin/Rear Body') DEFAULT NULL AFTER role";
      await connection.query(sql);
      console.log("Added column 'posisi' to 'users' table.");
    }
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await connection.end();
  }
}

migrate();
