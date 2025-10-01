// processor.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = path.join(__dirname, 'vaxtor_events.sqlite');
const QUEUE_PATH = path.join(__dirname, 'queue.json');

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) return console.error('❌ DB open error:', err.message);
  console.log('✅ Connected to DB:', DB_FILE);
});

db.run(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT,
  confidence REAL,
  country TEXT,
  processingtime REAL,
  direction INTEGER,
  cameraid TEXT,
  plateimagefile TEXT,
  envimagefile TEXT,
  date TEXT
)`, (err) => {
  if (err) console.error('❌ Table create error:', err.message);
  else console.log('✅ Table ready');
});

function safeReadQueue() {
  try {
    if (!fs.existsSync(QUEUE_PATH)) return [];
    const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch (e) {
    console.error('❌ Failed read queue.json:', e.message);
    return [];
  }
}

function atomicClearQueue() {
  fs.writeFileSync(QUEUE_PATH + '.tmp', JSON.stringify([], null, 2));
  fs.renameSync(QUEUE_PATH + '.tmp', QUEUE_PATH);
}

function processOnce() {
  const queue = safeReadQueue();
  if (!queue.length) {
    // console.log('ℹ️ Queue empty');
    return;
  }
  console.log(`📦 Processing ${queue.length} events from queue.json`);

  for (let i = 0; i < queue.length; i++) {
    const evt = queue[i];
    // normalize fields
    const values = [
      evt.plate || '',
      evt.confidence || 0,
      evt.country || '',
      evt.processingtime || 0,
      evt.direction || 0,
      evt.cameraid || '',
      evt.plateimagefile || '',
      evt.envimagefile || '',
      evt.date || new Date().toISOString()
    ];

    const sql = `INSERT INTO events
      (plate, confidence, country, processingtime, direction, cameraid, plateimagefile, envimagefile, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    console.log('💾 Inserting:', values);

    db.run(sql, values, function(err) {
      if (err) {
        console.error('❌ DB insert error:', err.message, 'Values:', values);
      } else {
        console.log(`✅ Inserted row ID ${this.lastID}, Plate: ${values[0]}`);
      }
    });
  }

  // Clear queue after processing
  atomicClearQueue();
  console.log('🧹 Queue cleared');
}

console.log('🚀 Processor running, polling queue.json every 2s');
setInterval(processOnce, 2000);
