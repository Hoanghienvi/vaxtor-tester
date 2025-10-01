// listener-debug.js
const net = require('net');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'raw_debug');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function saveRaw(data) {
  const fname = path.join(LOG_DIR, `${Date.now()}.txt`);
  fs.writeFileSync(fname, data);
  console.log(`💾 Saved raw to ${fname}`);
}

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

const server = net.createServer((socket) => {
  console.log(`🔌 Client connected: ${socket.remoteAddress}:${socket.remotePort}`);
  let buffer = '';

  socket.on('data', (chunk) => {
    const ascii = chunk.toString();
    console.log('📥 RAW incoming (ascii):', ascii.trim());
    buffer += ascii;

    const found = extractJsons(buffer);
    if (found.length > 0) {
      found.forEach(f => {
        try {
          const obj = JSON.parse(f);
          console.log('✅ Parsed JSON:', JSON.stringify(obj, null, 2));
        } catch (err) {
          console.error('❌ JSON parse error:', err.message);
          saveRaw(f);
        }
      });
      buffer = '';
    }
  });

  socket.on('end', () => {
    if (buffer.trim()) saveRaw(buffer);
    console.log(`🔌 Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Debug listener running on 0.0.0.0:${PORT}`);
  console.log(`📂 Raw logs will be saved in: ${LOG_DIR}`);
});
