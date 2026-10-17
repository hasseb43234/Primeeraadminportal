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

module.exports = { send, ip, body, isJson, isHttps };
