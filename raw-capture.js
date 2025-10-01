// raw-capture.js
// Tool thu thập dữ liệu thô từ Vaxtor để kiểm tra biển số xe

const net = require('net');
const fs = require('fs');
const path = require('path');

// Cấu hình
const PORT = 3000; // Port Vaxtor đang gửi tới
const LOG_FILE = path.join(__dirname, 'raw.log');

console.log(`🚀 Raw Capture Server listening on 0.0.0.0:${PORT}`);
console.log(`📝 Logging to: ${LOG_FILE}`);

// Tạo server TCP
const server = net.createServer(socket => {
  console.log(`🔌 Client connected: ${socket.remoteAddress}:${socket.remotePort}`);

  socket.on('data', data => {
    const ascii = data.toString('utf8').trim();
    const hex = data.toString('hex');

    console.log("📥 RAW (ascii):", ascii);
    console.log("📥 RAW (hex):", hex);

    // Ghi vào file raw.log (dễ check lại sau)
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}]\n${ascii}\n\n`);
  });

  socket.on('error', err => {
    console.error("❌ Socket error:", err.message);
  });

  socket.on('close', () => {
    console.log(`🔌 Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`✅ Ready to capture incoming Vaxtor data...`);
});
