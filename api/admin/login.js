/* GET    → { authed, configured, storage }   (who am I)
   POST   → sign in with { password }
   DELETE → sign out                                         */
'use strict';
const auth = require('../_lib/auth');
const store = require('../_lib/store');
const { send, ip, body, isJson, isHttps, cors } = require('../_lib/http');

const wait = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    const secure = isHttps(req);
    if (req.method === 'GET') {
      return send(res, 200, { authed: auth.isAuthed(req), configured: auth.configured(), storage: store.mode() });
    }
    if (req.method === 'DELETE') {
      if (!auth.hasAdminHeader(req)) return send(res, 403, { error: 'forbidden' });
      auth.clearCookie(res, secure);
      return send(res, 200, { ok: true });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST, DELETE'); return send(res, 405, { error: 'method_not_allowed' }); }
    if (!isJson(req) || !auth.hasAdminHeader(req)) return send(res, 403, { error: 'forbidden' });
    if (!auth.configured()) return send(res, 503, { error: 'admin_not_configured' });
    if (await store.limited('login:' + ip(req), 8, 900)) return send(res, 429, { error: 'too_many_attempts' });

    const d = body(req) || {};
    if (!auth.checkPassword(d.password)) { await wait(500); return send(res, 401, { error: 'wrong_password' }); }
    const token = auth.makeToken();
    auth.setCookie(res, token, secure);
    return send(res, 200, { ok: true, token });
  } catch (e) {
    console.error('login failed:', e && e.message);
    return send(res, 500, { error: 'server_error' });
  }
};
