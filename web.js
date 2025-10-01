// web.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3002;
const DB_FILE = path.join(__dirname, 'vaxtor_events.sqlite');
const OUTPUT_DIR = path.join(__dirname, 'output');

app.use('/output', express.static(OUTPUT_DIR)); // serve ảnh thực tế
app.use(express.json());

// helper: convert ISO date -> ddMMyyyy
function getFolderFromDate(dateStr) {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return dd + mm + yyyy;
}

// API
app.get('/api/events', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const db = new sqlite3.Database(DB_FILE);

  const sql = `SELECT id, plate, date, country, confidence, processingtime, cameraid
               FROM events
               ORDER BY id DESC
               LIMIT ?`;

  console.log(`📡 API query: ${sql} (limit=${limit})`);

  db.all(sql, [limit], (err, rows) => {
    if (err) {
      console.error('❌ DB error:', err.message);
      return res.status(500).json({ error: err.message });
    }

    const mapped = rows.map(r => {
      const folder = getFolderFromDate(r.date);
      const cam = r.cameraid || '00001'; // fallback nếu DB trống
      const baseName = `${cam}_${r.plate}`;

      // Tìm ảnh trong folder images
      const dir = path.join(OUTPUT_DIR, folder, 'images');
      let foundFile = null;
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        foundFile = files.find(f => f.startsWith(baseName));
      }

      return {
        ...r,
        imageUrl: foundFile ? `/output/${folder}/images/${foundFile}` : null
      };
    });

    res.json(mapped);
    db.close();
  });
});

// Web UI
app.get('/', (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vax ALPR - Events</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="p-3">
  <h3>Vax ALPR - Events</h3>
  <div class="mb-2">
    <input id="filter" class="form-control w-25" placeholder="Filter plate...">
  </div>
  <table class="table table-sm table-striped">
    <thead>
      <tr>
        <th>ID</th>
        <th>Plate</th>
        <th>Country</th>
        <th>Conf</th>
        <th>Date</th>
        <th>CameraID</th>
        <th>ProcTime (ms)</th>
        <th>Image</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>

  <script>
    async function load(){
      const r = await fetch('/api/events?limit=200');
      const data = await r.json();
      const tbody = document.getElementById('rows');
      tbody.innerHTML = '';
      data.forEach(e=>{
        const img = e.imageUrl ? '<a href="'+e.imageUrl+'" target="_blank"><img src="'+e.imageUrl+'" style="height:60px"></a>' : '';
        const tr = '<tr>'+
          '<td>'+e.id+'</td>'+
          '<td>'+e.plate+'</td>'+
          '<td>'+e.country+'</td>'+
          '<td>'+e.confidence+'</td>'+
          '<td>'+e.date+'</td>'+
          '<td>'+ (e.cameraid || '') +'</td>'+
          '<td>'+ (e.processingtime || '') +'</td>'+
          '<td>'+img+'</td>'+
          '</tr>';
        tbody.insertAdjacentHTML('beforeend', tr);
      });
    }
    load();
    document.getElementById('filter').addEventListener('input', (ev)=>{
      const f = ev.target.value.toLowerCase();
      document.querySelectorAll('table tbody tr').forEach(tr=>{
        const plate = tr.children[1].innerText.toLowerCase();
        tr.style.display = plate.includes(f)?'':'none';
      });
    });
    setInterval(load, 5000);
  </script>
</body>
</html>`);
});

app.listen(PORT, ()=> console.log('🌐 Web UI running at http://localhost:'+PORT));
