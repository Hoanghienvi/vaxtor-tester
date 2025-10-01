// web-v5.js
// Full server + frontend single-file for Vax ALPR Web UI
// Dependencies: express sqlite3 exceljs dayjs
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');
const fs = require('fs');

const app = express();
const PORT = 3002;
const DB_FILE = path.join(__dirname, 'vaxtor_events.sqlite');
// folder where Vaxtor saves images (adjust if your system uses different)
const IMAGE_ROOT = path.join(__dirname, 'output'); // serve /output/<file>
if (!fs.existsSync(IMAGE_ROOT)) {
  try { fs.mkdirSync(IMAGE_ROOT, { recursive: true }); } catch(e){/*ignore*/ }
}

// helper to open db
function openDb() {
  return new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
}

// helper to run db.all with Promise
function dbAll(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params || [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// detect available columns (returns Set)
async function getColumnsSet() {
  const db = openDb();
  try {
    const rows = await dbAll(db, "PRAGMA table_info(events);");
    const cols = new Set(rows.map(r => r.name));
    db.close();
    return cols;
  } catch (e) {
    db.close();
    return new Set();
  }
}

// static serve images folder
app.use('/output', express.static(IMAGE_ROOT));
app.use(express.json());

// -------------------- API: events (dashboard) --------------------
app.get('/api/events', async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const search = (req.query.search || '').trim();

  const columns = await getColumnsSet();
  // choose image column if exists (fallback order)
  let plateImageCol = null;
  for (const c of ['plateimagefile','plate_image','imagefile','plate_imagefile','envimagefile']) {
    if (columns.has(c)) { plateImageCol = c; break; }
  }

  // ensure selected columns exist, else set to placeholder
  const selCols = [];
  const want = ['id','plate','country','cameraid','date','confidence','processingtime'];
  for (const w of want) {
    if (columns.has(w)) selCols.push(w);
    else selCols.push(`NULL as ${w}`);
  }
  if (plateImageCol) selCols.push(`${plateImageCol} as plateimagefile`);
  else selCols.push(`NULL as plateimagefile`);

  let sql = `SELECT ${selCols.join(', ')} FROM events WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ` AND plate LIKE ?`;
    params.push(`%${search}%`);
  }
  sql += ` ORDER BY id DESC LIMIT ?`;
  params.push(limit);

  console.log('[SQL]', sql, params);
  const db = openDb();
  db.all(sql, params, (err, rows) => {
    db.close();
    if (err) {
      console.error('DB error /api/events:', err.message);
      return res.status(500).json({ error: err.message });
    }
    // map image path to accessible URL if it appears to be filename or fullpath
    const mapped = rows.map(r => {
      let imgUrl = null;
      if (r.plateimagefile) {
        const fname = path.basename(String(r.plateimagefile));
        // if file exists in IMAGE_ROOT use /output/.. else still provide basename
        const full = path.join(IMAGE_ROOT, fname);
        if (fs.existsSync(full)) imgUrl = '/output/' + encodeURIComponent(fname);
        else imgUrl = '/output/' + encodeURIComponent(fname); // still provide guess
      }
      return { ...r, imageUrl: imgUrl };
    });
    res.json(mapped);
  });
});

// -------------------- API: report (summary) --------------------
app.get('/api/report', async (req, res) => {
  // accept from/to as YYYY-MM-DD; default last 7 days
  let { from, to } = req.query;
  if (!from || !to) {
    to = dayjs().format('YYYY-MM-DD');
    from = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  }

  // inclusive start at 00:00:00Z, exclusive end as next day 00:00:00Z
  const startISO = dayjs(from).utc ? dayjs(from).format('YYYY-MM-DD') + 'T00:00:00.000Z' : from + 'T00:00:00.000Z';
  // compute next day
  const nextDay = dayjs(to).add(1, 'day');
  const endISO = nextDay.format('YYYY-MM-DD') + 'T00:00:00.000Z';

  // Use comparison on ISO strings (works for ISO with Z)
  const sql = `
    SELECT substr(date,1,10) AS day,
           COUNT(*) AS total,
           COUNT(DISTINCT plate) AS unique_count
    FROM events
    WHERE date >= ? AND date < ?
    GROUP BY day
    ORDER BY day ASC
  `;
  console.log('[SQL report]', sql, [startISO, endISO]);
  const db = openDb();
  db.all(sql, [startISO, endISO], (err, rows) => {
    db.close();
    if (err) {
      console.error('DB error /api/report', err.message);
      return res.status(500).json({ error: err.message });
    }
    // build full range (days with 0)
    const startDay = dayjs(from);
    const endDay = dayjs(to);
    const out = [];
    let cursor = startDay;
    while (cursor.isBefore(endDay) || cursor.isSame(endDay)) {
      const d = cursor.format('YYYY-MM-DD');
      const found = rows.find(r => r.day === d);
      out.push({ date: d, total: found ? found.total : 0, unique: found ? found.unique_count : 0 });
      cursor = cursor.add(1, 'day');
    }
    res.json(out);
  });
});

// -------------------- API: export summary excel --------------------
app.get('/api/export', async (req, res) => {
  let { from, to } = req.query;
  if (!from || !to) {
    to = dayjs().format('YYYY-MM-DD');
    from = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  }
  const startISO = dayjs(from).format('YYYY-MM-DD') + 'T00:00:00.000Z';
  const endISO = dayjs(to).add(1,'day').format('YYYY-MM-DD') + 'T00:00:00.000Z';

  const sql = `
    SELECT substr(date,1,10) as day,
           COUNT(*) as total,
           COUNT(DISTINCT plate) as unique_count
    FROM events
    WHERE date >= ? AND date < ?
    GROUP BY day
    ORDER BY day ASC
  `;
  console.log('[SQL export summary]', sql, [startISO, endISO]);
  const db = openDb();
  db.all(sql, [startISO, endISO], async (err, rows) => {
    db.close();
    if (err) {
      console.error('DB error /api/export', err.message);
      return res.status(500).json({ error: err.message });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report Summary');
    sheet.columns = [
      { header: 'Date', key: 'day', width: 15 },
      { header: 'Total', key: 'total', width: 12 },
      { header: 'Unique', key: 'unique', width: 12 },
    ];
    // fill with full range days (ensure zeros included)
    let cursor = dayjs(from);
    const endDay = dayjs(to);
    while (cursor.isBefore(endDay) || cursor.isSame(endDay)) {
      const d = cursor.format('YYYY-MM-DD');
      const found = rows.find(r => r.day === d);
      sheet.addRow({ day: d, total: found ? found.total : 0, unique: found ? found.unique_count : 0 });
      cursor = cursor.add(1, 'day');
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=report_${from}_${to}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  });
});

// -------------------- API: export raw data --------------------
app.get('/api/export-raw', async (req, res) => {
  let { from, to } = req.query;
  if (!from || !to) {
    to = dayjs().format('YYYY-MM-DD');
    from = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  }
  const startISO = dayjs(from).format('YYYY-MM-DD') + 'T00:00:00.000Z';
  const endISO = dayjs(to).add(1,'day').format('YYYY-MM-DD') + 'T00:00:00.000Z';

  const columns = await getColumnsSet();
  // select common set (use NULL for missing)
  const sel = [];
  const want = ['id','plate','country','cameraid','date','confidence','processingtime'];
  for (const w of want) {
    if (columns.has(w)) sel.push(w); else sel.push(`NULL as ${w}`);
  }
  // image column
  let plateImageCol = null;
  for (const c of ['plateimagefile','plate_image','imagefile','plate_imagefile','envimagefile']) {
    if (columns.has(c)) { plateImageCol = c; break; }
  }
  if (plateImageCol) sel.push(`${plateImageCol} as plateimagefile`);
  else sel.push(`NULL as plateimagefile`);

  const sql = `SELECT ${sel.join(', ')} FROM events WHERE date >= ? AND date < ? ORDER BY date ASC`;
  console.log('[SQL export raw]', sql, [startISO, endISO]);
  const db = openDb();
  db.all(sql, [startISO, endISO], async (err, rows) => {
    db.close();
    if (err) {
      console.error('DB error /api/export-raw', err.message);
      return res.status(500).json({ error: err.message });
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Raw Data');
    const colsHeader = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Plate', key: 'plate', width: 16 },
      { header: 'Country', key: 'country', width: 8 },
      { header: 'CameraID', key: 'cameraid', width: 12 },
      { header: 'Date', key: 'date', width: 22 },
      { header: 'Confidence', key: 'confidence', width: 10 },
      { header: 'ProcTime', key: 'processingtime', width: 12 },
      { header: 'PlateImage', key: 'plateimagefile', width: 30 },
    ];
    sheet.columns = colsHeader;
    rows.forEach(r => sheet.addRow(r));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=raw_${from}_${to}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  });
});

// -------------------- Frontend page --------------------
app.get('/', (req, res) => {
  // inline HTML, keep simple and self-contained
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vax ALPR Web UI</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style> body { padding: 18px; } img.thumb { height: 60px; }</style>
</head>
<body>
  <h3>🚗 Vax ALPR Web UI</h3>
  <ul class="nav nav-tabs">
    <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#dashboard">Dashboard</a></li>
    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#report">Report</a></li>
  </ul>

  <div class="tab-content mt-3">
    <div id="dashboard" class="tab-pane fade show active">
      <div class="d-flex mb-2">
        <input id="search" class="form-control w-25 me-2" placeholder="Filter plate...">
        <button id="toggleRefresh" class="btn btn-sm btn-primary me-2">⏸ Pause Auto Refresh</button>
        <select id="rowLimit" class="form-select w-auto me-2">
          <option value="10">10 rows</option>
          <option value="50" selected>50 rows</option>
          <option value="100">100 rows</option>
          <option value="200">200 rows</option>
        </select>
        <div class="ms-auto">Auto refresh every 5s</div>
      </div>
      <table class="table table-sm table-striped">
        <thead><tr><th>Plate</th><th>Country</th><th>Date</th><th>CameraID</th><th>Img</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>

    <div id="report" class="tab-pane fade">
      <div class="row mb-3">
        <div class="col-md-3"><label>Từ ngày</label><input id="from" type="date" class="form-control"></div>
        <div class="col-md-3"><label>Đến ngày</label><input id="to" type="date" class="form-control"></div>
        <div class="col-md-4 d-flex align-items-end">
          <button id="apply" class="btn btn-primary me-2">Apply</button>
          <a id="export" class="btn btn-success me-2" href="#">Export Excel</a>
          <a id="exportRaw" class="btn btn-warning" href="#">Export Raw</a>
        </div>
      </div>

      <table class="table table-bordered">
        <thead><tr><th>Ngày</th><th>Tổng lượt xe</th><th>Số xe thực tế</th></tr></thead>
        <tbody id="reportTable"></tbody>
      </table>
	<div style="width:250%;height:200px; display:flex; justify-content:center; margin-top:30px;">
  	<div style="width:80%; height:450px;">
    	<canvas id="reportChart"></canvas>
  	</div>
	</div>
    </div>
  </div>

  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>

  <script>
    let refreshInterval = null;
    let chart = null;

    function loadDashboard() {
      const limit = $('#rowLimit').val();
      const search = $('#search').val().trim();
      fetch('/api/events?limit=' + limit + '&search=' + encodeURIComponent(search))
        .then(r => r.json())
        .then(data => {
          const tbody = $('#rows');
          // update in place to avoid flicker
          let html = '';
          data.forEach(e => {
            const img = e.imageUrl ? '<a href="'+e.imageUrl+'" target="_blank"><img src="'+e.imageUrl+'" class="thumb"></a>' : '';
            html += '<tr><td>'+ (e.plate||'') +'</td><td>'+ (e.country||'') +'</td><td>'+ (e.date||'') +'</td><td>'+ (e.cameraid||'') +'</td><td>'+ img +'</td></tr>';
          });
          tbody.html(html);
        }).catch(err => {
          console.error('Dashboard fetch error', err);
        });
    }

    $('#toggleRefresh').on('click', function(){
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        $(this).text('▶ Resume Auto Refresh');
      } else {
        loadDashboard();
        refreshInterval = setInterval(loadDashboard, 5000);
        $(this).text('⏸ Pause Auto Refresh');
      }
    });

    $('#rowLimit').on('change', loadDashboard);
    $('#search').on('input', loadDashboard);

    // start automatic refresh
    loadDashboard();
    refreshInterval = setInterval(loadDashboard, 5000);

    // REPORT
    function loadReport() {
      const from = $('#from').val();
      const to = $('#to').val();
      fetch('/api/report?from=' + from + '&to=' + to)
        .then(r => r.json())
        .then(data => {
          let html = '';
          const labels = [], totalArr = [], uniqueArr = [];
          data.forEach(row => {
            html += '<tr><td>' + row.date + '</td><td>' + row.total + '</td><td>' + row.unique + '</td></tr>';
            labels.push(row.date);
            totalArr.push(row.total);
            uniqueArr.push(row.unique);
          });
          $('#reportTable').html(html);

          // chart
          if (chart) {
  chart.data.labels = labels;
  chart.data.datasets[0].data = totalArr;
  chart.data.datasets[1].data = uniqueArr;
  chart.update();
} else {
  const ctx = document.getElementById('reportChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Tổng lượt xe', data: totalArr, borderColor: 'blue', tension: 0.2 },
        { label: 'Số xe thực tế', data: uniqueArr, borderColor: 'green', tension: 0.2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,   // giữ tỉ lệ
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}


          // update export links
          $('#export').attr('href', '/api/export?from='+from+'&to='+to);
          $('#exportRaw').attr('href', '/api/export-raw?from='+from+'&to='+to);
        }).catch(err => {
          console.error('Report fetch error', err);
        });
    }

    $('#apply').on('click', loadReport);

    // default dates: last 7 days
    const today = new Date().toISOString().slice(0,10);
    $('#to').val(today);
    $('#from').val(new Date(Date.now() - 6*864e5).toISOString().slice(0,10));
    loadReport();
  </script>
</body>
</html>`);
});

// start
app.listen(PORT, () => {
  console.log(`🌐 Vax ALPR Web UI running at http://localhost:${PORT}`);
});
