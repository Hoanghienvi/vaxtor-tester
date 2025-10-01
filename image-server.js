// image-server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 4000;
const APP_ROOT = __dirname;
const IMAGE_DIR = path.join(APP_ROOT, 'images'); // sửa nếu ảnh ở output_images
const DB_FILE = path.join(APP_ROOT, 'vaxtor_events.sqlite');

if (!fs.existsSync(IMAGE_DIR)) {
  console.warn('⚠️ IMAGE_DIR not found, creating:', IMAGE_DIR);
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

const app = express();

// DB
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) console.error('❌ Open DB error:', err.message);
  else console.log('✅ DB opened:', DB_FILE);
});

// Serve ảnh tĩnh (URL: /images/<filename>)
app.use('/images', express.static(IMAGE_DIR, {
  // index: false,
  // set headers for caching (optional)
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
  }
}));

// API: list latest events with image paths
// returns [{id, plate, date, plateimagefile, envimagefile, plateimage_url, envimage_url}, ...]
app.get('/api/events', (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const sql = `SELECT id, plate, date, plateimagefile, envimagefile, confidence, country
               FROM events ORDER BY id DESC LIMIT ?`;
  db.all(sql, [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const data = rows.map(r => {
      // map file paths into URLs if file exists; else empty string
      const plateFile = r.plateimagefile || '';
      const envFile = r.envimagefile || '';

      const plateUrl = plateFile && fs.existsSync(plateFile) ? '/images/' + path.basename(plateFile) : null;
      const envUrl   = envFile && fs.existsSync(envFile)   ? '/images/' + path.basename(envFile)   : null;

      return {
        id: r.id,
        plate: r.plate,
        date: r.date,
        confidence: r.confidence,
        country: r.country,
        plateimagefile: plateFile,
        envimagefile: envFile,
        plateimage_url: plateUrl,
        envimage_url: envUrl
      };
    });
    res.json(data);
  });
});

// API: single event
app.get('/api/event/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const sql = `SELECT * FROM events WHERE id = ?`;
  db.get(sql, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'not found' });

    const plateFile = row.plateimagefile || '';
    const envFile = row.envimagefile || '';
    row.plateimage_url = plateFile && fs.existsSync(plateFile) ? '/Images/' + path.basename(plateFile) : null;
    row.envimage_url = envFile && fs.existsSync(envFile) ? '/Images/' + path.basename(envFile) : null;
    res.json(row);
  });
});

// optional: list files physically in images folder
app.get('/api/images', (req, res) => {
  fs.readdir(IMAGE_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    // filter typical image extensions
    const imgs = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    res.json(imgs);
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Image server running on http://localhost:${PORT}`);
  console.log(`🔍 GET /api/events  /api/event/:id  /api/images`);
  console.log(`📸 Images served at http://localhost:${PORT}/Images/<filename>`);
});
