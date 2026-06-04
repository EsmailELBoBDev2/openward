// ============================================================
// OpenWard — Encryption at rest (Web Crypto)
//
// OPT-IN whole-database encryption. When enabled, the exported SQLite blob is
// encrypted with AES-GCM before it is written to IndexedDB, using a 256-bit key
// derived from a device passphrase via PBKDF2-SHA256. The in-memory database
// stays full plaintext, so all SQL / triggers / indexes / search are unaffected.
//
// THREAT MODEL — be honest about the boundary:
//   YES  Protects data AT REST: a stolen IndexedDB blob / copied browser
//        profile is unreadable without the passphrase.
//   NO   Does NOT protect a live, already-unlocked session: anyone with
//        DevTools open on an unlocked tab can still read the decrypted DB.
//   NO   Not a substitute for a server. This is still a client-only app, and a
//        forgotten passphrase is unrecoverable (no backend to reset it).
//
// Encryption is device-level, not user-level: the key is set once per page
// session (at boot, or when enabled) and intentionally persists across user
// logouts so the app keeps saving encrypted. It is only cleared by a page
// reload (memory wiped) -> the next boot prompts to unlock again.
// ============================================================

const ENC_VERSION = 1;
const PBKDF2_ITERATIONS = 300000;   // tunable; ~OWASP range for PBKDF2-SHA256
const ENC_SALT_BYTES = 16;
const ENC_IV_BYTES = 12;            // AES-GCM standard nonce length
const ENC_MIN_PASS = 8;
const ENC_RESET = Symbol('ENC_RESET');

// Session-only key material — never persisted to disk.
let _encKey = null;    // CryptoKey (AES-GCM) for this session, or null when off
let _encSalt = null;   // Uint8Array salt bound to the current passphrase

// True when saves should be encrypted (a passphrase is active this session).
function encIsActive() { return !!_encKey; }

// Is a value loaded from IndexedDB one of our encrypted envelopes?
function encIsEnvelope(v) {
  return !!v && typeof v === 'object' && v.enc === ENC_VERSION && v.salt && v.iv && v.data;
}

// --- key derivation ---
async function _encDeriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,                       // non-extractable
    ['encrypt', 'decrypt']
  );
}

// --- envelope encrypt / decrypt over the db.export() bytes ---
// Returns a structured-clone-safe envelope { enc, salt, iv, data:ArrayBuffer }.
async function encEncrypt(plainU8) {
  if (!_encKey) throw new Error('encryption locked');
  const iv = crypto.getRandomValues(new Uint8Array(ENC_IV_BYTES));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _encKey, plainU8);
  return { enc: ENC_VERSION, salt: _encSalt, iv, data };
}

// Throws (GCM auth-tag mismatch) if the active key is wrong for this envelope.
async function encDecrypt(envelope) {
  const iv = envelope.iv instanceof Uint8Array ? envelope.iv : new Uint8Array(envelope.iv);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _encKey, envelope.data);
  return new Uint8Array(pt);
}

// --- session lifecycle ---
async function encEnable(passphrase) {           // turn encryption on with a NEW passphrase
  _encSalt = crypto.getRandomValues(new Uint8Array(ENC_SALT_BYTES));
  _encKey = await _encDeriveKey(passphrase, _encSalt);
}
async function encUnlock(passphrase, salt) {     // derive the key for an existing envelope's salt
  _encSalt = salt instanceof Uint8Array ? salt : new Uint8Array(salt);
  _encKey = await _encDeriveKey(passphrase, _encSalt);
}
function encDisable() { _encKey = null; _encSalt = null; }

// ============================================================
// UI — passphrase prompts (browser only)
// ============================================================

// Resolves to the passphrase string, null (cancel), or ENC_RESET (wipe device).
function _encPromptPassphrase(opts) {
  opts = opts || {};
  const isSet = opts.mode === 'set';
  const ar = (typeof currentLanguage === 'function' ? currentLanguage() : 'en') === 'ar';
  return new Promise((resolve) => {
    const title = isSet ? (ar ? 'تعيين كلمة مرور التشفير' : 'Set encryption passphrase')
                        : (ar ? 'فتح قفل بيانات الجهاز' : 'Unlock device data');
    const desc = isSet
      ? (ar ? 'سيتم تشفير قاعدة البيانات على هذا الجهاز. احفظ كلمة المرور — لا يمكن استعادتها إذا نُسيت.'
            : 'The database on this device will be encrypted. Save this passphrase — it cannot be recovered if forgotten.')
      : (ar ? 'هذا الجهاز مشفّر. أدخل كلمة المرور للمتابعة.'
            : 'This device is encrypted. Enter the passphrase to continue.');
    const inputStyle = 'width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:1rem;margin-bottom:8px';
    const html = `
      <h2 style="margin-top:0">🔒 ${title}</h2>
      <p style="color:#555">${desc}</p>
      <input type="password" id="enc-pass" autocomplete="off" placeholder="${ar ? 'كلمة المرور' : 'Passphrase'}" style="${inputStyle}">
      ${isSet ? `<input type="password" id="enc-pass2" autocomplete="off" placeholder="${ar ? 'تأكيد كلمة المرور' : 'Confirm passphrase'}" style="${inputStyle}">` : ''}
      <div id="enc-err" style="color:#dc3545;min-height:1.2em;font-size:0.9rem;margin-bottom:8px"></div>
      <div class="flex gap-1" style="justify-content:flex-end;flex-wrap:wrap">
        ${isSet ? `<button id="enc-cancel" class="btn btn-secondary">${ar ? 'إلغاء' : 'Cancel'}</button>` : ''}
        ${!isSet ? `<button id="enc-reset" class="btn btn-secondary">${ar ? 'مسح بيانات الجهاز' : 'Reset (erase device data)'}</button>` : ''}
        <button id="enc-ok" class="btn btn-primary">${isSet ? (ar ? 'تشفير' : 'Encrypt') : (ar ? 'فتح' : 'Unlock')}</button>
      </div>`;
    const overlay = showModal(html, { preventOutsideClose: true, maxWidth: 460 });
    const $ = (s) => overlay.querySelector(s);
    const setErr = (m) => { $('#enc-err').textContent = m; };
    const p1 = $('#enc-pass');
    if (p1) p1.focus();
    $('#enc-ok').addEventListener('click', () => {
      const p = $('#enc-pass').value;
      if (!p || p.length < ENC_MIN_PASS) return setErr(ar ? `الحد الأدنى ${ENC_MIN_PASS} أحرف` : `At least ${ENC_MIN_PASS} characters`);
      if (isSet && p !== $('#enc-pass2').value) return setErr(ar ? 'كلمتا المرور غير متطابقتين' : 'Passphrases do not match');
      closeModal();
      resolve(p);
    });
    const cancelBtn = $('#enc-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { closeModal(); resolve(null); });
    const resetBtn = $('#enc-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      const warn = ar ? 'سيتم مسح جميع بيانات هذا الجهاز نهائياً ولا يمكن التراجع. متابعة؟'
                      : 'This permanently erases ALL data on this device and cannot be undone. Continue?';
      if (window.confirm(warn)) { closeModal(); resolve(ENC_RESET); }
    });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#enc-ok').click(); } });
  });
}

// Called from initDB when the stored blob is encrypted. Loops until the right
// passphrase decrypts it (key stays set for subsequent saves), or the user
// chooses to wipe. Returns the decrypted Uint8Array, or null to reset.
async function encBootUnlock(envelope) {
  // The boot flow hides the page (body.loading -> opacity:0); reveal it so the
  // unlock modal is visible, and stop the loading spinner.
  document.body.classList.remove('loading');
  const spinner = document.getElementById('loading-overlay');
  if (spinner) spinner.style.display = 'none';
  const salt = envelope.salt instanceof Uint8Array ? envelope.salt : new Uint8Array(envelope.salt);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pass = await _encPromptPassphrase({ mode: 'unlock' });
    if (pass === ENC_RESET) { encDisable(); return null; }
    try {
      await encUnlock(pass, salt);
      const bytes = await encDecrypt(envelope);  // throws if wrong passphrase
      return bytes;
    } catch (e) {
      encDisable();
      const ar = (typeof currentLanguage === 'function' ? currentLanguage() : 'en') === 'ar';
      if (typeof showError === 'function') showError(ar ? 'كلمة المرور غير صحيحة' : 'Incorrect passphrase');
    }
  }
}

// Enable / disable from the IT-admin System Settings view.
async function toggleDeviceEncryption() {
  const ar = (typeof currentLanguage === 'function' ? currentLanguage() : 'en') === 'ar';
  // Web Crypto's subtle API only exists in a secure context (HTTPS or localhost).
  if (!(window.crypto && window.crypto.subtle)) {
    if (typeof showError === 'function') showError(ar ? 'التشفير يتطلب HTTPS أو localhost' : 'Encryption requires HTTPS or localhost');
    return;
  }
  if (encIsActive()) {
    if (!window.confirm(ar ? 'إيقاف التشفير وحفظ البيانات بدون تشفير على هذا الجهاز؟'
                           : 'Disable encryption and store data unencrypted on this device?')) return;
    encDisable();
    if (typeof markDbDirty === 'function') markDbDirty();
    await saveDBToIndexedDB();
    if (typeof showSuccess === 'function') showSuccess(ar ? 'تم إيقاف التشفير' : 'Encryption disabled');
  } else {
    const pass = await _encPromptPassphrase({ mode: 'set' });
    if (!pass) return;
    await encEnable(pass);
    if (typeof markDbDirty === 'function') markDbDirty();
    await saveDBToIndexedDB();
    if (typeof showSuccess === 'function') showSuccess(ar ? 'تم تفعيل التشفير' : 'Encryption enabled');
  }
  if (typeof navigateTo === 'function' && typeof currentView !== 'undefined' && currentView) navigateTo(currentView);
}

// Node test harness only (the browser has no `module`):
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { encEnable, encUnlock, encDisable, encEncrypt, encDecrypt, encIsEnvelope, encIsActive };
}
