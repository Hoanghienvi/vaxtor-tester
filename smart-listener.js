const net = require('net');
const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'queue.json');

function pushToQueue(line) {
  try {
    let queue = [];
    if (fs.existsSync(QUEUE_FILE)) {
      queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    }
    queue.push({ raw: line, ts: new Date().toISOString() });
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
    console.log(`📝 Queued new event (${queue.length} total)`);
  } catch (e) {
    console.error('❌ Queue write error:', e.message);
  }
}

const server = net.createServer((socket) => {
  console.log(`🔌 Client connected: ${socket.remoteAddress}:${socket.remotePort}`);
  let buffer = '';

  socket.on('data', (chunk) => {
    const rawStr = chunk.toString();
    console.log('📥 RAW incoming:', rawStr.trim());
    buffer += rawStr;

    const parts = buffer.split('\n');
    buffer = parts.pop();

    for (let line of parts) {
      if (!line.trim()) continue;
      // sanitize → remove weird prefixes like "📥 RAW (ascii): "
      line = line.replace(/^.*?\{/, '{').replace(/}.*$/, '}');
      pushToQueue(line);
    }
  });

  socket.on('close', () => {
    console.log(`🔌 Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Collector running on 0.0.0.0:3000');
});
