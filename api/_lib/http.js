'use strict';

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}

function ip(req) {
  const h = req.headers || {};
  const raw = h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown';
  return String(raw).split(',')[0].trim().slice(0, 64);
}

/* Vercel parses JSON bodies for us; the local dev server does the same. */
function body(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return null; } }
  return null;
}

const isJson = req => /^application\/json/i.test((req.headers || {})['content-type'] || '');
const isHttps = req => ((req.headers || {})['x-forwarded-proto'] || '').split(',')[0] === 'https';

/* Cross-origin access. The website and the admin portal may live on other addresses than this API.
   Only origins listed in ALLOWED_ORIGINS (comma-separated, e.g. https://primeera1.vercel.app) get CORS headers.
   Returns true when the request was a preflight and has already been answered. */
function cors(req, res) {
  const origin = (req.headers || {}).origin;
  const list = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
  if (origin && list.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PE-Admin, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}

module.exports = { send, ip, body, isJson, isHttps, cors };
