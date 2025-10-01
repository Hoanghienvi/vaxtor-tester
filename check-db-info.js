// check-db-info.js
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, 'vaxtor_events.sqlite');

console.log('CWD:', process.cwd());
console.log('__dirname:', __dirname);
console.log('DB path:', DB);

try {
  const s = fs.statSync(DB);
  console.log('DB exists. Size:', s.size, 'bytes. mtime:', s.mtime);
} catch (e) {
  console.log('DB does not exist yet:', e.message);
}

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(DB, (err) => {
  if (err) return console.error('Open DB error:', err.message);
  db.get("SELECT COUNT(*) as cnt FROM sqlite_master", (e,r) => {
    if (e) console.error('Query error:', e.message);
    else console.log('sqlite_master rows:', r.cnt);
    db.get("SELECT name FROM sqlite_master WHERE type='table'", (er, row) => {
      if (er) console.error(er.message);
      else console.log('First table:', row);
      db.close();
    });
  });
});
