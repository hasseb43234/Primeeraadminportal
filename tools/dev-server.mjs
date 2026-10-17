// Local test server: serves the site and runs the /api functions the way Vercel does.
// Usage:  ADMIN_PASSWORD=choose-a-long-password node tools/dev-server.mjs [port]
// (or put ADMIN_PASSWORD=... in a .env.local file in the project root — it is git-ignored)
// Bookings are kept in .data/store.json while developing locally.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const require = createRequire(import.meta.url);

try {
  for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* no .env.local */ }

const port = Number(process.argv[2]) || 5181;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain' };

function readBody(req) {
  return new Promise(resolve => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size < 1e6) chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let p = decodeURIComponent(url.pathname);

  if (p.startsWith('/api/')) {
    const file = path.join(root, p.replace(/\/+$/, '') + '.js');
    if (!file.startsWith(path.join(root, 'api')) || file.includes(`${path.sep}_lib${path.sep}`) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
    const raw = await readBody(req);
    if (/json/i.test(req.headers['content-type'] || '') && raw) { try { req.body = JSON.parse(raw); } catch (e) { req.body = undefined; } }
    req.query = Object.fromEntries(url.searchParams);
    return require(file)(req, res);
  }

  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(root, p);
  if (!file.startsWith(root) || path.relative(root, file).split(path.sep).some(seg => seg.startsWith('.') || seg === 'node_modules')) { res.statusCode = 403; return res.end('Forbidden'); }
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Prime Era dev server: http://127.0.0.1:${port}/   admin: http://127.0.0.1:${port}/admin/`);
  if (!process.env.ADMIN_PASSWORD) console.log('Note: ADMIN_PASSWORD is not set, so admin sign-in is disabled.');
});
