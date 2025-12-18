
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

async function checkSchema() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [illustrationsCols] = await connection.query("SHOW COLUMNS FROM illustrations LIKE 'posisi'");
    console.log('Illustrations posisi:', illustrationsCols);
    
    const [usersCols] = await connection.query("SHOW COLUMNS FROM users");
    console.log('Users columns:', usersCols);
  } catch (err) {
    console.error('Error checking schema:', err);
  } finally {
    await connection.end();
  }
}

checkSchema();
