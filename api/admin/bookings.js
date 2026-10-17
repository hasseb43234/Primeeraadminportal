/* Admin-only.
   GET    → { bookings, storage }
   PATCH  → { id, status?, notes? }
   DELETE → { id }                  */
'use strict';
const auth = require('../_lib/auth');
const store = require('../_lib/store');
const { send, body, isJson } = require('../_lib/http');

module.exports = async function handler(req, res) {
  try {
    if (!auth.isAuthed(req)) return send(res, 401, { error: 'unauthorized' });
    const mode = store.mode();

    if (req.method === 'GET') return send(res, 200, { bookings: await store.listBookings(), storage: mode });

    if (req.method !== 'PATCH' && req.method !== 'DELETE') { res.setHeader('Allow', 'GET, PATCH, DELETE'); return send(res, 405, { error: 'method_not_allowed' }); }
    if (!auth.hasAdminHeader(req) || !isJson(req)) return send(res, 403, { error: 'forbidden' });
    if (mode === 'none') return send(res, 503, { error: 'storage_not_configured' });

    const d = body(req) || {};
    if (typeof d.id !== 'string' || !/^[a-f0-9]{10}$/.test(d.id)) return send(res, 400, { error: 'bad_id' });

    if (req.method === 'PATCH') {
      if (d.status !== undefined && !store.STATUSES.includes(d.status)) return send(res, 400, { error: 'bad_status' });
      const out = await store.updateBooking(d.id, { status: d.status, notes: d.notes });
      if (out.error === 'not_found') return send(res, 404, { error: 'not_found' });
      if (out.error === 'slot_taken') return send(res, 409, { error: 'slot_taken' });
      if (out.error) return send(res, 503, { error: 'storage_not_configured' });
      return send(res, 200, { booking: out.booking });
    }

    const out = await store.deleteBooking(d.id);
    if (out.error === 'not_found') return send(res, 404, { error: 'not_found' });
    if (out.error) return send(res, 503, { error: 'storage_not_configured' });
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error('bookings failed:', e && e.message);
    return send(res, 500, { error: 'server_error' });
  }
};
