// web-v4.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const ExcelJS = require("exceljs");
const dayjs = require("dayjs");

const app = express();
const PORT = 3002;
const DB_FILE = path.join(__dirname, "vaxtor_events.sqlite");
const IMAGE_DIR = path.join(__dirname, "output");

app.use("/output", express.static(IMAGE_DIR));
app.use(express.json());

/* ========== API EVENTS (Dashboard) ========== */
app.get("/api/events", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const db = new sqlite3.Database(DB_FILE);
  db.all(
    `SELECT id, plate, date, country, confidence, processingtime, cameraid, plateimagefile 
     FROM events ORDER BY id DESC LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const mapped = rows.map(r => ({
        ...r,
        imageUrl: r.plateimagefile
          ? "/output/" + encodeURIComponent(path.basename(r.plateimagefile))
          : null,
      }));
      res.json(mapped);
      db.close();
    }
  );
});

/* ========== API REPORT (by day) ========== */
app.get("/api/report", (req, res) => {
  let { from, to } = req.query;
  const db = new sqlite3.Database(DB_FILE);

  if (!from || !to) {
    to = dayjs().format("YYYY-MM-DD");
    from = dayjs().subtract(6, "day").format("YYYY-MM-DD");
  }

  const fromFull = from + " 00:00:00";
  const toFull = to + " 23:59:59";

  db.all(
    `SELECT plate, date FROM events WHERE date BETWEEN ? AND ? ORDER BY date ASC`,
    [fromFull, toFull],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const stats = {};
      rows.forEach(r => {
        const d = r.date.slice(0, 10);
        if (!stats[d]) stats[d] = { total: 0, unique: new Set() };
        stats[d].total++;
        stats[d].unique.add(r.plate);
      });

      const result = [];
      let cursor = dayjs(from);
      const end = dayjs(to);
      while (cursor.isBefore(end) || cursor.isSame(end)) {
        const d = cursor.format("YYYY-MM-DD");
        result.push({
          date: d,
          total: stats[d] ? stats[d].total : 0,
          unique: stats[d] ? stats[d].unique.size : 0,
        });
        cursor = cursor.add(1, "day");
      }

      res.json(result);
      db.close();
    }
  );
});

/* ========== API EXPORT (summary) ========== */
app.get("/api/export", async (req, res) => {
  let { from, to } = req.query;
  if (!from || !to) {
    to = dayjs().format("YYYY-MM-DD");
    from = dayjs().subtract(6, "day").format("YYYY-MM-DD");
  }

  const fromFull = from + " 00:00:00";
  const toFull = to + " 23:59:59";

  const db = new sqlite3.Database(DB_FILE);
  db.all(
    `SELECT plate, date FROM events WHERE date BETWEEN ? AND ? ORDER BY date ASC`,
    [fromFull, toFull],
    async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const stats = {};
      rows.forEach(r => {
        const d = r.date.slice(0, 10);
        if (!stats[d]) stats[d] = { total: 0, unique: new Set() };
        stats[d].total++;
        stats[d].unique.add(r.plate);
      });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Summary");

      sheet.columns = [
        { header: "Ngày", key: "date", width: 15 },
        { header: "Tổng lượt xe", key: "total", width: 15 },
        { header: "Số xe thực tế", key: "unique", width: 15 },
      ];

      Object.keys(stats).forEach(d => {
        sheet.addRow({
          date: d,
          total: stats[d].total,
          unique: stats[d].unique.size,
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=report_${from}_${to}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
      db.close();
    }
  );
});

/* ========== API EXPORT RAW (Dashboard style) ========== */
app.get("/api/export-raw", async (req, res) => {
  let { from, to } = req.query;
  if (!from || !to) {
    to = dayjs().format("YYYY-MM-DD");
    from = dayjs().subtract(6, "day").format("YYYY-MM-DD");
  }

  const fromFull = from + " 00:00:00";
  const toFull = to + " 23:59:59";

  const db = new sqlite3.Database(DB_FILE);
  db.all(
    `SELECT id, plate, date, country, confidence, processingtime, cameraid FROM events 
     WHERE date BETWEEN ? AND ? ORDER BY id DESC`,
    [fromFull, toFull],
    async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("RawData");

      sheet.columns = [
        { header: "ID", key: "id", width: 10 },
        { header: "Plate", key: "plate", width: 15 },
        { header: "Country", key: "country", width: 10 },
        { header: "Confidence", key: "confidence", width: 10 },
        { header: "ProcTime", key: "processingtime", width: 12 },
        { header: "CameraID", key: "cameraid", width: 12 },
        { header: "Date", key: "date", width: 20 },
      ];

      rows.forEach(r => sheet.addRow(r));

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=raw_${from}_${to}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
      db.close();
    }
  );
});

/* ========== FRONTEND UI ========== */
app.get("/", (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vax ALPR Web UI</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { padding: 20px; }
    .tab-content { margin-top: 20px; }
    img.thumb { height: 60px; }
  </style>
</head>
<body>
  <h3>🚗 Vax ALPR Web UI</h3>
  <ul class="nav nav-tabs">
    <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#dashboard">Dashboard</a></li>
    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#report">Report</a></li>
  </ul>

  <div class="tab-content">
    <!-- Dashboard -->
    <div class="tab-pane fade show active" id="dashboard">
      <div class="d-flex mb-2">
        <input id="filter" class="form-control w-25 me-2" placeholder="Filter plate...">
        <button id="toggleRefresh" class="btn btn-sm btn-primary me-2">⏸ Pause Auto Refresh</button>
        <select id="rowLimit" class="form-select w-auto">
          <option value="10">10 rows</option>
          <option value="50" selected>50 rows</option>
          <option value="100">100 rows</option>
          <option value="200">200 rows</option>
        </select>
      </div>
      <table class="table table-sm table-striped">
        <thead><tr><th>Plate</th><th>Country</th><th>Date</th><th>CameraID</th><th>Image</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>

    <!-- Report -->
    <div class="tab-pane fade" id="report">
      <div class="row mb-3">
        <div class="col-md-3"><label>Từ ngày:</label><input id="from" type="date" class="form-control"></div>
        <div class="col-md-3"><label>Đến ngày:</label><input id="to" type="date" class="form-control"></div>
        <div class="col-md-4 d-flex align-items-end">
          <button id="apply" class="btn btn-primary me-2">Apply</button>
          <a id="export" class="btn btn-success me-2">Export Excel</a>
          <a id="exportRaw" class="btn btn-warning">Export Raw</a>
        </div>
      </div>
      <table class="table table-bordered">
        <thead><tr><th>Ngày</th><th>Tổng lượt xe</th><th>Số xe thực tế</th></tr></thead>
        <tbody id="reportTable"></tbody>
      </table>
      <canvas id="reportChart" height="100"></canvas>
    </div>
  </div>

<script>
  let refreshInterval = null;
  let chart = null;

  // DASHBOARD
  function loadDashboard(){
    const limit = document.getElementById('rowLimit').value;
    fetch('/api/events?limit='+limit).then(r=>r.json()).then(data=>{
      const tbody = document.getElementById('rows');
      tbody.innerHTML = '';
      data.forEach(e=>{
        const img = e.imageUrl ? '<a href="'+e.imageUrl+'" target="_blank"><img src="'+e.imageUrl+'" class="thumb"></a>' : '';
        const tr = '<tr><td>'+e.plate+'</td><td>'+e.country+'</td><td>'+e.date+'</td><td>'+e.cameraid+'</td><td>'+img+'</td></tr>';
        tbody.insertAdjacentHTML('beforeend', tr);
      });
    });
  }
  loadDashboard();
  refreshInterval = setInterval(loadDashboard, 5000);

  document.getElementById('filter').addEventListener('input', (ev)=>{
    const f = ev.target.value.toLowerCase();
    document.querySelectorAll('#rows tr').forEach(tr=>{
      const plate = tr.children[0].innerText.toLowerCase();
      tr.style.display = plate.includes(f)?'':'none';
    });
  });

  document.getElementById('toggleRefresh').addEventListener('click', ()=>{
    if(refreshInterval){
      clearInterval(refreshInterval);
      refreshInterval = null;
      document.getElementById('toggleRefresh').innerText = '▶ Resume Auto Refresh';
    } else {
      loadDashboard();
      refreshInterval = setInterval(loadDashboard, 5000);
      document.getElementById('toggleRefresh').innerText = '⏸ Pause Auto Refresh';
    }
  });

  document.getElementById('rowLimit').addEventListener('change', loadDashboard);

  // REPORT
  function loadReport(){
    const from = document.getElementById('from').value;
    const to = document.getElementById('to').value;
    fetch('/api/report?from='+from+'&to='+to).then(r=>r.json()).then(data=>{
      let rows = '';
      const labels = [], totalArr = [], uniqueArr = [];
      data.forEach(r=>{
        rows += '<tr><td>'+r.date+'</td><td>'+r.total+'</td><td>'+r.unique+'</td></tr>';
        labels.push(r.date);
        totalArr.push(r.total);
        uniqueArr.push(r.unique);
      });
      document.getElementById('reportTable').innerHTML = rows;

      if(chart) chart.destroy();
      const ctx = document.getElementById('reportChart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: 'Tổng lượt xe', data: totalArr, borderColor: 'blue', fill: false },
            { label: 'Số xe thực tế', data: uniqueArr, borderColor: 'green', fill: false }
          ]
        }
      });

      document.getElementById('export').href = '/api/export?from='+from+'&to='+to;
      document.getElementById('exportRaw').href = '/api/export-raw?from='+from+'&to='+to;
    });
  }
  document.getElementById('apply').addEventListener('click', loadReport);

  // default range
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('to').value = today;
  document.getElementById('from').value = new Date(Date.now()-6*864e5).toISOString().slice(0,10);
  loadReport();
</script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`);
});

app.listen(PORT, () => console.log("🌐 Web UI running at http://localhost:" + PORT));
