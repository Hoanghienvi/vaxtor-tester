const net = require('net');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_FILE = path.join(__dirname, 'vaxtor_events.sqlite');
let db;

// Kết nối DB
function connectDB() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) return reject(err);
      console.log('✅ Connected to DB:', DB_FILE);
      resolve();
    });
  });
}

// Tạo bảng nếu chưa có
function initTable() {
  const sql = `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT,
    date TEXT,
    country TEXT,
    confidence REAL,
    processingtime REAL,
    direction INTEGER,
    cameraid TEXT,
    plateimagefile TEXT,
    envimagefile TEXT,
    created_at TEXT
  )`;
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) return reject(err);
      console.log('✅ Table ready');
      resolve();
    });
  });
}

// Insert event
function insertEvent(event) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const values = {
      plate: event.plate || '',
      date: event.date || createdAt,
      country: event.country || '',
      confidence: event.confidence || 0,
      processingtime: event.processingtime || 0,
      direction: event.direction || 0,
      cameraid: event.cameraid || '',
      plateimagefile: event.plateimagefile || '',
      envimagefile: event.envimagefile || '',
      created_at: createdAt
    };

    const sql = `
      INSERT INTO events (${Object.keys(values).join(',')})
      VALUES (${Object.keys(values).map(() => '?').join(',')})
    `;

    console.log('💾 SQL:', sql.trim());
    console.log('💾 Values:', values);

    db.run(sql, Object.values(values), function (err) {
      if (err) {
        console.error('❌ Insert failed:', err.message);
        console.error('👉 Values:', values);
        return reject(err);
      }
      console.log(`✅ Inserted row ID ${this.lastID}, Plate: ${values.plate}`);

      db.get('SELECT COUNT(*) as count FROM events', (e, row) => {
        if (!e) console.log('📊 Total rows in DB:', row.count);
      });

      resolve(this.lastID);
    });
  });
}

// Start server
async function start() {
  await connectDB();
  await initTable();

  const server = net.createServer((socket) => {
    console.log(`🔌 Client connected: ${socket.remoteAddress}:${socket.remotePort}`);
    let buffer = '';

    socket.on('data', async (chunk) => {
      console.log('📥 RAW (ascii):', chunk.toString());
      console.log('📥 RAW (hex):', chunk.toString('hex'));

      buffer += chunk.toString();
      const parts = buffer.split('\n');
      buffer = parts.pop();

      for (let line of parts) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          console.log('✅ Parsed JSON:', event);
          await insertEvent(event);
        } catch (err) {
          console.error('❌ JSON parse error:', err.message, 'Line:', line);
        }
      }
    });

    socket.on('close', () => {
      console.log(`🔌 Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
    });
  });

  server.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Collector listening on 0.0.0.0:3000');
  });
}

start().catch(e => console.error('❌ Startup error:', e));
