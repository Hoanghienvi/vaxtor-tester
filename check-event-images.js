// check-event-images.js
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "vaxtor_events.sqlite");
const BASE_OUTPUT = path.join(__dirname, "output");

// ✅ Lấy ID từ tham số command line
const eventId = process.argv[2];
if (!eventId) {
  console.error("❌ Usage: node check-event-images.js <eventId>");
  process.exit(1);
}

const db = new sqlite3.Database(DB_PATH);

db.get("SELECT * FROM events WHERE id = ?", [eventId], (err, row) => {
  if (err) {
    console.error("❌ DB error:", err.message);
    process.exit(1);
  }
  if (!row) {
    console.error(`❌ Event with ID ${eventId} not found`);
    process.exit(1);
  }

  console.log("📋 Event:", row);

  const dateFolder = formatDateFolder(row.date);
  const imgDir = path.join(BASE_OUTPUT, dateFolder, "images");

  // fallback nếu cameraid trống
  const camId =
    row.cameraid && row.cameraid.trim() !== "" ? row.cameraid : "00001";

  // Tìm tất cả file có chứa "cameraid_plate"
  const pattern = `${camId}_${row.plate}`;
  if (!fs.existsSync(imgDir)) {
    console.log(`❌ Images folder not found: ${imgDir}`);
    db.close();
    return;
  }

  const files = fs.readdirSync(imgDir).filter((f) => f.includes(pattern));
  if (files.length === 0) {
    console.log(`❌ No images found for pattern: ${pattern}`);
  } else {
    console.log(`✅ Found ${files.length} file(s):`);
    files.forEach((f) => {
      console.log("   →", path.join(imgDir, f));
    });
  }

  db.close();
});

function formatDateFolder(dateStr) {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}
