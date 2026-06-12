'use strict';
// EVERY VIEW × ITS ROLES render smoke test — the gap the audit list carried for
// 17 passes ("role default views smoke-checked but not every view of every role").
//
// Loads the real browser sources (same order as index.html, like
// test_boot_scripts) into one vm context with a permissive DOM stub, seeds the
// FULL demo hospital on a real sql.js DB, logs in through the REAL session
// machinery (a sessions row + localStorage key, not a faked getCurrentSession),
// then calls the real renderView() for every case in its switch, for every role
// allowed by VIEW_PREFIX_ROLES, in BOTH languages. A view that throws (invalid
// SQL, null deref on an empty result set, missing helper) fails the run — this
// is exactly the class of the old computeNurseAttention HAVING-without-GROUP-BY
// crash that only a live browser used to catch.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.error('  FAIL- ' + m); } }

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m => m[1]).filter(s => s.startsWith('js/'));

// ---- permissive DOM stub: enough browser for RENDER paths ----
const noop = () => {};
function stubEl() {
  const el = {
    innerHTML: '', value: '', textContent: '', checked: false, disabled: false,
    style: {}, dataset: {}, options: [], selectedIndex: 0, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    appendChild: (c) => c, removeChild: noop, remove: noop, insertAdjacentHTML: noop,
    insertBefore: (n) => n, replaceChild: (n) => n, after: noop, before: noop,
    querySelector: () => stubEl(), querySelectorAll: () => [],
    focus: noop, blur: noop, click: noop, closest: () => null, contains: () => false,
    getContext: () => ({}), getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    scrollIntoView: noop,
  };
  // real DOM nodes always have a parent (suggest.js inserts siblings via it)
  Object.defineProperty(el, 'parentNode', { get: () => stubEl() });
  return el;
}
const byId = new Map();   // persistent per-id elements so the test can read main-content back
const docStub = {
  getElementById: (id) => { if (!byId.has(id)) byId.set(id, stubEl()); return byId.get(id); },
  createElement: () => stubEl(), createTextNode: () => ({}),
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop,
  body: stubEl(), head: stubEl(), documentElement: stubEl(),
  activeElement: null, visibilityState: 'visible', cookie: '',
};
const storage = new Map();
const storageStub = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k), clear: () => storage.clear() };
function ChartStub() { return { destroy: noop, update: noop, resize: noop, data: { datasets: [] } }; }
ChartStub.defaults = { font: {}, plugins: { legend: {} }, color: '' };
ChartStub.register = noop;

const g = {
  console, crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, Blob: function () {},
  setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
  requestAnimationFrame: noop, queueMicrotask: (cb) => cb(),
  document: docStub, localStorage: storageStub, sessionStorage: storageStub,
  navigator: { language: 'en', userAgent: 'node', clipboard: { writeText: noop } },
  location: { href: 'file://', search: '', hash: '', reload: noop, assign: noop, protocol: 'file:' },
  history: { length: 1, back: noop, pushState: noop, replaceState: noop },
  indexedDB: { open: () => ({}) },
  alert: noop, confirm: () => true, prompt: () => null,
  fetch: () => Promise.resolve({}), XMLHttpRequest: function () { return { open: noop, send: noop, setRequestHeader: noop, status: 0, responseText: '' }; },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  BroadcastChannel: function () { return { postMessage: noop, addEventListener: noop, close: noop }; },
  initSqlJs: () => Promise.resolve({}), QRCode: function () {}, Chart: ChartStub,
  EventSource: function () { return { close: noop }; },
  MutationObserver: function () { return { observe: noop, disconnect: noop }; },
  ResizeObserver: function () { return { observe: noop, disconnect: noop }; },
  IntersectionObserver: function () { return { observe: noop, disconnect: noop }; },
};
const ctx = vm.createContext(g);
g.window = g; g.self = g; g.globalThis = g;

(async () => {
  // 1. load the real sources, browser order
  for (const src of srcs) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), ctx, { filename: src });
  }
  assert(true, `loaded ${srcs.length} real js/ sources into one scope`);

  // 2. real sql.js DB + the FULL demo seed (worklists, history, edge patients)
  const initSqlJs = require(path.resolve('vendor/sql-wasm.js'));
  const SQL = await initSqlJs({ locateFile: f => path.resolve('vendor', f) });
  const sqlDb = new SQL.Database();
  ctx.__sqlDb = sqlDb;
  await vm.runInContext(`(async () => {
    db = __sqlDb;
    saveDBToIndexedDB = async () => {};
    createAllTables(); applySchemaMigrations();
    await seedData();
    db.run('PRAGMA foreign_keys = ON');
  })()`, ctx);
  assert(vm.runInContext(`dbGet('SELECT COUNT(*) AS c FROM users').c`, ctx) >= 10, 'demo hospital seeded');

  // 3. enumerate every view from the REAL renderView switch (stays current as views are added)
  const routerSrc = fs.readFileSync(path.join(root, 'js/router.js'), 'utf8');
  const switchSrc = routerSrc.slice(routerSrc.indexOf('function renderView('), routerSrc.indexOf('default:', routerSrc.indexOf('function renderView(')));
  const views = [...new Set([...switchSrc.matchAll(/case '([a-z0-9-]+)':/g)].map(m => m[1]))];
  assert(views.length >= 50, `enumerated ${views.length} views from renderView's switch`);

  const prefixRoles = vm.runInContext('VIEW_PREFIX_ROLES', ctx);
  const rolesForView = (v) => {
    const pfx = Object.keys(prefixRoles).find(p => v.startsWith(p));
    return pfx ? prefixRoles[pfx] : [];
  };

  // 4. REAL login: insert a sessions row and point localStorage at it
  vm.runInContext(`__login = (role) => {
    const sid = 'view-test-' + role;
    let uid;
    if (role === 'patient') uid = dbGet('SELECT patient_id AS id FROM patients ORDER BY patient_id LIMIT 1').id;
    else uid = dbGet('SELECT user_id AS id FROM users WHERE role = ? AND is_active = 1 LIMIT 1', [role]).id;
    const exp = new Date(Date.now() + 8 * 3600e3).toISOString();
    dbRun('INSERT OR REPLACE INTO sessions (session_id, user_id, role, dept_id, login_time, last_active, expires_at) VALUES (?,?,?,?,?,?,?)',
      [sid, uid, role, dbGet('SELECT department_id AS d FROM users WHERE user_id=?', [uid])?.d ?? null, nowISO(), nowISO(), exp]);
    localStorage.setItem(SESSION_KEY, sid);
    if (!getCurrentSession()) throw new Error('real session machinery rejected the test session for ' + role);
  }`, ctx);

  // 5. render EVERY view for EVERY allowed role in BOTH languages
  let rendered = 0; const failures = [];
  const rejections = [];
  process.on('unhandledRejection', (e) => rejections.push(String(e && e.message || e)));
  for (const view of views) {
    const roles = rolesForView(view);
    if (!roles.length) { failures.push(`${view}: no role prefix matches — orphaned view?`); continue; }
    for (const role of roles) {
      for (const lang of ['en', 'ar']) {
        try {
          vm.runInContext(`__login(${JSON.stringify(role)});
            setLanguage(${JSON.stringify(lang)});
            (() => { const m = document.getElementById('main-content'); m.innerHTML = ''; })();
            if (!canAccessView(${JSON.stringify(view)}, ${JSON.stringify(role)})) throw new Error('canAccessView denies its own VIEW_PREFIX_ROLES entry');
            renderView(${JSON.stringify(view)});`, ctx, { filename: `render:${view}:${role}:${lang}` });
          const out = vm.runInContext(`document.getElementById('main-content').innerHTML`, ctx);
          if (!out || out.length < 40) failures.push(`${view} as ${role} [${lang}]: rendered EMPTY (${(out || '').length} chars)`);
          else rendered++;
        } catch (e) {
          failures.push(`${view} as ${role} [${lang}]: THREW ${e.message}`);
        }
      }
    }
  }
  await new Promise(r => setImmediate(r));
  assert(failures.length === 0, `all ${rendered} view×role×lang renders succeed with non-empty output`
    + (failures.length ? '\n         ' + failures.slice(0, 20).join('\n         ') : ''));
  assert(rejections.length === 0, 'no unhandled async rejections during renders'
    + (rejections.length ? ` -> ${rejections.slice(0, 3).join('; ')}` : ''));
  console.log(`  (${rendered} renders across ${views.length} views, both languages)`);

  // 6. negative control: a view that throws WOULD be caught (not a vacuous harness)
  let caught = false;
  try { vm.runInContext(`renderITUsers = () => { throw new Error('probe'); }; renderView('it-users');`, ctx); }
  catch (e) { caught = /probe/.test(e.message); }
  assert(caught, 'harness is real: an exploding renderer fails the test');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('  FAIL- harness error: ' + (e && e.stack || e)); process.exit(1); });
