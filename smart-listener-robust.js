// smart-listener-robust.js (fixed)
const net = require('net');
const fs = require('fs');
const path = require('path');

const QUEUE_PATH = path.join(__dirname, 'queue.json');
const RECEIVED_DIR = path.join(__dirname, 'received_raw');
if (!fs.existsSync(RECEIVED_DIR)) fs.mkdirSync(RECEIVED_DIR, { recursive: true });

function atomicWriteQueue(queue) {
  fs.writeFileSync(QUEUE_PATH + '.tmp', JSON.stringify(queue, null, 2));
  fs.renameSync(QUEUE_PATH + '.tmp', QUEUE_PATH);
}

function appendToQueue(obj) {
  try {
    let queue = [];
    if (fs.existsSync(QUEUE_PATH)) {
      const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
      queue = JSON.parse(raw || '[]');
      if (!Array.isArray(queue)) queue = [];
    }
    queue.push(obj);
    atomicWriteQueue(queue);
    console.log(`📝 Event saved (total ${queue.length})`);
  } catch (e) {
    console.error('❌ appendToQueue error:', e.message);
  }
}

// Extract JSON safely using brace depth
function extractJsons(s) {
  const objs = [];
  let depth = 0, start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (s[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        objs.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objs;
}

function saveRawLog(data) {
  const fname = path.join(RECEIVED_DIR, `${Date.now()}.log`);
  fs.writeFileSync(fname, data);
  return fname;
}

const server = net.createServer((socket) => {
  console.log(`🔌 Client connected: ${socket.remoteAddress}:${socket.remotePort}`);
  let buffer = '';

  socket.on('data', (chunk) => {
    const ascii = chunk.toString();
    console.log('📥 RAW (ascii):', ascii.slice(0, 200), ascii.length > 200 ? '...' : '');
    buffer += ascii;

    const found = extractJsons(buffer);
    if (found.length > 0) {
      found.forEach(f => {
        try {
          const obj = JSON.parse(f);
          console.log('✅ Parsed JSON plate:', obj.plate || '(no plate)');
          appendToQueue(obj);
        } catch (err) {
          console.error('❌ JSON parse failed:', err.message);
          const fname = saveRawLog(f);
          appendToQueue({ _raw: f, _error: err.message });
          console.warn('Saved bad JSON to', fname);
        }
      });
      buffer = ''; // reset sau khi xử lý
    }
  });

  socket.on('end', () => {
    if (buffer.trim()) {
      const fname = saveRawLog(buffer);
      console.warn('⚠️ Leftover buffer saved to', fname);
    }
    console.log(`🔌 Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
  });

  socket.on('error', (err) => {
    console.error('❌ Socket error:', err.message);
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Collector listening on 0.0.0.0:${PORT}`);
  console.log(`📂 queue: ${QUEUE_PATH}`);
  console.log(`📂 received raw dir: ${RECEIVED_DIR}`);
});
