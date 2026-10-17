/* Storage adapter for bookings.
   - Production (Vercel): Redis over REST — Upstash Redis, or Vercel's Redis/KV integration.
     Needs UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN).
   - Local development: a JSON file in .data/ (never used on Vercel, whose disk is temporary).
   - Otherwise mode() is 'none' and the API reports that storage is not connected. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const env = process.env;
const REDIS_URL = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').replace(/\/+$/, '');
const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
const useRedis = !!(REDIS_URL && REDIS_TOKEN);
const useFile = !useRedis && !env.VERCEL;

const K_BOOKINGS = 'pe:bookings';   // hash: id -> JSON
const K_SLOTS = 'pe:slots';         // hash: slot ISO -> booking id (holds a slot while the booking is active)

const mode = () => (useRedis ? 'redis' : useFile ? 'file' : 'none');

/* ---------- Redis (REST) ---------- */
async function redis(...args) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(6000)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || `redis ${r.status}`);
  return d.result;
}

/* ---------- local file ---------- */
const FILE = path.join(process.cwd(), '.data', 'store.json');
let mem = null;
function load() {
  if (mem) return mem;
  try { mem = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { mem = { bookings: {}, slots: {}, rl: {} }; }
  mem.bookings = mem.bookings || {}; mem.slots = mem.slots || {}; mem.rl = mem.rl || {};
  return mem;
}
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(mem));
}

const newId = () => crypto.randomBytes(5).toString('hex');
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

/* ---------- API ---------- */
async function createBooking(b) {
  const id = newId();
  const rec = { ...b, id, status: 'new', notes: '', createdAt: new Date().toISOString() };
  if (useRedis) {
    const got = await redis('HSETNX', K_SLOTS, rec.startUtc, id);
    if (!got) return { error: 'slot_taken' };
    try { await redis('HSET', K_BOOKINGS, id, JSON.stringify(rec)); }
    catch (e) { await redis('HDEL', K_SLOTS, rec.startUtc).catch(() => {}); throw e; }
    return { booking: rec };
  }
  if (useFile) {
    const s = load();
    if (s.slots[rec.startUtc]) return { error: 'slot_taken' };
    s.slots[rec.startUtc] = id; s.bookings[id] = rec; save();
    return { booking: rec };
  }
  return { error: 'no_storage' };
}

async function listBookings() {
  if (useRedis) {
    const flat = (await redis('HGETALL', K_BOOKINGS)) || [];
    const out = [];
    for (let i = 1; i < flat.length; i += 2) { const b = parse(flat[i]); if (b) out.push(b); }
    return out.sort((a, c) => (c.createdAt || '').localeCompare(a.createdAt || ''));
  }
  if (useFile) return Object.values(load().bookings).sort((a, c) => (c.createdAt || '').localeCompare(a.createdAt || ''));
  return [];
}

async function getBooking(id) {
  if (useRedis) return parse(await redis('HGET', K_BOOKINGS, id));
  if (useFile) return load().bookings[id] || null;
  return null;
}

async function bookedSlots() {
  if (useRedis) { const flat = (await redis('HGETALL', K_SLOTS)) || []; return flat.filter((_, i) => i % 2 === 0); }
  if (useFile) return Object.keys(load().slots);
  return [];
}

const STATUSES = ['new', 'confirmed', 'done', 'cancelled', 'no-show'];
const FREES_SLOT = s => s === 'cancelled';

async function updateBooking(id, patch) {
  const cur = await getBooking(id);
  if (!cur) return { error: 'not_found' };
  const next = { ...cur };
  if (typeof patch.status === 'string' && STATUSES.includes(patch.status)) next.status = patch.status;
  if (typeof patch.notes === 'string') next.notes = patch.notes.slice(0, 4000);
  next.updatedAt = new Date().toISOString();
  const was = FREES_SLOT(cur.status), now = FREES_SLOT(next.status);
  if (useRedis) {
    if (was && !now) { const got = await redis('HSETNX', K_SLOTS, cur.startUtc, id); if (!got) return { error: 'slot_taken' }; }
    if (!was && now) await redis('HDEL', K_SLOTS, cur.startUtc);
    await redis('HSET', K_BOOKINGS, id, JSON.stringify(next));
  } else if (useFile) {
    const s = load();
    if (was && !now) { if (s.slots[cur.startUtc]) return { error: 'slot_taken' }; s.slots[cur.startUtc] = id; }
    if (!was && now) delete s.slots[cur.startUtc];
    s.bookings[id] = next; save();
  } else return { error: 'no_storage' };
  return { booking: next };
}

async function deleteBooking(id) {
  const cur = await getBooking(id);
  if (!cur) return { error: 'not_found' };
  if (useRedis) {
    if (!FREES_SLOT(cur.status)) await redis('HDEL', K_SLOTS, cur.startUtc);
    await redis('HDEL', K_BOOKINGS, id);
  } else if (useFile) {
    const s = load();
    if (s.slots[cur.startUtc] === id) delete s.slots[cur.startUtc];
    delete s.bookings[id]; save();
  } else return { error: 'no_storage' };
  return { ok: true };
}

/* fixed-window rate limit: returns true when the caller is over the limit */
async function limited(key, max, windowSec) {
  try {
    if (useRedis) {
      const k = `pe:rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
      const n = await redis('INCR', k);
      if (n === 1) await redis('EXPIRE', k, windowSec + 5);
      return n > max;
    }
    if (useFile) {
      const s = load(), now = Date.now(), k = `${key}:${Math.floor(now / 1000 / windowSec)}`;
      for (const old of Object.keys(s.rl)) if (s.rl[old].exp < now) delete s.rl[old];
      const e = s.rl[k] || (s.rl[k] = { n: 0, exp: now + (windowSec + 5) * 1000 });
      e.n += 1;
      return e.n > max;
    }
  } catch (e) { /* never block on limiter failure */ }
  return false;
}

module.exports = { mode, createBooking, listBookings, getBooking, bookedSlots, updateBooking, deleteBooking, limited, STATUSES };
