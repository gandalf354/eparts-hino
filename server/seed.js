import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
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
  // Ensure database and schema exist with MySQL version-safe steps
  const admin = await mysql.createConnection(
    dbConfig.socketPath
      ? (dbConfig.password
          ? { socketPath: dbConfig.socketPath, user: dbConfig.user, password: dbConfig.password }
          : { socketPath: dbConfig.socketPath, user: dbConfig.user })
      : (dbConfig.password
          ? { host: dbConfig.host, port: dbConfig.port, user: dbConfig.user, password: dbConfig.password }
          : { host: dbConfig.host, port: dbConfig.port, user: dbConfig.user })
  );
  await admin.query('CREATE DATABASE IF NOT EXISTS db_partkatalog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await admin.query('USE db_partkatalog');
  await admin.query(
    'CREATE TABLE IF NOT EXISTS illustrations (\n' +
      '  jenis VARCHAR(64) NOT NULL,\n' +
      '  name VARCHAR(255) NOT NULL,\n' +
      '  model VARCHAR(255) NOT NULL,\n' +
      '  image VARCHAR(255) NOT NULL,\n' +
      '  width INT NOT NULL,\n' +
      '  height INT NOT NULL\n' +
    ')'
  );
  // Rename legacy columns to jenis if exist
  const [hasIdColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'id'"
  );
  const [hasExtIdColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'ext_id'"
  );
  const [hasJenisColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'jenis'"
  );
  const hasIdCol = (Array.isArray(hasIdColRows) ? hasIdColRows[0]?.cnt : hasIdColRows?.cnt) > 0;
  const hasExtIdCol = (Array.isArray(hasExtIdColRows) ? hasExtIdColRows[0]?.cnt : hasExtIdColRows?.cnt) > 0;
  const hasJenisCol = (Array.isArray(hasJenisColRows) ? hasJenisColRows[0]?.cnt : hasJenisColRows?.cnt) > 0;
  if (hasIdCol && !hasJenisCol) {
    await admin.query('ALTER TABLE illustrations CHANGE COLUMN id jenis VARCHAR(64) NOT NULL UNIQUE');
  }
  if (hasExtIdCol && !hasJenisCol) {
    await admin.query('ALTER TABLE illustrations CHANGE COLUMN ext_id jenis VARCHAR(64) NOT NULL UNIQUE');
  }
  const [iidColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'iid'"
  );
  if ((Array.isArray(iidColRows) ? iidColRows[0]?.cnt : iidColRows?.cnt) === 0) {
    await admin.query("ALTER TABLE illustrations ADD COLUMN iid BIGINT NOT NULL AUTO_INCREMENT UNIQUE FIRST");
  }
  // Migrate foreign keys to use iid: drop legacy FKs that reference illustrations(id) if present
  try {
    const [fkIpRows] = await admin.query(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustration_parts' AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_illustration_parts_illustration'"
    );
    if ((Array.isArray(fkIpRows) ? fkIpRows.length : (fkIpRows ? 1 : 0)) > 0) {
      await admin.query('ALTER TABLE illustration_parts DROP FOREIGN KEY fk_illustration_parts_illustration');
    }
  } catch {}
  try {
    const [fkHRows] = await admin.query(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotspots' AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_hotspots_illustration'"
    );
    if ((Array.isArray(fkHRows) ? fkHRows.length : (fkHRows ? 1 : 0)) > 0) {
      await admin.query('ALTER TABLE hotspots DROP FOREIGN KEY fk_hotspots_illustration');
    }
  } catch {}
  const [pkRows] = await admin.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND CONSTRAINT_NAME = 'PRIMARY'"
  );
  const currentPkCol = Array.isArray(pkRows) ? pkRows[0]?.COLUMN_NAME : pkRows?.COLUMN_NAME;
  if (currentPkCol === 'id') {
    await admin.query('ALTER TABLE illustrations DROP PRIMARY KEY, ADD PRIMARY KEY (iid)');
  }
  try { await admin.query('ALTER TABLE illustrations DROP INDEX jenis'); } catch {}
  try { await admin.query('ALTER TABLE illustrations DROP INDEX ext_id'); } catch {}
  try { await admin.query('ALTER TABLE illustrations DROP INDEX uniq_illustrations_id'); } catch {}
  const [modelColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'model'"
  );
  if ((Array.isArray(modelColRows) ? modelColRows[0]?.cnt : modelColRows?.cnt) === 0) {
    await admin.query("ALTER TABLE illustrations ADD COLUMN model VARCHAR(255) NOT NULL DEFAULT '' AFTER name");
  }
  // Ensure 'posisi' column exists as ENUM after 'model'
  const [posisiColRows] = await admin.query(
    "SELECT DATA_TYPE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'posisi'"
  );
  const posisiDesired = "enum('Engine','Powertrain','Chassis/Tool','Electrical','Cabin/Rear Body')";
  const posisiExists = Array.isArray(posisiColRows) ? !!posisiColRows[0] : !!posisiColRows;
  if (!posisiExists) {
    await admin.query(
      "ALTER TABLE illustrations ADD COLUMN posisi ENUM('Engine','Powertrain','Chassis/Tool','Electrical','Cabin/Rear Body') NOT NULL DEFAULT 'Engine' AFTER model"
    );
  } else {
    const isEnum = Array.isArray(posisiColRows)
      ? (posisiColRows[0]?.DATA_TYPE === 'enum')
      : (posisiColRows?.DATA_TYPE === 'enum');
    const matches = Array.isArray(posisiColRows)
      ? (String(posisiColRows[0]?.COLUMN_TYPE).toLowerCase() === posisiDesired.toLowerCase())
      : (String(posisiColRows?.COLUMN_TYPE).toLowerCase() === posisiDesired.toLowerCase());
    if (!isEnum || !matches) {
      await admin.query(
        "ALTER TABLE illustrations MODIFY COLUMN posisi ENUM('Engine','Powertrain','Chassis/Tool','Electrical','Cabin/Rear Body') NOT NULL DEFAULT 'Engine' AFTER model"
      );
    }
  }
  const [namaPosisiColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'nama_posisi'"
  );
  if ((Array.isArray(namaPosisiColRows) ? namaPosisiColRows[0]?.cnt : namaPosisiColRows?.cnt) === 0) {
    await admin.query("ALTER TABLE illustrations ADD COLUMN nama_posisi VARCHAR(255) NOT NULL DEFAULT '' AFTER posisi");
  } else {
    try { await admin.query("ALTER TABLE illustrations MODIFY COLUMN nama_posisi VARCHAR(255) NOT NULL DEFAULT '' AFTER posisi"); } catch {}
  }
  // Ensure 'jenis' uses strict ENUM with required values
  const [jenisTypeRows] = await admin.query(
    "SELECT DATA_TYPE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'jenis'"
  );
  const jenisIsEnum = Array.isArray(jenisTypeRows)
    ? (jenisTypeRows[0]?.DATA_TYPE === 'enum')
    : (jenisTypeRows?.DATA_TYPE === 'enum');
  const desiredEnum = "enum('Truck Heavy-duty','Truck Medium-duty','Truck Light-duty')";
  const jenisMatchesDesired = Array.isArray(jenisTypeRows)
    ? (String(jenisTypeRows[0]?.COLUMN_TYPE).toLowerCase() === desiredEnum.toLowerCase())
    : (String(jenisTypeRows?.COLUMN_TYPE).toLowerCase() === desiredEnum.toLowerCase());
  if (!jenisIsEnum || !jenisMatchesDesired) {
    try {
      await admin.query(
        "ALTER TABLE illustrations ADD COLUMN jenis_enum ENUM('Truck Heavy-duty','Truck Medium-duty','Truck Light-duty') NOT NULL DEFAULT 'Truck Medium-duty' AFTER iid"
      );
    } catch {}
    try {
      await admin.query(
        "UPDATE illustrations SET jenis_enum = CASE WHEN jenis IN ('Truck Heavy-duty','Truck Medium-duty','Truck Light-duty') THEN jenis ELSE 'Truck Medium-duty' END"
      );
    } catch {}
    try { await admin.query('ALTER TABLE illustrations DROP COLUMN jenis'); } catch {}
    await admin.query(
      "ALTER TABLE illustrations CHANGE COLUMN jenis_enum jenis ENUM('Truck Heavy-duty','Truck Medium-duty','Truck Light-duty') NOT NULL DEFAULT 'Truck Medium-duty'"
    );
  }
  await admin.query(
    'CREATE TABLE IF NOT EXISTS parts (\n' +
      '  id VARCHAR(64) PRIMARY KEY,\n' +
      '  code VARCHAR(64) NOT NULL,\n' +
      '  name VARCHAR(255) NOT NULL\n' +
    ')'
  );
  const [colRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'price'"
  );
  if ((Array.isArray(colRows) ? colRows[0]?.cnt : colRows?.cnt) === 0) {
    await admin.query('ALTER TABLE parts ADD COLUMN price INT NOT NULL DEFAULT 0 AFTER name');
  }
  const [additionalColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'additional'"
  );
  if ((Array.isArray(additionalColRows) ? additionalColRows[0]?.cnt : additionalColRows?.cnt) === 0) {
    await admin.query("ALTER TABLE parts ADD COLUMN additional VARCHAR(255) NOT NULL DEFAULT '' AFTER price");
  } else {
    try { await admin.query("ALTER TABLE parts MODIFY COLUMN additional VARCHAR(255) NOT NULL DEFAULT '' AFTER price"); } catch {}
  }
  await admin.query(
    'CREATE TABLE IF NOT EXISTS illustration_parts (\n' +
      '  illustration_id VARCHAR(64) NOT NULL,\n' +
      '  illustration_iid BIGINT NULL,\n' +
      '  part_id VARCHAR(64) NOT NULL,\n' +
      '  PRIMARY KEY (illustration_id, part_id),\n' +
      '  KEY idx_illustration_parts_part (part_id),\n' +
      '  CONSTRAINT fk_illustration_parts_illustration FOREIGN KEY (illustration_id)\n' +
      '    REFERENCES illustrations(id) ON DELETE CASCADE ON UPDATE CASCADE,\n' +
      '  CONSTRAINT fk_illustration_parts_part FOREIGN KEY (part_id)\n' +
      '    REFERENCES parts(id) ON DELETE CASCADE ON UPDATE CASCADE\n' +
    ')'
  );
  const [ipIidColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustration_parts' AND COLUMN_NAME = 'illustration_iid'"
  );
  if ((Array.isArray(ipIidColRows) ? ipIidColRows[0]?.cnt : ipIidColRows?.cnt) === 0) {
    await admin.query('ALTER TABLE illustration_parts ADD COLUMN illustration_iid BIGINT NULL AFTER illustration_id');
    try { await admin.query('ALTER TABLE illustration_parts ADD INDEX idx_illustration_parts_illustration_iid (illustration_iid)'); } catch {}
    try { await admin.query('ALTER TABLE illustration_parts ADD CONSTRAINT fk_illustration_parts_illustration_iid FOREIGN KEY (illustration_iid) REFERENCES illustrations(iid) ON DELETE CASCADE ON UPDATE CASCADE'); } catch {}
  }
  await admin.query(
    'CREATE TABLE IF NOT EXISTS hotspots (\n' +
      '  id BIGINT AUTO_INCREMENT PRIMARY KEY,\n' +
      '  illustration_id VARCHAR(64) NOT NULL,\n' +
      '  illustration_iid BIGINT NULL,\n' +
      '  x INT NOT NULL,\n' +
      '  y INT NOT NULL,\n' +
      '  r INT NOT NULL,\n' +
      '  KEY idx_hotspots_illustration (illustration_id),\n' +
      '  CONSTRAINT fk_hotspots_illustration FOREIGN KEY (illustration_id)\n' +
      '    REFERENCES illustrations(id) ON DELETE CASCADE ON UPDATE CASCADE\n' +
    ')'
  );
  const [hIidColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hotspots' AND COLUMN_NAME = 'illustration_iid'"
  );
  if ((Array.isArray(hIidColRows) ? hIidColRows[0]?.cnt : hIidColRows?.cnt) === 0) {
    await admin.query('ALTER TABLE hotspots ADD COLUMN illustration_iid BIGINT NULL AFTER illustration_id');
    try { await admin.query('ALTER TABLE hotspots ADD INDEX idx_hotspots_illustration_iid (illustration_iid)'); } catch {}
    try { await admin.query('ALTER TABLE hotspots ADD CONSTRAINT fk_hotspots_illustration_iid FOREIGN KEY (illustration_iid) REFERENCES illustrations(iid) ON DELETE CASCADE ON UPDATE CASCADE'); } catch {}
  }
  // Backfill iid to child tables and switch primary key to use illustration_iid
  try { await admin.query('UPDATE illustration_parts ip JOIN illustrations i ON i.id = ip.illustration_id SET ip.illustration_iid = i.iid WHERE ip.illustration_iid IS NULL'); } catch {}
  try { await admin.query('UPDATE hotspots h JOIN illustrations i ON i.id = h.illustration_id SET h.illustration_iid = i.iid WHERE h.illustration_iid IS NULL'); } catch {}
  try { await admin.query('ALTER TABLE illustration_parts MODIFY COLUMN illustration_iid BIGINT NOT NULL'); } catch {}
  try { await admin.query('ALTER TABLE illustration_parts DROP PRIMARY KEY'); } catch {}
  try { await admin.query('ALTER TABLE illustration_parts ADD PRIMARY KEY (illustration_iid, part_id)'); } catch {}
  await admin.query(
    'CREATE TABLE IF NOT EXISTS hotspot_parts (\n' +
      '  hotspot_id BIGINT NOT NULL,\n' +
      '  part_id VARCHAR(64) NOT NULL,\n' +
      '  PRIMARY KEY (hotspot_id, part_id),\n' +
      '  KEY idx_hotspot_parts_part (part_id),\n' +
      '  CONSTRAINT fk_hotspot_parts_hotspot FOREIGN KEY (hotspot_id)\n' +
      '    REFERENCES hotspots(id) ON DELETE CASCADE ON UPDATE CASCADE,\n' +
      '  CONSTRAINT fk_hotspot_parts_part FOREIGN KEY (part_id)\n' +
      '    REFERENCES parts(id) ON DELETE CASCADE ON UPDATE CASCADE\n' +
    ')'
  );
  await admin.query(
    'CREATE TABLE IF NOT EXISTS users (\n' +
      '  id INT AUTO_INCREMENT PRIMARY KEY,\n' +
      '  username VARCHAR(64) NOT NULL UNIQUE,\n' +
      '  password_hash VARCHAR(255) NOT NULL,\n' +
      '  role VARCHAR(32) NOT NULL DEFAULT "admin",\n' +
      '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n' +
      '  expired_at TIMESTAMP NULL DEFAULT NULL\n' +
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  );
  const [expColRows] = await admin.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'expired_at'"
  );
  if ((Array.isArray(expColRows) ? expColRows[0]?.cnt : expColRows?.cnt) === 0) {
    await admin.query('ALTER TABLE users ADD COLUMN expired_at TIMESTAMP NULL DEFAULT NULL AFTER created_at');
  } else {
    try { await admin.query('ALTER TABLE users MODIFY COLUMN expired_at TIMESTAMP NULL DEFAULT NULL AFTER created_at'); } catch {}
  }
  const shouldSeedUsers = String(process.env.SEED_CREATE_USERS ?? 'false').toLowerCase() === 'true';
  if (shouldSeedUsers) {
    console.log('seed: user seeding enabled (SEED_CREATE_USERS=true)');
    const bcrypt = (await import('bcrypt')).default;
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const [existing] = await admin.query('SELECT id FROM users WHERE username = ?', [adminUser]);
    if (existing.length === 0) {
      const hash = await bcrypt.hash(adminPass, 10);
      await admin.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [adminUser, hash, 'admin']);
      console.log(`seed: created admin user '${adminUser}'`);
    }
    const superUser = process.env.SUPERADMIN_USER || 'superadmin';
    const superPass = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
    const [existingSuper] = await admin.query('SELECT id FROM users WHERE username = ?', [superUser]);
    if (existingSuper.length === 0) {
      const hash3 = await bcrypt.hash(superPass, 10);
      await admin.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [superUser, hash3, 'superadmin']);
      console.log(`seed: created superadmin user '${superUser}'`);
    }
    const normalUser = process.env.DEFAULT_USER || 'user';
    const normalPass = process.env.DEFAULT_USER_PASSWORD || 'user123';
    const [existingUser] = await admin.query('SELECT id FROM users WHERE username = ?', [normalUser]);
    if (existingUser.length === 0) {
      const hash2 = await bcrypt.hash(normalPass, 10);
      await admin.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [normalUser, hash2, 'user']);
      console.log(`seed: created user '${normalUser}' with role 'user'`);
    }
  } else {
    console.log('seed: user seeding disabled (SEED_CREATE_USERS!=true)');
  }
  await admin.end();

  const pool = await mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
  });

  const jsonPath = path.join(process.cwd(), 'public', 'data', 'catalog.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('seed: catalog.json not found, skipping catalog data seeding');
    await pool.end();
    return;
  }
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const catalog = JSON.parse(raw);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE illustration_parts ip JOIN illustrations i ON i.jenis = ip.illustration_id SET ip.illustration_iid = i.iid WHERE ip.illustration_iid IS NULL');
    await conn.query('UPDATE hotspots h JOIN illustrations i ON i.jenis = h.illustration_id SET h.illustration_iid = i.iid WHERE h.illustration_iid IS NULL');
    for (const fig of catalog.illustrations) {
      await conn.query(
        'INSERT INTO illustrations (jenis, name, model, image, width, height) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), model=VALUES(model), image=VALUES(image), width=VALUES(width), height=VALUES(height)',
        [fig.id, fig.name, fig.model ?? '', fig.image, fig.size.width, fig.size.height]
      );
      await conn.query('UPDATE illustration_parts ip JOIN illustrations i ON i.jenis = ip.illustration_id SET ip.illustration_iid = i.iid WHERE ip.illustration_id = ? AND ip.illustration_iid IS NULL', [fig.id]);
      await conn.query('UPDATE hotspots h JOIN illustrations i ON i.jenis = h.illustration_id SET h.illustration_iid = i.iid WHERE h.illustration_id = ? AND h.illustration_iid IS NULL', [fig.id]);
      const [iidRows] = await conn.query('SELECT iid FROM illustrations WHERE jenis = ?', [fig.id]);
      const iid = iidRows[0]?.iid;

      for (const p of fig.parts) {
        const price = Number.isFinite(p.price) ? p.price : 0;
        await conn.query(
          'INSERT INTO parts (id, code, name, price) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name), price=VALUES(price)',
          [p.id, p.code, p.name, price]
        );
      await conn.query(
        'INSERT IGNORE INTO illustration_parts (illustration_iid, part_id) VALUES (?, ?)',
        [iid, p.id]
      );
      }

      await conn.query('DELETE hp FROM hotspot_parts hp JOIN hotspots h ON h.id = hp.hotspot_id WHERE h.illustration_iid = ?', [iid]);
      await conn.query('DELETE FROM hotspots WHERE illustration_iid = ?', [iid]);

      for (const h of fig.hotspots) {
        const ids = Array.isArray(h.partIds) ? h.partIds : [h.partId];
        const [res] = await conn.query(
          'INSERT INTO hotspots (illustration_iid, x, y, r) VALUES (?, ?, ?, ?)',
          [iid, h.x, h.y, h.r]
        );
        const hotspotId = res.insertId;
        for (const pid of ids) {
          await conn.query('INSERT INTO hotspot_parts (hotspot_id, part_id) VALUES (?, ?)', [hotspotId, pid]);
        }
      }
    }
    await conn.query('ALTER TABLE illustration_parts MODIFY COLUMN illustration_iid BIGINT NOT NULL');
    try { await conn.query('ALTER TABLE illustration_parts DROP PRIMARY KEY'); } catch {}
    await conn.query('ALTER TABLE illustration_parts ADD PRIMARY KEY (illustration_iid, part_id)');
    await conn.commit();
    console.log('seed completed');
  } catch (e) {
    await conn.rollback();
    console.error('seed failed', e);
    process.exitCode = 1;
  } finally {
    conn.release();
    pool.end();
  }
}

main();
