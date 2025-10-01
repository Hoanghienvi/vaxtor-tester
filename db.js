const sqlite3 = require('sqlite3').verbose();
const { DB_FILE } = require('./config');

let db;

const REQUIRED_COLUMNS = [
  { name: 'id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
  { name: 'plate', type: 'TEXT' },
  { name: 'date', type: 'TEXT' },
  { name: 'country', type: 'TEXT' },
  { name: 'confidence', type: 'REAL' },
  { name: 'processingtime', type: 'REAL' },
  { name: 'direction', type: 'INTEGER' },
  { name: 'cameraid', type: 'TEXT' },
  { name: 'plateimagefile', type: 'TEXT' },
  { name: 'envimagefile', type: 'TEXT' },
  { name: 'created_at', type: 'TEXT' }
];

function connect() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) return reject(err);
      console.log('✅ Connected to DB:', DB_FILE);
      resolve();
    });
  });
}

function init() {
  return new Promise((resolve, reject) => {
    const cols = REQUIRED_COLUMNS.map(c => `${c.name} ${c.type}`).join(', ');
    const sql = `CREATE TABLE IF NOT EXISTS events (${cols})`;
    db.run(sql, (err) => {
      if (err) return reject(err);
      console.log('✅ Table ready');
      resolve();
    });
  });
}

function insert(event) {
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

    console.log("💾 SQL:", sql);
    console.log("💾 Values:", values);

    db.run(sql, Object.values(values), function (err) {
      if (err) {
        console.error('❌ Insert failed:', err.message);
        console.error('👉 SQL:', sql);
        console.error('👉 Values:', values);
        return reject(err);
      }
      console.log(`✅ Inserted row ID ${this.lastID}, Plate: ${values.plate}`);

      db.get("SELECT COUNT(*) as count FROM events", (e, row) => {
        if (!e) console.log("📊 Total rows in DB:", row.count);
      });

      resolve(this.lastID);
    });
  });
}

module.exports = { connect, init, insert };
