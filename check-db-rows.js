// check-db-rows.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_FILE = path.join(__dirname, 'vaxtor_events.sqlite');

console.log('📂 DB Path:', DB_FILE);

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('❌ Cannot open database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Đếm tổng số rows
db.get("SELECT COUNT(*) as count FROM events", (err, row) => {
  if (err) {
    console.error('❌ Error reading count:', err.message);
  } else {
    console.log(`📊 Total rows in DB: ${row.count}`);
  }
});

// In 10 record mới nhất
db.all("SELECT * FROM events ORDER BY id DESC LIMIT 10", (err, rows) => {
  if (err) {
    console.error('❌ Error reading rows:', err.message);
  } else {
    console.log('📋 Last 10 rows:');
    rows.forEach(r => {
      console.log(`➡️ ID ${r.id} | Plate: ${r.plate} | Country: ${r.country} | Date: ${r.date}`);
    });
  }
  db.close();
});
