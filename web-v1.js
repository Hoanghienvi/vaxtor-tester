const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 4000;
const DB_FILE = path.join(__dirname, 'vaxtor_events.sqlite');
const IMAGE_DIR = path.join(__dirname, 'output'); // chỗ lưu ảnh từ Vaxtor

app.use('/output', express.static(IMAGE_DIR)); // phục vụ ảnh tĩnh
app.use(express.json());

// API: trả về danh sách events
app.get('/api/events', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const db = new sqlite3.Database(DB_FILE);

  db.all(
    `SELECT id, plate, country, confidence, processingtime, cameraid, date, plateimagefile, envimagefile
     FROM events ORDER BY id DESC LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      // map image path
      const mapped = rows.map(r => ({
        ...r,
        plateImageUrl: r.plateimagefile ? '/output/' + path.basename(r.plateimagefile) : null,
        envImageUrl: r.envimagefile ? '/output/' + path.basename(r.envimagefile) : null,
      }));

      res.json(mapped);
      db.close();
    }
  );
});

// Dashboard UI
app.get('/', (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vaxtor ALPR Dashboard</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.datatables.net/1.13.6/css/dataTables.bootstrap5.min.css" rel="stylesheet">
</head>
<body class="p-4">
  <h2 class="mb-4">📊 Vaxtor ALPR Dashboard</h2>

  <div class="mb-3 d-flex gap-2">
    <input id="filterPlate" class="form-control w-25" placeholder="Filter Plate...">
    <input id="filterCamera" class="form-control w-25" placeholder="Filter Camera ID...">
  </div>

  <table id="eventsTable" class="table table-striped table-bordered table-sm">
    <thead class="table-dark">
      <tr>
        <th>ID</th>
        <th>Plate</th>
        <th>CameraID</th>
        <th>Country</th>
        <th>Confidence</th>
        <th>Proc. Time</th>
        <th>Date</th>
        <th>Images</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <script src="https://code.jquery.com/jquery-3.7.0.min.js"></script>
  <script src="https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js"></script>
  <script src="https://cdn.datatables.net/1.13.6/js/dataTables.bootstrap5.min.js"></script>
  <script>
    let table;

    async function loadData() {
      const res = await fetch('/api/events?limit=500');
      const data = await res.json();

      if (!table) {
        table = $('#eventsTable').DataTable({
          data,
          columns: [
            { data: 'id' },
            { data: 'plate' },
            { data: 'cameraid' },
            { data: 'country' },
            { data: 'confidence' },
            { data: 'processingtime' },
            { data: 'date' },
            { data: null, render: row => {
              let imgs = '';
              if (row.plateImageUrl) imgs += '<a href="'+row.plateImageUrl+'" target="_blank"><img src="'+row.plateImageUrl+'" height="50"></a> ';
              if (row.envImageUrl) imgs += '<a href="'+row.envImageUrl+'" target="_blank"><img src="'+row.envImageUrl+'" height="50"></a>';
              return imgs || '-';
            }}
          ]
        });

        // filter plate
        $('#filterPlate').on('keyup', function() {
          table.column(1).search(this.value).draw();
        });

        // filter camera
        $('#filterCamera').on('keyup', function() {
          table.column(2).search(this.value).draw();
        });

      } else {
        table.clear();
        table.rows.add(data);
        table.draw();
      }
    }

    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`🌐 Web Dashboard running at http://localhost:${PORT}`));
