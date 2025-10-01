const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const ExcelJS = require("exceljs");

const app = express();
const PORT = 3002;
const DB_FILE = path.join(__dirname, "vaxtor_events.sqlite");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ---------------- Dashboard ----------------
app.get("/", (req, res) => {
  res.render("dashboard");
});

// API: sự kiện mới nhất
app.get("/api/events", (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const db = new sqlite3.Database(DB_FILE);
  db.all(
    `SELECT id, plate, country, confidence, processingtime, cameraid, date, plateimagefile, envimagefile
     FROM events ORDER BY id DESC LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
      db.close();
    }
  );
});

// ---------------- Report ----------------
app.get("/report", (req, res) => {
  res.render("report");
});

// API: báo cáo thống kê theo ngày/tháng
app.get("/api/report", (req, res) => {
  const { from, to, mode } = req.query;
  const db = new sqlite3.Database(DB_FILE);

  // gom dữ liệu theo ngày
  let sql = `SELECT plate, cameraid, date FROM events WHERE date BETWEEN ? AND ?`;
  db.all(sql, [from, to], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // group by date
    const stats = {};
    rows.forEach(r => {
      const d = r.date.slice(0, 10); // yyyy-mm-dd
      if (!stats[d]) stats[d] = { total: 0, unique: new Set() };
      stats[d].total++;
      stats[d].unique.add(r.plate);
    });

    const result = Object.keys(stats).map(d => ({
      date: d,
      total: stats[d].total,
      unique: stats[d].unique.size
    }));

    res.json(result);
    db.close();
  });
});

// API: Export Excel
app.get("/api/export", async (req, res) => {
  const { from, to } = req.query;
  const db = new sqlite3.Database(DB_FILE);
  db.all(
    `SELECT plate, cameraid, date FROM events WHERE date BETWEEN ? AND ?`,
    [from, to],
    async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Report");

      sheet.columns = [
        { header: "Ngày", key: "date", width: 15 },
        { header: "Tổng lượt xe", key: "total", width: 15 },
        { header: "Số xe thực tế", key: "unique", width: 15 },
      ];

      // thống kê
      const stats = {};
      rows.forEach(r => {
        const d = r.date.slice(0, 10);
        if (!stats[d]) stats[d] = { total: 0, unique: new Set() };
        stats[d].total++;
        stats[d].unique.add(r.plate);
      });

      Object.keys(stats).forEach(d => {
        sheet.addRow({
          date: d,
          total: stats[d].total,
          unique: stats[d].unique.size,
        });
      });

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=report.xlsx"
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      await workbook.xlsx.write(res);
      res.end();
      db.close();
    }
  );
});

app.listen(PORT, () =>
  console.log(`🌐 Web UI running at http://localhost:${PORT}`)
);
