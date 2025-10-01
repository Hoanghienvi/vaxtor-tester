const net = require('net');
const { PORT } = require('./config');
const { processEvent } = require('./processor');
const db = require('./db');

function startServer() {
  const server = net.createServer((socket) => {
    console.log(`🔌 Client connected: ${socket.remoteAddress}:${socket.remotePort}`);
    let buffer = '';

    socket.on('data', async (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split('\n');
      buffer = parts.pop();

      for (let line of parts) {
        if (!line.trim()) continue;
        const event = processEvent(line);
        if (event) {
          try {
            await db.insert(event);
          } catch (e) {
            console.error('❌ DB insert error:', e.message);
          }
        }
      }
    });

    socket.on('close', () => {
      console.log(`🔌 Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Collector listening on 0.0.0.0:${PORT}`);
  });
}

module.exports = { startServer };
