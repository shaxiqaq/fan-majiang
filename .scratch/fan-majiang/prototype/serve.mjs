// 原型用的静态服务器（用完即扔）：node .scratch/fan-majiang/prototype/serve.mjs
// 以 .scratch/fan-majiang/ 为根目录，原型页面能直接 import ../sim/ 里的规则和求解器。
// 监听 0.0.0.0，同一局域网里的手机可以用打印出来的地址打开。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5179;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/prototype/' + url.search });
      return res.end();
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`翻麻将原型：http://localhost:${PORT}/prototype/`);
    for (const list of Object.values(os.networkInterfaces()))
      for (const a of list || [])
        if (a.family === 'IPv4' && !a.internal) console.log(`  手机（同一 Wi-Fi）：http://${a.address}:${PORT}/prototype/`);
  });
