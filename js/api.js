'use strict';
// Thin client for the OpenWard LAN server's /api (see server/server.js).
//
// As the UI migrates off the in-browser sql.js/IndexedDB database onto the
// central server, view code calls these instead of dbGet/dbRun. The session
// rides an HttpOnly cookie set by the server on /api/login, so credentials and
// session ids never live in JS/localStorage. `credentials: 'same-origin'` sends
// that cookie with every call.
const api = {
  async _req(method, p, body) {
    const res = await fetch(p, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw Object.assign(new Error((data && data.message) || res.statusText), { status: res.status, data });
    return data;
  },
  get(p) { return this._req('GET', p); },
  post(p, body) { return this._req('POST', p, body); },
  login(username, password) { return this.post('/api/login', { username, password }); },
  logout() { return this.post('/api/logout'); },
  me() { return this.get('/api/me'); },
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
