import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';

let pool;

const app = express();
const allowedOrigins = new Set(['http://localhost:5173', 'http://localhost:5174']);
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, allowedOrigins.has(origin));
  },
  credentials: true,
  allowedHeaders: ['Content-Type']
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const POSISI_ALLOWED = new Set(['Engine', 'Powertrain', 'Chassis/Tool', 'Electrical', 'Cabin/Rear Body']);
const JENIS_ALLOWED = new Set(['Truck Heavy-duty', 'Truck Medium-duty', 'Truck Light-duty']);

function signSession(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;

    try {
      const [rows] = await pool.query('SELECT logout_all_at, password_rev FROM users WHERE id = ?', [user.id]);
      const logoutAt = rows?.[0]?.logout_all_at ? new Date(rows[0].logout_all_at).getTime() : null;
      const tokenIatMs = (user.iat ? user.iat * 1000 : 0);
      if (logoutAt && tokenIatMs <= logoutAt) {
        const isProduction = process.env.NODE_ENV === 'production';
        res.clearCookie('session', { path: '/', sameSite: 'lax', secure: isProduction, httpOnly: true });
        return res.status(401).json({ error: 'unauthorized' });
      }
      if (rows?.[0] && typeof rows[0].password_rev === 'number' && typeof user.rev === 'number' && rows[0].password_rev !== user.rev) {
        const isProduction = process.env.NODE_ENV === 'production';
        res.clearCookie('session', { path: '/', sameSite: 'lax', secure: isProduction, httpOnly: true });
        return res.status(401).json({ error: 'unauthorized' });
      }
    } catch {}

    if (pool) {
      pool.query('UPDATE users SET last_activity_at = NOW() WHERE id = ?', [user.id]).catch(() => {});
    }
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

function requireAdmin(req, res, next) {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  if (u.role !== 'admin' && u.role !== 'superadmin') return res.status(403).json({ error: 'forbidden' });
  next();
}

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

async function start() {
  pool = await mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  try {
    const [hasLogoutAllAtRows] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'logout_all_at'"
    );
    const hasLogoutAllAt = (Array.isArray(hasLogoutAllAtRows) ? hasLogoutAllAtRows[0]?.cnt : hasLogoutAllAtRows?.cnt) > 0;
    if (!hasLogoutAllAt) {
      await pool.query("ALTER TABLE users ADD COLUMN logout_all_at TIMESTAMP NULL DEFAULT NULL");
    }
    const [hasPwRevRows] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_rev'"
    );
    const hasPwRev = (Array.isArray(hasPwRevRows) ? hasPwRevRows[0]?.cnt : hasPwRevRows?.cnt) > 0;
    if (!hasPwRev) {
      await pool.query("ALTER TABLE users ADD COLUMN password_rev INT NOT NULL DEFAULT 0");
    }
  } catch {}
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const safe = (Date.now() + '-' + file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, safe);
    }
  });
  const upload = multer({ storage });

  app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const publicPath = `/uploads/${req.file.filename}`;
    res.json({ path: publicPath });
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'bad_request' });
    try {
      const [rows] = await pool.query('SELECT id, username, password_hash, role, posisi, expired_at, last_activity_at, logout_all_at, password_rev FROM users WHERE username = ?', [username]);
      if (rows.length === 0) return res.status(401).json({ error: 'invalid_credentials' });
      const u = rows[0];
      if (u.expired_at) {
        const exp = new Date(u.expired_at);
        if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) return res.status(401).json({ error: 'user_expired' });
      }

      // Check if user is active on another device (timeout 15 mins)
      const lastActiveRaw = u.last_activity_at ? new Date(u.last_activity_at) : null;
      const logoutAllAtRaw = u.logout_all_at ? new Date(u.logout_all_at) : null;
      
      // If logout_all_at is set and is later than last_activity_at, ignore last_activity_at
      let lastActive = lastActiveRaw;
      if (lastActive && logoutAllAtRaw && logoutAllAtRaw.getTime() >= lastActive.getTime()) {
        lastActive = null;
      }

      if (lastActive) {
        const now = Date.now();
        const diffMs = now - lastActive.getTime();
        const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
        
        console.log(`Login check: User ${u.username}, LastActive: ${lastActive.toISOString()}, Now: ${new Date(now).toISOString()}, Diff: ${diffMs}ms`);

        if (diffMs < TIMEOUT_MS && diffMs >= 0) {
          console.log('Login blocked: User active elsewhere');
          return res.status(403).json({ error: 'user_active_elsewhere' });
        }
      }

      const ok = await bcrypt.compare(password, u.password_hash);

      if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
      
      // Update last_activity_at immediately on login
      await pool.query('UPDATE users SET last_activity_at = NOW() WHERE id = ?', [u.id]);
      
      const token = signSession({ id: u.id, username: u.username, role: u.role, posisi: u.posisi, rev: u.password_rev });
      
      // Best Practice: Gunakan pengaturan cookie yang aman
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('session', token, { 
        httpOnly: true, // Mencegah akses via JavaScript (XSS protection)
        sameSite: 'lax', // Mencegah CSRF (bisa 'strict' jika frontend & backend satu domain)
        secure: isProduction, // Hanya kirim via HTTPS di production
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 hari dalam milidetik
      });
      
      res.json({ id: u.id, username: u.username, role: u.role, posisi: u.posisi });
    } catch (e) {
      console.error('POST /api/login error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  app.post('/api/logout', async (req, res) => {
    const token = req.cookies?.session;
    if (token) {
      try {
        const user = jwt.verify(token, JWT_SECRET);
        await pool.query('UPDATE users SET last_activity_at = NULL WHERE id = ?', [user.id]);
      } catch {}
    }
    res.clearCookie('session', { path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/meta/illustrations/jenis-enum', async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'jenis'");
      if (!rows || rows.length === 0) return res.json(Array.from(JENIS_ALLOWED));
      const ct = rows[0].COLUMN_TYPE || '';
      const m = String(ct).match(/^enum\((.*)\)$/i);
      const list = m ? m[1].split(',').map(s => s.trim().replace(/^'(.*)'$/, '$1')) : Array.from(JENIS_ALLOWED);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: 'db_error' });
    }
  });
  app.get('/api/meta/illustrations/posisi-enum', async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'illustrations' AND COLUMN_NAME = 'posisi'");
      if (!rows || rows.length === 0) return res.json(Array.from(POSISI_ALLOWED));
      const ct = rows[0].COLUMN_TYPE || '';
      const m = String(ct).match(/^enum\((.*)\)$/i);
      const list = m ? m[1].split(',').map(s => s.trim().replace(/^'(.*)'$/, '$1')) : Array.from(POSISI_ALLOWED);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: 'db_error' });
    }
  });
  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    console.log(`server on :${port}`);
  });
}

  app.get('/api/illustrations', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT jenis AS id, name, model, posisi, nama_posisi, no_posisi, image, width, height FROM illustrations');
    const items = rows.map(r => ({ id: r.id, name: r.name, model: r.model ?? '', posisi: r.posisi ?? 'Engine', nama_posisi: r.nama_posisi ?? '', no_posisi: r.no_posisi ?? '', image: r.image, size: { width: r.width, height: r.height } }));
    res.json(items);
  } catch (e) {
    console.error('GET /api/illustrations error', e);
    res.status(500).json({ error: 'db_error' });
  }
  });

  app.get('/api/illustrations/iid/:iid', async (req, res) => {
    const iid = Number(req.params.iid);
    if (!Number.isFinite(iid)) return res.status(400).json({ error: 'bad_request' });
    try {
      const [rows] = await pool.query('SELECT jenis AS id, iid, name, model, posisi, nama_posisi, no_posisi, image, width, height FROM illustrations WHERE iid = ?', [iid]);
      if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
      const base = { id: rows[0].id, name: rows[0].name, model: rows[0].model ?? '', posisi: rows[0].posisi ?? 'Engine', nama_posisi: rows[0].nama_posisi ?? '', no_posisi: rows[0].no_posisi ?? '', image: rows[0].image, size: { width: rows[0].width, height: rows[0].height } };
      const [partsRows] = await pool.query('SELECT p.id, p.code, p.name, p.price, p.additional FROM illustration_parts ip JOIN parts p ON p.id = ip.part_id WHERE ip.illustration_iid = ?', [iid]);
      const [hotspotRows] = await pool.query('SELECT id, x, y, r FROM hotspots WHERE illustration_iid = ?', [iid]);
      const hotspots = [];
      for (const h of hotspotRows) {
        const [hpRows] = await pool.query('SELECT part_id FROM hotspot_parts WHERE hotspot_id = ?', [h.id]);
        const partIds = hpRows.map(r => r.part_id);
        if (partIds.length === 1) {
          hotspots.push({ partId: partIds[0], x: h.x, y: h.y, r: h.r });
        } else {
          hotspots.push({ partIds, x: h.x, y: h.y, r: h.r });
        }
      }
      res.json({ ...base, parts: partsRows, hotspots });
    } catch (e) {
      console.error('GET /api/illustrations/iid/:iid error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

app.post('/api/illustrations', requireAuth, async (req, res) => {
  const { id, name, image, width, height, model, posisi, nama_posisi, no_posisi } = req.body || {};
  if (!id || !name || !image || !Number.isFinite(width) || !Number.isFinite(height) || !posisi) return res.status(400).json({ error: 'bad_request' });
  if (!JENIS_ALLOWED.has(id)) return res.status(400).json({ error: 'invalid_jenis' });
  if (!POSISI_ALLOWED.has(posisi)) return res.status(400).json({ error: 'invalid_posisi' });
  try {
    await pool.query('INSERT INTO illustrations (jenis, name, model, posisi, nama_posisi, no_posisi, image, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, name, model ?? '', posisi, nama_posisi ?? '', no_posisi ?? '', image, width, height]);
    res.status(201).json({ id, name, model: model ?? '', posisi, nama_posisi: nama_posisi ?? '', no_posisi: no_posisi ?? '', image, size: { width, height } });
  } catch (e) {
    console.error('POST /api/illustrations error', e);
    res.status(500).json({ error: 'db_error' });
  }
});

  app.put('/api/illustrations/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { name, image, width, height, model, posisi, nama_posisi, no_posisi } = req.body || {};
  if (!name || !image || !Number.isFinite(width) || !Number.isFinite(height) || !posisi) return res.status(400).json({ error: 'bad_request' });
  if (!POSISI_ALLOWED.has(posisi)) return res.status(400).json({ error: 'invalid_posisi' });
  try {
    const [result] = await pool.query('UPDATE illustrations SET name = ?, model = ?, posisi = ?, nama_posisi = ?, no_posisi = ?, image = ?, width = ?, height = ? WHERE jenis = ?', [name, model ?? '', posisi, nama_posisi ?? '', no_posisi ?? '', image, width, height, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ id, name, model: model ?? '', posisi, nama_posisi: nama_posisi ?? '', no_posisi: no_posisi ?? '', image, size: { width, height } });
  } catch (e) {
    console.error('PUT /api/illustrations/:id error', e);
    res.status(500).json({ error: 'db_error' });
  }
  });

  app.delete('/api/illustrations/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const [result] = await pool.query('DELETE FROM illustrations WHERE jenis = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/illustrations/:id error', e);
    res.status(500).json({ error: 'db_error' });
  }
  });

  app.put('/api/illustrations/iid/:iid', requireAuth, async (req, res) => {
    const iid = Number(req.params.iid);
    const { id, name, image, width, height, model, posisi, nama_posisi, no_posisi } = req.body || {};
    if (!Number.isFinite(iid) || !name || !image || !Number.isFinite(width) || !Number.isFinite(height) || !posisi) return res.status(400).json({ error: 'bad_request' });
    try {
      let sql, params;
      if (typeof id === 'string' && id.trim()) {
        if (!JENIS_ALLOWED.has(id.trim())) return res.status(400).json({ error: 'invalid_jenis' });
        if (!POSISI_ALLOWED.has(posisi)) return res.status(400).json({ error: 'invalid_posisi' });
        sql = 'UPDATE illustrations SET jenis = ?, name = ?, model = ?, posisi = ?, nama_posisi = ?, no_posisi = ?, image = ?, width = ?, height = ? WHERE iid = ?';
        params = [id.trim(), name, model ?? '', posisi, nama_posisi ?? '', no_posisi ?? '', image, width, height, iid];
      } else {
        if (!POSISI_ALLOWED.has(posisi)) return res.status(400).json({ error: 'invalid_posisi' });
        sql = 'UPDATE illustrations SET name = ?, model = ?, posisi = ?, nama_posisi = ?, no_posisi = ?, image = ?, width = ?, height = ? WHERE iid = ?';
        params = [name, model ?? '', posisi, nama_posisi ?? '', no_posisi ?? '', image, width, height, iid];
      }
      const [result] = await pool.query(sql, params);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ iid, id: (typeof id === 'string' && id.trim()) ? id.trim() : undefined, name, model: model ?? '', posisi, nama_posisi: nama_posisi ?? '', no_posisi: no_posisi ?? '', image, size: { width, height } });
    } catch (e) {
      console.error('PUT /api/illustrations/iid/:iid error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.delete('/api/illustrations/iid/:iid', requireAuth, async (req, res) => {
    const iid = Number(req.params.iid);
    if (!Number.isFinite(iid)) return res.status(400).json({ error: 'bad_request' });
    try {
      const [result] = await pool.query('DELETE FROM illustrations WHERE iid = ?', [iid]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /api/illustrations/iid/:iid error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.get('/api/illustrations/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await pool.query('SELECT jenis AS id, iid, name, model, posisi, nama_posisi, no_posisi, image, width, height FROM illustrations WHERE jenis = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    const iid = rows[0].iid;
    const base = { id: rows[0].id, name: rows[0].name, model: rows[0].model ?? '', posisi: rows[0].posisi ?? 'Engine', nama_posisi: rows[0].nama_posisi ?? '', no_posisi: rows[0].no_posisi ?? '', image: rows[0].image, size: { width: rows[0].width, height: rows[0].height } };
    let partsRows;
    if (iid) {
      const [pr] = await pool.query('SELECT p.id, p.code, p.name, p.price, p.additional FROM illustration_parts ip JOIN parts p ON p.id = ip.part_id WHERE ip.illustration_iid = ?', [iid]);
      partsRows = pr;
    } else {
      const [pr] = await pool.query('SELECT p.id, p.code, p.name, p.price, p.additional FROM illustration_parts ip JOIN parts p ON p.id = ip.part_id WHERE ip.illustration_id = ?', [id]);
      partsRows = pr;
    }
    let hotspotRows;
    if (iid) {
      const [hr] = await pool.query('SELECT id, x, y, r FROM hotspots WHERE illustration_iid = ?', [iid]);
      hotspotRows = hr;
    } else {
      const [hr] = await pool.query('SELECT id, x, y, r FROM hotspots WHERE illustration_id = ?', [id]);
      hotspotRows = hr;
    }
    const hotspots = [];
    for (const h of hotspotRows) {
      const [hpRows] = await pool.query('SELECT part_id FROM hotspot_parts WHERE hotspot_id = ?', [h.id]);
      const partIds = hpRows.map(r => r.part_id);
      if (partIds.length === 1) {
        hotspots.push({ partId: partIds[0], x: h.x, y: h.y, r: h.r });
      } else {
        hotspots.push({ partIds, x: h.x, y: h.y, r: h.r });
      }
    }
    res.json({ ...base, parts: partsRows, hotspots });
  } catch (e) {
    console.error('GET /api/illustrations/:id error', e);
    res.status(500).json({ error: 'db_error' });
  }
  });

  app.put('/api/illustrations/iid/:iid/structure', requireAuth, async (req, res) => {
    const iid = Number(req.params.iid);
    const body = req.body || {};
    const parts = Array.isArray(body.parts) ? body.parts : null;
    const hotspotsInput = Array.isArray(body.hotspots) ? body.hotspots : null;
    if (!Number.isFinite(iid) || !parts || !hotspotsInput) return res.status(400).json({ error: 'bad_request' });
    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT jenis FROM illustrations WHERE iid = ?', [iid]);
        if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'not_found' }); }
        const id = rows[0].jenis;
        const partIds = parts.map(p => p.id);
        for (const p of parts) {
          await conn.query(
            'INSERT INTO parts (id, code, name, price, additional) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name), additional=VALUES(additional)',
            [p.id, p.code, p.name, Number.isFinite(p.price) ? p.price : 0, (typeof p.additional === 'string' ? p.additional : '')]
          );
        }
        if (partIds.length === 0) {
          await conn.query('DELETE FROM illustration_parts WHERE illustration_iid = ?', [iid]);
        } else {
          await conn.query('DELETE FROM illustration_parts WHERE illustration_iid = ? AND part_id NOT IN (?)', [iid, partIds]);
          for (const pid of partIds) {
            await conn.query('INSERT IGNORE INTO illustration_parts (illustration_iid, illustration_id, part_id) VALUES (?, ?, ?)', [iid, id, pid]);
          }
        }
        await conn.query('DELETE hp FROM hotspot_parts hp JOIN hotspots h ON h.id = hp.hotspot_id WHERE h.illustration_iid = ?', [iid]);
        await conn.query('DELETE FROM hotspots WHERE illustration_iid = ?', [iid]);
        for (const h of hotspotsInput) {
          const ids = Array.isArray(h.partIds) ? h.partIds : [h.partId];
          const [res2] = await conn.query('INSERT INTO hotspots (illustration_iid, illustration_id, x, y, r) VALUES (?, ?, ?, ?, ?)', [iid, id, h.x, h.y, h.r]);
          const hotspotId = res2.insertId;
          for (const pid of ids) {
            await conn.query('INSERT INTO hotspot_parts (hotspot_id, part_id) VALUES (?, ?)', [hotspotId, pid]);
          }
        }
        await conn.commit();
        res.json({ ok: true });
      } catch (e) {
        await conn.rollback();
        console.error('PUT /api/illustrations/iid/:iid/structure error', e);
        res.status(500).json({ error: 'db_error' });
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error('PUT /api/illustrations/iid/:iid/structure error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

app.put('/api/illustrations/:id/structure', requireAuth, async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const parts = Array.isArray(body.parts) ? body.parts : null;
  const hotspotsInput = Array.isArray(body.hotspots) ? body.hotspots : null;
  if (!parts || !hotspotsInput) return res.status(400).json({ error: 'bad_request' });
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT jenis, iid FROM illustrations WHERE jenis = ?', [id]);
      if (rows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'not_found' });
      }
      const iid = rows[0].iid;
      const partIds = parts.map(p => p.id);
      for (const p of parts) {
        await conn.query(
          'INSERT INTO parts (id, code, name, price, additional) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name), additional=VALUES(additional)',
          [p.id, p.code, p.name, Number.isFinite(p.price) ? p.price : 0, (typeof p.additional === 'string' ? p.additional : '')]
        );
      }
      if (partIds.length === 0) {
        await conn.query('DELETE FROM illustration_parts WHERE illustration_iid = ?', [iid]);
      } else {
        await conn.query('DELETE FROM illustration_parts WHERE illustration_iid = ? AND part_id NOT IN (?)', [iid, partIds]);
        for (const pid of partIds) {
          await conn.query('INSERT IGNORE INTO illustration_parts (illustration_iid, illustration_id, part_id) VALUES (?, ?, ?)', [iid, id, pid]);
        }
      }
      await conn.query('DELETE hp FROM hotspot_parts hp JOIN hotspots h ON h.id = hp.hotspot_id WHERE h.illustration_iid = ?', [iid]);
      await conn.query('DELETE FROM hotspots WHERE illustration_iid = ?', [iid]);
      for (const h of hotspotsInput) {
        const ids = Array.isArray(h.partIds) ? h.partIds : [h.partId];
        const [res2] = await conn.query('INSERT INTO hotspots (illustration_iid, illustration_id, x, y, r) VALUES (?, ?, ?, ?, ?)', [iid, id, h.x, h.y, h.r]);
        const hotspotId = res2.insertId;
        for (const pid of ids) {
          await conn.query('INSERT INTO hotspot_parts (hotspot_id, part_id) VALUES (?, ?)', [hotspotId, pid]);
        }
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      console.error('PUT /api/illustrations/:id/structure error', e);
      res.status(500).json({ error: 'db_error' });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('PUT /api/illustrations/:id/structure error', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/catalog', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT jenis AS id, iid, name, model, posisi, nama_posisi, no_posisi, image, width, height FROM illustrations');
    const illustrations = [];
    for (const r of rows) {
      const id = r.id;
      const iid = r.iid;
      let partsRows;
      if (iid) {
        const [pr] = await pool.query('SELECT p.id, p.code, p.name, p.price, p.additional FROM illustration_parts ip JOIN parts p ON p.id = ip.part_id WHERE ip.illustration_iid = ?', [iid]);
        partsRows = pr;
      } else {
        const [pr] = await pool.query('SELECT p.id, p.code, p.name, p.price, p.additional FROM illustration_parts ip JOIN parts p ON p.id = ip.part_id WHERE ip.illustration_id = ?', [id]);
        partsRows = pr;
      }
      let hotspotRows;
      if (iid) {
        const [hr] = await pool.query('SELECT id, x, y, r FROM hotspots WHERE illustration_iid = ?', [iid]);
        hotspotRows = hr;
      } else {
        const [hr] = await pool.query('SELECT id, x, y, r FROM hotspots WHERE illustration_id = ?', [id]);
        hotspotRows = hr;
      }
      const hotspots = [];
      for (const h of hotspotRows) {
        const [hpRows] = await pool.query('SELECT part_id FROM hotspot_parts WHERE hotspot_id = ?', [h.id]);
        const partIds = hpRows.map(x => x.part_id);
        if (partIds.length === 1) {
          hotspots.push({ partId: partIds[0], x: h.x, y: h.y, r: h.r });
        } else {
          hotspots.push({ partIds, x: h.x, y: h.y, r: h.r });
        }
      }
      illustrations.push({ id, iid, name: r.name, model: r.model ?? '', posisi: r.posisi ?? 'Engine', nama_posisi: r.nama_posisi ?? '', no_posisi: r.no_posisi ?? '', image: r.image, size: { width: r.width, height: r.height }, parts: partsRows, hotspots });
    }
    res.json({ illustrations });
  } catch (e) {
    console.error('GET /api/catalog error', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/parts', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, code, name, price, additional FROM parts ORDER BY code');
    res.json(rows);
  } catch (e) {
    console.error('GET /api/parts error', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/parts', requireAuth, async (req, res) => {
  const { id, code, name, price, additional } = req.body || {};
  if (!id || !code || !name || !Number.isFinite(price)) return res.status(400).json({ error: 'bad_request' });
  try {
    await pool.query('INSERT INTO parts (id, code, name, price, additional) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name), price=VALUES(price), additional=VALUES(additional)', [id, code, name, price, additional ?? '']);
    res.status(201).json({ id, code, name, price, additional: additional ?? '' });
  } catch (e) {
    console.error('POST /api/parts error', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.put('/api/parts/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { code, name, price, additional } = req.body || {};
  if (!id || !code || !name || !Number.isFinite(price)) return res.status(400).json({ error: 'bad_request' });
  try {
    const [result] = await pool.query('UPDATE parts SET code = ?, name = ?, price = ?, additional = ? WHERE id = ?', [code, name, price, additional ?? '', id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ id, code, name, price, additional: additional ?? '' });
  } catch (e) {
    console.error('PUT /api/parts/:id error', e);
    res.status(500).json({ error: 'db_error' });
  }
});

  app.post('/api/illustrations/:id/parts', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { partId, code, name, price } = req.body || {};
  if (!id || !partId || !code || !name || !Number.isFinite(price)) return res.status(400).json({ error: 'bad_request' });
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT jenis, iid FROM illustrations WHERE jenis = ?', [id]);
      if (rows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'not_found' });
      }
      await conn.query('INSERT INTO parts (id, code, name, price) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name)', [partId, code, name, price]);
      const iid = rows[0].iid;
      await conn.query('INSERT IGNORE INTO illustration_parts (illustration_iid, part_id) VALUES (?, ?)', [iid, partId]);
      await conn.commit();
      res.status(201).json({ id: partId, code, name, price });
    } catch (e) {
      await conn.rollback();
      console.error('POST /api/illustrations/:id/parts error', e);
      res.status(500).json({ error: 'db_error' });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('POST /api/illustrations/:id/parts error', e);
    res.status(500).json({ error: 'db_error' });
  }
  });

  app.post('/api/illustrations/iid/:iid/parts', requireAuth, async (req, res) => {
    const iid = Number(req.params.iid);
    const { partId, code, name, price } = req.body || {};
    if (!Number.isFinite(iid) || !partId || !code || !name || !Number.isFinite(price)) return res.status(400).json({ error: 'bad_request' });
    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT iid FROM illustrations WHERE iid = ?', [iid]);
        if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'not_found' }); }
        await conn.query('INSERT INTO parts (id, code, name, price) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name)', [partId, code, name, price]);
        await conn.query('INSERT IGNORE INTO illustration_parts (illustration_iid, part_id) VALUES (?, ?)', [iid, partId]);
        await conn.commit();
        res.status(201).json({ id: partId, code, name, price });
      } catch (e) {
        await conn.rollback();
        console.error('POST /api/illustrations/iid/:iid/parts error', e);
        res.status(500).json({ error: 'db_error' });
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error('POST /api/illustrations/iid/:iid/parts error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.delete('/api/illustrations/iid/:iid/parts/:pid', requireAuth, async (req, res) => {
    const iid = Number(req.params.iid);
    const pid = req.params.pid;
    if (!Number.isFinite(iid)) return res.status(400).json({ error: 'bad_request' });
    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT jenis FROM illustrations WHERE iid = ?', [iid]);
        if (rows.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'not_found' }); }
        const id = rows[0].jenis;
        await conn.query('DELETE hp FROM hotspot_parts hp JOIN hotspots h ON h.id = hp.hotspot_id WHERE (h.illustration_iid = ? OR h.illustration_id = ?) AND hp.part_id = ?', [iid, id, pid]);
        await conn.query('DELETE h FROM hotspots h LEFT JOIN hotspot_parts hp ON hp.hotspot_id = h.id WHERE (h.illustration_iid = ? OR h.illustration_id = ?) AND hp.hotspot_id IS NULL', [iid, id]);
        const [result] = await conn.query('DELETE FROM illustration_parts WHERE (illustration_iid = ? OR illustration_id = ?) AND part_id = ?', [iid, id, pid]);
        await conn.commit();
        if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
        res.json({ ok: true });
      } catch (e) {
        await conn.rollback();
        console.error('DELETE /api/illustrations/iid/:iid/parts/:pid error', e);
        res.status(500).json({ error: 'db_error' });
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error('DELETE /api/illustrations/iid/:iid/parts/:pid error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

app.delete('/api/illustrations/:id/parts/:pid', requireAuth, async (req, res) => {
  const id = req.params.id;
  const pid = req.params.pid;
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT jenis, iid FROM illustrations WHERE jenis = ?', [id]);
      if (rows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'not_found' });
      }
      const iid = rows[0].iid;
      await conn.query('DELETE hp FROM hotspot_parts hp JOIN hotspots h ON h.id = hp.hotspot_id WHERE (h.illustration_iid = ? OR h.illustration_id = ?) AND hp.part_id = ?', [iid, id, pid]);
      await conn.query('DELETE h FROM hotspots h LEFT JOIN hotspot_parts hp ON hp.hotspot_id = h.id WHERE (h.illustration_iid = ? OR h.illustration_id = ?) AND hp.hotspot_id IS NULL', [iid, id]);
      const [result] = await conn.query('DELETE FROM illustration_parts WHERE (illustration_iid = ? OR illustration_id = ?) AND part_id = ?', [iid, id, pid]);
      await conn.commit();
      if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      console.error('DELETE /api/illustrations/:id/parts/:pid error', e);
      res.status(500).json({ error: 'db_error' });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('DELETE /api/illustrations/:id/parts/:pid error', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/parts/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const [result] = await pool.query('DELETE FROM parts WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/parts/:id error', e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    let query = 'SELECT id, username, role, posisi, created_at FROM users';
    const params = [];
    if (req.user?.role !== 'superadmin') {
      query += ' WHERE role != ?';
      params.push('partshop');
    }
    query += ' ORDER BY id';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/users error', e);
    res.status(500).json({ error: 'db_error' });
  }
});

  app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    const { username, password, role, posisi } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'bad_request' });
    try {
      if (req.user?.role === 'admin' && role && role !== 'user') return res.status(403).json({ error: 'forbidden' });
      if (req.user?.role !== 'superadmin' && (role === 'superadmin' || role === 'partshop')) return res.status(403).json({ error: 'forbidden' });
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
      if (existing.length > 0) return res.status(409).json({ error: 'conflict' });
      const hash = await bcrypt.hash(password, 10);
      const targetRole = (req.user?.role === 'admin') ? 'user' : (role || 'user');
      const r = await pool.query('INSERT INTO users (username, password_hash, role, posisi) VALUES (?, ?, ?, ?)', [username, hash, targetRole, posisi || null]);
      const insertId = r[0].insertId;
      res.status(201).json({ id: insertId, username, role: targetRole, posisi: posisi || null });
    } catch (e) {
      console.error('POST /api/users error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
    const { username, role, password, posisi } = req.body || {};
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_request' });
    if (!username && !role && !password && posisi === undefined) return res.status(400).json({ error: 'bad_request' });
    try {
      const [rows] = await pool.query('SELECT id, role FROM users WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
      const targetRole = rows[0].role;
      if (req.user?.role === 'admin') {
        if (targetRole !== 'user') return res.status(403).json({ error: 'forbidden' });
        if (role && role !== 'user') return res.status(403).json({ error: 'forbidden' });
      } else if (req.user?.role !== 'superadmin') {
        if (targetRole === 'superadmin' || targetRole === 'partshop') return res.status(403).json({ error: 'forbidden' });
        if (role === 'superadmin' || role === 'partshop') return res.status(403).json({ error: 'forbidden' });
      }
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        const [result] = await pool.query('UPDATE users SET username = COALESCE(?, username), role = COALESCE(?, role), posisi = COALESCE(?, posisi), password_hash = ?, logout_all_at = NOW(), last_activity_at = NULL, password_rev = password_rev + 1 WHERE id = ?', [username ?? null, role ?? null, posisi ?? null, hash, id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
      } else {
        const [result] = await pool.query('UPDATE users SET username = COALESCE(?, username), role = COALESCE(?, role), posisi = COALESCE(?, posisi) WHERE id = ?', [username ?? null, role ?? null, posisi ?? null, id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
      }
      const [u2] = await pool.query('SELECT id, username, role, posisi FROM users WHERE id = ?', [id]);
      res.json(u2[0]);
    } catch (e) {
      console.error('PUT /api/users/:id error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_request' });
    try {
      if (req.user?.id === id) return res.status(400).json({ error: 'cannot_delete_self' });
      const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
      const targetRole = rows[0].role;
      if (req.user?.role === 'admin' && targetRole !== 'user') return res.status(403).json({ error: 'forbidden' });
      if (req.user?.role !== 'superadmin' && (targetRole === 'superadmin' || targetRole === 'partshop')) return res.status(403).json({ error: 'forbidden' });
      const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /api/users/:id error', e);
      res.status(500).json({ error: 'db_error' });
    }
  });

start();
