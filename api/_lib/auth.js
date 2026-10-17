/* Admin sign-in: one password (ADMIN_PASSWORD) → a signed, expiring, HttpOnly cookie. */
'use strict';
const crypto = require('crypto');

const COOKIE = 'pe_admin';
const TTL_SEC = 12 * 3600;

const password = () => process.env.ADMIN_PASSWORD || '';
const secret = () => process.env.SESSION_SECRET || crypto.createHash('sha256').update('pe-session|' + password()).digest('hex');
const sig = payload => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

const configured = () => password().length >= 8;

function checkPassword(input) {
  if (!configured() || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(password()).digest();
  return crypto.timingSafeEqual(a, b);
}

function makeToken() {
  const exp = Date.now() + TTL_SEC * 1000;
  const payload = `v1.${exp}`;
  return `${payload}.${sig(payload)}`;
}

function verifyToken(token) {
  if (!configured() || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const good = sig(payload);
  const a = Buffer.from(parts[2]), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(parts[1]) > Date.now();
}

function cookieOf(req) {
  const h = (req.headers || {}).cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function bearerOf(req) {
  const h = (req.headers || {}).authorization || '';
  return /^Bearer /i.test(h) ? h.slice(7).trim() : '';
}

/* Same-site use sends the HttpOnly cookie; a portal on another address sends the token as "Authorization: Bearer". */
const isAuthed = req => verifyToken(cookieOf(req)) || verifyToken(bearerOf(req));

function setCookie(res, token, secure) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL_SEC}${secure ? '; Secure' : ''}`);
}
function clearCookie(res, secure) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
}

/* Mutating admin calls must carry a custom header, which cross-site pages cannot send. */
const hasAdminHeader = req => (req.headers || {})['x-pe-admin'] === '1';

module.exports = { configured, checkPassword, makeToken, isAuthed, setCookie, clearCookie, hasAdminHeader };
