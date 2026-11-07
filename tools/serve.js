// Tiny static server for local preview and smoke tests.
// Usage: node tools/serve.js [port]   (serves the repository root)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.gs': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function start(root, port) {
  root = path.resolve(root || path.join(__dirname, '..'));
  const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch (e) {
      res.writeHead(400).end('Bad request');
      return;
    }
    let file = path.normalize(path.join(root, rel));
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, 'index.html');
      fs.readFile(file, (err2, data) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        res.end(data);
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(port || 0, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + server.address().port + '/';
      resolve({ url, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { start };

if (require.main === module) {
  start(null, Number(process.argv[2]) || 8080).then(({ url }) => console.log('Serving on ' + url));
}
