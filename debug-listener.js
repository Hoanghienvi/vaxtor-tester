// debug-listener.js
const net = require('net');
const fs = require('fs');
const path = require('path');

const OUTDIR = path.join(__dirname, 'received');
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

function hexdump(buf) {
  return buf.toString('hex').match(/.{1,2}/g).join(' ');
}

const server = net.createServer((socket) => {
  console.log('Client connected', socket.remoteAddress, socket.remotePort);
  let buffer = '';

  socket.on('data', (chunk) => {
    console.log('RAW ascii:', chunk.toString());
    console.log('RAW hex  :', hexdump(chunk));
    buffer += chunk.toString();

    // Try split by newline first
    let parts = buffer.split('\n');
    buffer = parts.pop();
    parts.forEach(line => {
      line = line.trim();
      if (!line) return;
      try {
        const obj = JSON.parse(line);
        console.log('Parsed (newline):', obj);
      } catch (e) {
        // save for manual inspection
        const fname = path.join(OUTDIR, `raw_${Date.now()}.txt`);
        fs.writeFileSync(fname, line);
        console.warn('JSON parse failed (newline). Saved to', fname);
      }
    });

    // Also try extracting JSON objects by braces (in case no newline)
    // simple brace matcher - find first '{' and matching closing '}'
    function extractObjects(s) {
      const objs = [];
      let idx = 0;
      while (true) {
        const start = s.indexOf('{', idx);
        if (start === -1) break;
        let depth = 0;
        let end = -1;
        for (let i = start; i < s.length; i++) {
          if (s[i] === '{') depth++;
          else if (s[i] === '}') {
            depth--;
            if (depth === 0) { end = i; break; }
          }
        }
        if (end === -1) break;
        const candidate = s.slice(start, end + 1);
        objs.push({ text: candidate, start, end });
        idx = end + 1;
      }
      return objs;
    }

    const found = extractObjects(buffer);
    if (found.length > 0) {
      for (const f of found) {
        try {
          const o = JSON.parse(f.text);
          console.log('Parsed (brace):', o);
        } catch (e) {
          const fname = path.join(OUTDIR, `brace_fail_${Date.now()}.txt`);
          fs.writeFileSync(fname, f.text);
          console.warn('Brace-parse failed, saved:', fname);
        }
      }
      // remove consumed portion from buffer (up to last end)
      const lastEnd = found[found.length - 1].end;
      buffer = buffer.slice(lastEnd + 1);
    }
  });

  socket.on('close', () => console.log('Client disconnected'));
});

server.listen(3000, '0.0.0.0', () => console.log('Debug listener on 3000'));
