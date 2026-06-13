// ============================================================
// HIS — Utility Functions
// ============================================================

/**
 * SHA-256 hash — uses Web Crypto API when available (HTTPS/localhost),
 * falls back to pure JS implementation (works on any origin).
 * @param {string} message
 * @returns {Promise<string>} hex string
 */
async function sha256(message) {
  // Use the global Web Crypto (browser: window.crypto; Node: globalThis.crypto)
  // when available; fall back to the pure-JS implementation on any origin.
  const c = (typeof crypto !== 'undefined') ? crypto : null;
  if (c && c.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await c.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fall through to pure JS
    }
  }
  return _sha256Pure(message);
}

/**
 * Pure JavaScript SHA-256 — no browser APIs required.
 * Works on any origin (including http://0.0.0.0).
 */
function _sha256Pure(message) {
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }

  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  let h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

  // UTF-8 encode
  const bytes = [];
  for (let i = 0; i < message.length; i++) {
    let c = message.charCodeAt(i);
    if (c < 0x80) { bytes.push(c); }
    else if (c < 0x800) { bytes.push(0xc0|(c>>6), 0x80|(c&0x3f)); }
    else { bytes.push(0xe0|(c>>12), 0x80|((c>>6)&0x3f), 0x80|(c&0x3f)); }
  }

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i*8)) & 0xff);

  const w = new Array(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let j = 0; j < 16; j++)
      w[j] = (bytes[i+j*4]<<24)|(bytes[i+j*4+1]<<16)|(bytes[i+j*4+2]<<8)|bytes[i+j*4+3];
    for (let j = 16; j < 64; j++) {
      const s0 = rr(w[j-15],7)^rr(w[j-15],18)^(w[j-15]>>>3);
      const s1 = rr(w[j-2],17)^rr(w[j-2],19)^(w[j-2]>>>10);
      w[j] = (w[j-16]+s0+w[j-7]+s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let j = 0; j < 64; j++) {
      const S1 = rr(e,6)^rr(e,11)^rr(e,25);
      const ch = (e&f)^(~e&g);
      const t1 = (hh+S1+ch+K[j]+w[j]) >>> 0;
      const S0 = rr(a,2)^rr(a,13)^rr(a,22);
      const maj = (a&b)^(a&c)^(b&c);
      const t2 = (S0+maj) >>> 0;
      hh=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    h = [h[0]+a,h[1]+b,h[2]+c,h[3]+d,h[4]+e,h[5]+f,h[6]+g,h[7]+hh].map(x=>x>>>0);
  }
  return h.map(x => x.toString(16).padStart(8,'0')).join('');
}

/**
 * PBKDF2-HMAC-SHA256 password hashing (Web Crypto). Replaces the old fast salted
 * SHA-256, which is unsuitable for passwords (NIST/OWASP want a slow, salted KDF
 * resistant to offline cracking). The result is self-describing —
 * "pbkdf2$<iterations>$<hex>" — so verifyPassword() can read the iteration count
 * back and can recognise (and upgrade) legacy salted-SHA-256 hashes.
 * @returns {Promise<string>}
 */
const PW_HASH_ITERATIONS = 210000; // OWASP 2023 minimum for PBKDF2-HMAC-SHA256

async function pbkdf2Hex(password, salt, iterations) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(String(salt)), iterations, hash: 'SHA-256' }, km, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  return `pbkdf2$${PW_HASH_ITERATIONS}$${await pbkdf2Hex(password, salt, PW_HASH_ITERATIONS)}`;
}

// Length-constant hex compare (no early-exit timing leak).
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Verify a password against a stored hash, supporting BOTH the new PBKDF2 format
 * and the legacy salted-SHA-256 format. Returns { ok, needsUpgrade }; on a
 * successful verify of a legacy (or weaker-iteration) hash, callers should
 * re-hash with hashPassword() and persist, so old hashes migrate to PBKDF2 on the
 * next successful login.
 * @returns {Promise<{ok:boolean, needsUpgrade:boolean}>}
 */
async function verifyPassword(password, salt, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash) return { ok: false, needsUpgrade: false };
  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    const iter = parseInt(parts[1], 10) || PW_HASH_ITERATIONS;
    const ok = timingSafeEqualHex(await pbkdf2Hex(password, salt, iter), parts[2] || '');
    return { ok, needsUpgrade: ok && iter !== PW_HASH_ITERATIONS };
  }
  // Legacy: salted SHA-256 = sha256(salt + ':' + password). Upgrade on success.
  const ok = timingSafeEqualHex(await sha256(String(salt) + ':' + String(password)), storedHash);
  return { ok, needsUpgrade: ok };
}

/**
 * Generate a random salt
 * @returns {string}
 */
function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate UUID v4
 * @returns {string}
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get current ISO 8601 timestamp with milliseconds
 * @returns {string}
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Get today's date as YYYY-MM-DD (UTC, same convention as nowISO)
 * @returns {string}
 */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Standard empty-state block used by list/table views
 * @param {string} [msg] defaults to t('no_data')
 * @returns {string} HTML
 */
function emptyState(msg) {
  return `<div class="empty-state"><p>${msg || t('no_data')}</p></div>`;
}

/**
 * Format ISO datetime for display
 * @param {string} isoStr
 * @returns {string}
 */
function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Generate Medical Record Number
 * @param {number} seq - sequence number from autoincrement
 * @returns {string} e.g. HIS-20240115-00001
 */
function generateMRN(seq) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const seqStr = String(seq).padStart(5, '0');
  return `HIS-${yyyy}${mm}${dd}-${seqStr}`;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  // textContent→innerHTML escapes < > & but NOT quotes; also escape " so the
  // output is safe inside double-quoted attributes, e.g. value="${escapeHtml(x)}".
  return div.innerHTML.replace(/"/g, '&quot;');
}

/**
 * Escape a value for safe embedding inside a SINGLE-QUOTED JavaScript string that
 * itself sits inside a DOUBLE-QUOTED HTML attribute, e.g.
 *     onclick="doThing('${jsAttr(name)}')"
 *
 * escapeHtml() ALONE is not safe here: it leaves the single quote untouched, so a
 * real name like  O'Brien  — or a malicious  ');evil()//  typed into a patient
 * field — breaks out of the JS string. Encoding the quote as &#39; / &apos; is
 * WORSE: the HTML parser decodes it back to ' BEFORE the JS runs, so the name
 * neither renders correctly nor stays contained. The only correct fix is a real
 * backslash escape (which the HTML parser leaves alone) layered on top of the
 * HTML-attribute escaping escapeHtml() already does.
 * @param {string} str
 * @returns {string}
 */
function jsAttr(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')     // HTML-escape first (entities introduce no \ or ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')    // keeps the surrounding "..." attribute from closing
    .replace(/\\/g, '\\\\')     // then JS-escape: backslashes for the string literal
    .replace(/'/g, "\\'");      // and the single quote that delimits the JS string
}

// ============================================================
// Toast / Alert System
// ============================================================

/**
 * Show a success toast message
 * @param {string} message
 */
function showSuccess(message) {
  showToast(message, 'success');
}

/**
 * Show an error toast message
 * @param {string} message
 */
function showError(message) {
  showToast(message, 'error');
}

/**
 * Show an info toast message
 * @param {string} message
 */
function showInfo(message) {
  showToast(message, 'info');
}

/**
 * Internal toast renderer
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    // a11y: announce toasts to screen readers via a live region
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// Smart Alert System — Red, Yellow, Blue
// ============================================================

/**
 * RED ALERT — blocking modal
 * @param {string} message
 * @param {function} onOverride - called with override reason
 * @param {function} [onCancel]
 */
function showRedAlert(message, onOverride, onCancel) {
  const lang = currentLanguage();
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay alert-red-overlay';
  overlay.innerHTML = `
    <div class="alert-modal alert-red-modal">
      <div class="alert-icon">&#9888;</div>
      <h2>${lang === 'ar' ? 'تنبيه أحمر — حرج' : 'RED ALERT — Critical'}</h2>
      <p class="alert-message">${escapeHtml(message)}</p>
      <div class="alert-form">
        <label>${lang === 'ar' ? 'سبب التجاوز:' : 'Override Reason:'}</label>
        <select class="alert-reason-select">
          <option value="">${lang === 'ar' ? 'اختر السبب...' : 'Select reason...'}</option>
          <option value="Doctor approved">${lang === 'ar' ? 'موافقة الطبيب' : 'Doctor approved'}</option>
          <option value="Emergency situation">${lang === 'ar' ? 'حالة طوارئ' : 'Emergency situation'}</option>
          <option value="Benefits outweigh risks">${lang === 'ar' ? 'الفوائد تفوق المخاطر' : 'Benefits outweigh risks'}</option>
          <option value="No alternative available">${lang === 'ar' ? 'لا بديل متاح' : 'No alternative available'}</option>
          <option value="Other">${lang === 'ar' ? 'أخرى' : 'Other'}</option>
        </select>
        <textarea class="alert-reason-text" placeholder="${lang === 'ar' ? 'تفاصيل إضافية...' : 'Additional details...'}" rows="2"></textarea>
      </div>
      <div class="alert-buttons">
        <button class="btn btn-danger alert-override-btn" disabled>${lang === 'ar' ? 'تجاوز مع ذكر السبب' : 'Override with Reason'}</button>
        <button class="btn btn-secondary alert-cancel-btn">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const select = overlay.querySelector('.alert-reason-select');
  const overrideBtn = overlay.querySelector('.alert-override-btn');
  const cancelBtn = overlay.querySelector('.alert-cancel-btn');

  select.addEventListener('change', () => {
    overrideBtn.disabled = !select.value;
  });

  overrideBtn.addEventListener('click', () => {
    const reason = select.value + (overlay.querySelector('.alert-reason-text').value ? ': ' + overlay.querySelector('.alert-reason-text').value : '');
    overlay.remove();
    if (onOverride) onOverride(reason);
  });

  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    if (onCancel) onCancel();
  });
}

/**
 * YELLOW ALERT — warning banner with confirm
 * @param {string} message
 * @param {function} onConfirm
 * @param {function} [onCancel]
 */
function showYellowAlert(message, onConfirm, onCancel) {
  const lang = currentLanguage();
  const banner = document.createElement('div');
  banner.className = 'alert-banner alert-yellow-banner';
  banner.innerHTML = `
    <div class="alert-banner-content">
      <span class="alert-icon">&#9888;</span>
      <span class="alert-message">${escapeHtml(message)}</span>
      <button class="btn btn-warning alert-confirm-btn">${lang === 'ar' ? 'تأكيد' : 'Confirm'}</button>
      <button class="btn btn-secondary alert-cancel-btn">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
    </div>
  `;
  const main = document.getElementById('main-content') || document.body;
  main.prepend(banner);
  requestAnimationFrame(() => banner.classList.add('show'));

  banner.querySelector('.alert-confirm-btn').addEventListener('click', () => {
    banner.remove();
    if (onConfirm) onConfirm();
  });
  banner.querySelector('.alert-cancel-btn').addEventListener('click', () => {
    banner.remove();
    if (onCancel) onCancel();
  });
}

/**
 * BLUE ALERT — sidebar info note
 * @param {string} message
 * @param {function} [onDismiss]
 */
function showBlueAlert(message, onDismiss) {
  const lang = currentLanguage();
  let sidebar = document.getElementById('alerts-sidebar');
  if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.id = 'alerts-sidebar';
    document.body.appendChild(sidebar);
  }
  const card = document.createElement('div');
  card.className = 'alert-card alert-blue-card';
  card.innerHTML = `
    <span class="alert-icon">&#8505;</span>
    <span class="alert-message">${escapeHtml(message)}</span>
    <button class="btn btn-sm btn-info alert-dismiss-btn">${lang === 'ar' ? 'فهمت' : 'Got it'}</button>
  `;
  sidebar.appendChild(card);
  requestAnimationFrame(() => card.classList.add('show'));

  card.querySelector('.alert-dismiss-btn').addEventListener('click', () => {
    card.classList.remove('show');
    setTimeout(() => { card.remove(); if (onDismiss) onDismiss(); }, 300);
  });
}

// ============================================================
// Confirmation Dialog
// ============================================================

/**
 * Show a confirmation dialog
 * @param {string} message
 * @param {function} onYes
 * @param {function} [onNo]
 */
function showConfirm(message, onYes, onNo) {
  const lang = currentLanguage();
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay confirm-overlay';
  overlay.innerHTML = `
    <div class="alert-modal confirm-modal">
      <p class="alert-message">${escapeHtml(message)}</p>
      <div class="alert-buttons">
        <button class="btn btn-primary confirm-yes-btn">${lang === 'ar' ? 'نعم' : 'Yes'}</button>
        <button class="btn btn-secondary confirm-no-btn">${lang === 'ar' ? 'لا' : 'No'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.confirm-yes-btn').addEventListener('click', () => {
    overlay.remove();
    if (onYes) onYes();
  });
  overlay.querySelector('.confirm-no-btn').addEventListener('click', () => {
    overlay.remove();
    if (onNo) onNo();
  });
}

// ============================================================
// Smart Review Panel
// ============================================================

/**
 * Show the smart review panel before form submission
 * @param {Array} suggestions - [{field, auto_value, reason, options, type}]
 * @param {function} onConfirmAll - called with final values
 * @param {function} [onCancel]
 */
function showReviewPanel(suggestions, onConfirmAll, onCancel) {
  const lang = currentLanguage();
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay review-overlay';

  let rowsHtml = '';
  suggestions.forEach((s, i) => {
    if (s.type === 'pharmacy_alert' || s.type === 'clinical_suggestion') return;
    let valueHtml;
    if (s.options && s.options.length) {
      const optsHtml = s.options.map(o => {
        const selected = o === s.auto_value ? 'selected' : '';
        return `<option value="${escapeHtml(o)}" ${selected}>${escapeHtml(o)}</option>`;
      }).join('');
      valueHtml = `<select class="review-select" data-idx="${i}">${optsHtml}</select>`;
    } else {
      valueHtml = `<span class="review-value">${escapeHtml(String(s.auto_value))}</span>`;
    }
    rowsHtml += `
      <tr>
        <td>${escapeHtml(s.field)}</td>
        <td>${valueHtml}</td>
        <td>${escapeHtml(s.reason)}</td>
      </tr>
    `;
  });

  overlay.innerHTML = `
    <div class="alert-modal review-modal">
      <h2>${lang === 'ar' ? 'مراجعة ذكية قبل الإرسال' : 'Smart Review Before Submit'}</h2>
      <table class="review-table">
        <thead>
          <tr>
            <th>${lang === 'ar' ? 'الحقل' : 'Field'}</th>
            <th>${lang === 'ar' ? 'القيمة المقترحة' : 'Auto-Suggested Value'}</th>
            <th>${lang === 'ar' ? 'السبب' : 'Reason'}</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="alert-buttons">
        <button class="btn btn-primary review-confirm-btn">${lang === 'ar' ? 'تأكيد الكل وإرسال' : 'Confirm All & Submit'}</button>
        <button class="btn btn-secondary review-cancel-btn">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.review-confirm-btn').addEventListener('click', () => {
    // Collect final values
    const finalValues = {};
    suggestions.forEach((s, i) => {
      if (s.type === 'pharmacy_alert' || s.type === 'clinical_suggestion') return;
      const sel = overlay.querySelector(`select[data-idx="${i}"]`);
      finalValues[s.field] = sel ? sel.value : s.auto_value;
    });
    overlay.remove();
    if (onConfirmAll) onConfirmAll(finalValues);
  });

  overlay.querySelector('.review-cancel-btn').addEventListener('click', () => {
    overlay.remove();
    if (onCancel) onCancel();
  });
}

// ============================================================
// Patient Intelligence Engine (PIE)
// ============================================================

/**
 * Run the Patient Intelligence Engine
 * @param {object} patient
 * @param {string[]} conditions - array of condition codes
 * @param {object[]} allergies
 * @param {object[]} currentMeds
 * @param {object} admissionData
 * @returns {object[]} suggestions
 */
function runPIE(patient, conditions, allergies, currentMeds, admissionData) {
  const suggestions = [];

  // --- Diet Logic ---
  const hasDiabetes = conditions.includes('diabetes_t1') || conditions.includes('diabetes_t2');
  const hasHypertension = conditions.includes('hypertension');
  const hasRenal = conditions.includes('renal_failure') || conditions.includes('ckd');
  const hasLiver = conditions.includes('liver_disease');
  const hasCardiac = conditions.includes('cardiac');

  if (hasDiabetes && hasHypertension) {
    suggestions.push({ field: 'diet_code', auto_value: 'DM+LS', reason: 'Diabetes + Hypertension — diabetic low-sodium diet', options: Object.keys(DIET_CODES) });
  } else if (hasDiabetes) {
    suggestions.push({ field: 'diet_code', auto_value: 'DM', reason: 'Diabetes detected — diabetic diet', options: Object.keys(DIET_CODES) });
  } else if (hasHypertension) {
    suggestions.push({ field: 'diet_code', auto_value: 'LS', reason: 'Hypertension — low sodium recommended', options: Object.keys(DIET_CODES) });
  }

  if (hasRenal) {
    suggestions.push({ field: 'diet_code', auto_value: 'REN', reason: 'Renal failure — renal diet required', options: Object.keys(DIET_CODES) });
  }
  if (hasLiver) {
    suggestions.push({ field: 'diet_code', auto_value: 'HEP', reason: 'Liver disease — hepatic diet', options: Object.keys(DIET_CODES) });
  }
  if (hasCardiac && !hasHypertension && !hasDiabetes) {
    suggestions.push({ field: 'diet_code', auto_value: 'CAR', reason: 'Cardiac condition — cardiac diet', options: Object.keys(DIET_CODES) });
  }

  // --- Complexity Score ---
  let score = 1;
  if (admissionData && admissionData.on_ventilator) score = 5;
  else if (admissionData && admissionData.dept_id === 4) score = 4; // ICU
  else if (admissionData && admissionData.post_surgery) score = 4;
  else if (conditions.length >= 2) score = 3;
  else if (conditions.length === 1) score = 2;
  suggestions.push({ field: 'complexity_score', auto_value: score, reason: 'Auto-calculated from conditions + placement' });

  // --- Pharmacy / Clinical Alerts ---
  if (hasRenal) {
    suggestions.push({
      type: 'pharmacy_alert', severity: 'yellow',
      message: 'Renal failure: dose adjustment required for many drugs. Pharmacist notified.',
      message_ar: 'فشل كلوي: تعديل الجرعة مطلوب للعديد من الأدوية. تم إخطار الصيدلاني.'
    });
  }
  if (hasDiabetes) {
    suggestions.push({
      type: 'clinical_suggestion', severity: 'blue',
      message: 'Consider: blood glucose monitoring schedule, insulin protocol if not already prescribed, HbA1c on admission.',
      message_ar: 'اقتراح: جدول مراقبة السكر في الدم، بروتوكول الإنسولين إذا لم يُوصف بالفعل.'
    });
  }
  if (hasCardiac) {
    suggestions.push({
      type: 'clinical_suggestion', severity: 'blue',
      message: 'Consider: cardiac monitoring, troponin levels, ECG on admission.',
      message_ar: 'اقتراح: مراقبة القلب، مستوى التروبونين، تخطيط قلب عند الدخول.'
    });
  }

  // --- Lab Suggestions based on conditions ---
  const labSuggestions = [];
  if (hasDiabetes) {
    labSuggestions.push({code:'HBA1C', reason_en:'Diabetes — baseline HbA1c', reason_ar:'سكري — HbA1c أساسي'});
    labSuggestions.push({code:'FBS', reason_en:'Diabetes — fasting glucose monitoring', reason_ar:'سكري — مراقبة سكر صائم'});
    labSuggestions.push({code:'RFT', reason_en:'Diabetes — renal function screening', reason_ar:'سكري — فحص وظائف الكلى'});
    labSuggestions.push({code:'LIPID', reason_en:'Diabetes — lipid screening', reason_ar:'سكري — فحص دهون الدم'});
    labSuggestions.push({code:'UA', reason_en:'Diabetes — urinalysis', reason_ar:'سكري — تحليل بول'});
  }
  if (hasHypertension) {
    labSuggestions.push({code:'RFT', reason_en:'HTN — renal function', reason_ar:'ضغط — وظائف الكلى'});
    labSuggestions.push({code:'LYTE', reason_en:'HTN — electrolytes', reason_ar:'ضغط — أملاح الدم'});
    labSuggestions.push({code:'LIPID', reason_en:'HTN — lipid profile', reason_ar:'ضغط — دهون الدم'});
  }
  if (hasCardiac) {
    labSuggestions.push({code:'TROP', reason_en:'Cardiac — troponin (serial)', reason_ar:'قلبي — تروبونين (متسلسل)'});
    labSuggestions.push({code:'BNP', reason_en:'Cardiac — BNP', reason_ar:'قلبي — BNP'});
    labSuggestions.push({code:'CMP', reason_en:'Cardiac — metabolic panel', reason_ar:'قلبي — كيمياء شاملة'});
    labSuggestions.push({code:'PT_INR', reason_en:'Cardiac — coagulation', reason_ar:'قلبي — تخثر'});
    labSuggestions.push({code:'CXR', reason_en:'Cardiac — chest X-ray', reason_ar:'قلبي — أشعة صدر'});
    labSuggestions.push({code:'US_ECHO', reason_en:'Cardiac — echocardiogram', reason_ar:'قلبي — إيكو القلب'});
  }
  if (hasRenal) {
    labSuggestions.push({code:'RFT', reason_en:'Renal — kidney function', reason_ar:'كلوي — وظائف الكلى'});
    labSuggestions.push({code:'LYTE', reason_en:'Renal — electrolytes', reason_ar:'كلوي — أملاح'});
    labSuggestions.push({code:'CA', reason_en:'Renal — calcium', reason_ar:'كلوي — كالسيوم'});
    labSuggestions.push({code:'PHOS', reason_en:'Renal — phosphate', reason_ar:'كلوي — فوسفات'});
    labSuggestions.push({code:'CBC', reason_en:'Renal — anemia screening', reason_ar:'كلوي — فحص فقر الدم'});
    labSuggestions.push({code:'ABG', reason_en:'Renal — acid-base status', reason_ar:'كلوي — حالة الحموضة'});
  }
  if (hasLiver) {
    labSuggestions.push({code:'LFT', reason_en:'Liver — liver function', reason_ar:'كبدي — وظائف الكبد'});
    labSuggestions.push({code:'PT_INR', reason_en:'Liver — coagulation', reason_ar:'كبدي — تخثر'});
    labSuggestions.push({code:'ALB', reason_en:'Liver — albumin', reason_ar:'كبدي — ألبومين'});
    labSuggestions.push({code:'AMMO', reason_en:'Liver — ammonia (if confusion)', reason_ar:'كبدي — أمونيا (إذا كان هناك ارتباك)'});
  }
  const hasCOPD = conditions.includes('copd') || conditions.includes('asthma');
  if (hasCOPD) {
    labSuggestions.push({code:'ABG', reason_en:'Respiratory — blood gas', reason_ar:'تنفسي — غازات الدم'});
    labSuggestions.push({code:'CBC', reason_en:'Respiratory — CBC', reason_ar:'تنفسي — تحليل دم'});
    labSuggestions.push({code:'CXR', reason_en:'Respiratory — chest X-ray', reason_ar:'تنفسي — أشعة صدر'});
  }
  if (conditions.includes('stroke_history')) {
    labSuggestions.push({code:'PT_INR', reason_en:'Stroke — coagulation', reason_ar:'سكتة — تخثر'});
    labSuggestions.push({code:'LIPID', reason_en:'Stroke — lipid profile', reason_ar:'سكتة — دهون الدم'});
    labSuggestions.push({code:'CT_HEAD', reason_en:'Stroke — CT head', reason_ar:'سكتة — أشعة مقطعية للرأس'});
  }
  // De-duplicate lab suggestions
  const seenCodes = new Set();
  const uniqueLabSuggestions = labSuggestions.filter(l => {
    if (seenCodes.has(l.code)) return false;
    seenCodes.add(l.code);
    return true;
  });
  if (uniqueLabSuggestions.length > 0) {
    suggestions.push({
      type: 'lab_suggestions',
      labs: uniqueLabSuggestions
    });
  }

  // --- Nurse Warnings ---
  const nurseWarnings = [];
  if (hasDiabetes) {
    nurseWarnings.push({severity:'blue', en:'Diabetic patient: Check blood glucose before meals (AC) and at bedtime (HS). Follow insulin sliding scale if ordered.', ar:'مريض سكري: افحص سكر الدم قبل الوجبات وعند النوم. اتبع جدول الإنسولين المتدرج إذا طُلب.'});
  }
  if (hasRenal) {
    nurseWarnings.push({severity:'yellow', en:'Renal patient: Monitor strict I/O. Check for edema. Fluid restriction may apply. Watch for hyperkalemia signs.', ar:'مريض كلى: راقب المدخل والمخرج بدقة. تحقق من التورم. قد يكون هناك تقييد سوائل.'});
  }
  if (hasCardiac) {
    nurseWarnings.push({severity:'yellow', en:'Cardiac patient: Continuous monitoring. Report any chest pain immediately. Check troponin schedule.', ar:'مريض قلب: مراقبة مستمرة. أبلغ عن أي ألم صدر فوراً. تحقق من جدول التروبونين.'});
  }
  if (hasLiver) {
    nurseWarnings.push({severity:'yellow', en:'Liver disease: Avoid hepatotoxic drugs (Paracetamol limit). Monitor for confusion (hepatic encephalopathy).', ar:'مرض كبدي: تجنب الأدوية السامة للكبد. راقب الارتباك (اعتلال دماغي كبدي).'});
  }
  if (hasCOPD) {
    nurseWarnings.push({severity:'yellow', en:'COPD/Asthma patient: Target SpO2 88-92%. Do NOT give high-flow O2 without doctor order.', ar:'مريض COPD/ربو: هدف تشبع الأكسجين 88-92%. لا تعطِ أكسجين عالي التدفق بدون أمر الطبيب.'});
  }
  if (admissionData && admissionData.on_ventilator) {
    nurseWarnings.push({severity:'red', en:'Ventilated patient: Head of bed 30-45°. Oral care q4h. DVT prophylaxis. Sedation holiday per protocol.', ar:'مريض على جهاز تنفس: رأس السرير 30-45°. عناية فموية كل 4 ساعات. وقاية من التجلط.'});
  }
  if (admissionData && admissionData.post_surgery) {
    nurseWarnings.push({severity:'blue', en:'Post-surgical patient: Monitor surgical site for bleeding. Pain management. Early mobilization. DVT prophylaxis.', ar:'مريض بعد الجراحة: راقب موقع الجراحة للنزيف. إدارة الألم. حركة مبكرة.'});
  }
  if (admissionData && admissionData.diet_code === 'NPO') {
    nurseWarnings.push({severity:'red', en:'NPO patient: Absolutely nothing by mouth. Verify IV fluids running. Post NPO sign at bedside.', ar:'مريض NPO: ممنوع أي شيء بالفم تماماً. تأكد من السوائل الوريدية. ضع لافتة NPO عند السرير.'});
  }
  // Fall risk — age >= 65 (CDC STEADI / AHRQ inpatient screening) computed from
  // the actual DOB. The old gate was a frozen literal birth-year (< 1961, i.e.
  // 65 at the time it was written): patients born in 1961 were never flagged,
  // and the effective threshold drifted up by one year every calendar year, so
  // the unflagged-elderly window silently widened forever.
  const FALL_RISK_AGE = 65;
  let fallRiskAge = false;
  if (patient && patient.date_of_birth) {
    const dob = new Date(patient.date_of_birth);
    if (!isNaN(dob)) {
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
      fallRiskAge = age >= FALL_RISK_AGE;
    }
  }
  if (fallRiskAge || conditions.includes('stroke_history')) {
    nurseWarnings.push({severity:'yellow', en:'Fall risk: Bed in lowest position. Side rails up. Call bell within reach. Non-slip footwear.', ar:'خطر سقوط: السرير في أدنى وضع. حواجز السرير مرفوعة. جرس الاستدعاء في متناول اليد.'});
  }
  // Allergy warnings
  if (allergies && allergies.length > 0) {
    const allergenList = allergies.map(a => a.allergen).join(', ');
    nurseWarnings.push({severity:'red', en:`ALLERGIES: ${allergenList} — Verify all medications before administration.`, ar:`حساسية: ${allergenList} — تحقق من جميع الأدوية قبل الإعطاء.`});
  }
  if (nurseWarnings.length > 0) {
    suggestions.push({ type: 'nurse_warnings', warnings: nurseWarnings });
  }

  return suggestions;
}

// ============================================================
// Drug-Condition Interaction Checker
// ============================================================

/**
 * Check for drug-condition interactions
 * @param {string} drugName - generic drug name
 * @param {string[]} conditions - patient condition codes
 * @returns {Array} warnings [{severity, message_en, message_ar}]
 */
function checkDrugConditionInteractions(drugName, conditions) {
  const warnings = [];
  const dn = (drugName || '').toLowerCase();
  const hasRenal = conditions.includes('renal_failure') || conditions.includes('ckd');
  const hasLiver = conditions.includes('liver_disease');
  const hasCardiac = conditions.includes('cardiac');
  const hasAsthma = conditions.includes('asthma') || conditions.includes('copd');

  if (dn.includes('metformin') && hasRenal) {
    warnings.push({severity:'red', message_en:'Metformin contraindicated in severe renal failure (eGFR <30). Risk of lactic acidosis.', message_ar:'ميتفورمين ممنوع في الفشل الكلوي الشديد (eGFR <30). خطر الحماض اللبني.'});
  }
  if ((dn.includes('ibuprofen') || dn.includes('diclofenac') || dn.includes('ketorolac')) && hasRenal) {
    warnings.push({severity:'red', message_en:'NSAIDs contraindicated in renal failure. Use Paracetamol instead.', message_ar:'مضادات الالتهاب غير الستيرويدية ممنوعة في الفشل الكلوي. استخدم الباراسيتامول بدلاً منها.'});
  }
  if ((dn.includes('ibuprofen') || dn.includes('diclofenac')) && hasCardiac) {
    warnings.push({severity:'yellow', message_en:'NSAIDs increase cardiovascular risk. Avoid in cardiac patients.', message_ar:'مضادات الالتهاب تزيد خطر القلب. تجنبها في مرضى القلب.'});
  }
  if ((dn.includes('enalapril') || dn.includes('lisinopril') || dn.includes('captopril') || dn.includes('losartan') || dn.includes('valsartan')) && hasRenal) {
    warnings.push({severity:'yellow', message_en:'ACE inhibitor/ARB + renal failure = hyperkalemia risk. Monitor potassium closely.', message_ar:'مثبط ACE/ARB + فشل كلوي = خطر ارتفاع البوتاسيوم. راقب البوتاسيوم.'});
  }
  if ((dn.includes('atenolol') || dn.includes('bisoprolol') || dn.includes('propranolol') || dn.includes('metoprolol')) && hasAsthma) {
    warnings.push({severity:'red', message_en:'Beta-blockers may worsen bronchospasm in asthma/COPD. Use cardioselective (bisoprolol) if must.', message_ar:'حاصرات بيتا قد تزيد التشنج القصبي في الربو/COPD. استخدم انتقائي للقلب إذا لزم.'});
  }
  if ((dn.includes('morphine') || dn.includes('tramadol') || dn.includes('fentanyl')) && hasLiver) {
    warnings.push({severity:'yellow', message_en:'Reduce opioid dose in liver disease. Risk of accumulation and encephalopathy.', message_ar:'قلل جرعة الأفيونات في مرض الكبد. خطر التراكم والاعتلال الدماغي.'});
  }
  if (dn.includes('warfarin') && hasLiver) {
    warnings.push({severity:'yellow', message_en:'Liver disease increases warfarin sensitivity. Start low dose, monitor INR frequently.', message_ar:'مرض الكبد يزيد حساسية الوارفارين. ابدأ بجرعة منخفضة، راقب INR باستمرار.'});
  }

  return warnings;
}

/**
 * Get patient warnings based on conditions, allergies, and admission data
 * @param {number} patientId
 * @returns {Array} warnings [{severity, en, ar}]
 */
function getPatientWarnings(patientId) {
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  if (!patient) return [];

  const admission = dbGet('SELECT * FROM admissions WHERE patient_id = ? AND status = ? ORDER BY admitted_at DESC', [patientId, 'active']);
  const condRows = dbAll('SELECT condition_code FROM patient_conditions WHERE patient_id = ?', [patientId]);
  const conditions = condRows.map(r => r.condition_code);
  const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [patientId]);

  const suggestions = runPIE(patient, conditions, allergies, [], admission || {});
  const warningsSuggestion = suggestions.find(s => s.type === 'nurse_warnings');
  return warningsSuggestion ? warningsSuggestion.warnings : [];
}

/**
 * Render the full sticky safety banner — call from every patient view.
 * Shows allergies, communicable diseases, isolation, code status, HAI, critical unack labs.
 * @returns {string} HTML
 */
// Role-based privacy: sensitive communicable conditions hidden from non-clinical roles
const COMMUNICABLE_PRIVATE = new Set(['hiv', 'hepatitis_b', 'hepatitis_c']);
const CLINICAL_ROLES_SEE_PRIVATE = new Set(['doctor','consultant','emergency_doctor','nurse','senior_nurse','pharmacist','triage_nurse','lab_technician']);

function renderSafetyBanner(patientId, admissionId, lang) {
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  if (!patient) return '';
  const admission = admissionId
    ? dbGet('SELECT * FROM admissions WHERE admission_id = ?', [admissionId])
    : dbGet('SELECT * FROM admissions WHERE patient_id = ? AND status=\'active\' ORDER BY admitted_at DESC', [patientId]);
  const allergies = dbAll('SELECT * FROM patient_allergies WHERE patient_id = ?', [patientId]);
  const commDiseases = dbAll("SELECT condition_code FROM patient_conditions WHERE patient_id = ? AND category = 'communicable'", [patientId]);
  const haiCount = admission ? dbGet('SELECT COUNT(*) AS c FROM nosocomial_infections WHERE admission_id = ?', [admission.admission_id]).c : 0;
  const critUnack = admission ? dbGet(`SELECT COUNT(*) AS c FROM lab_orders lo LEFT JOIN lab_critical_acks lca ON lo.order_id=lca.order_id WHERE lo.admission_id=? AND lo.is_critical=1 AND lo.status='resulted' AND lca.ack_id IS NULL`, [admission.admission_id]).c : 0;
  const name = lang === 'ar' ? patient.full_name_ar : (patient.full_name_en || patient.full_name_ar);

  // Compute age
  let ageStr = '';
  if (patient.date_of_birth) {
    const dob = new Date(patient.date_of_birth);
    const years = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (years >= 1) ageStr = `${years}${lang === 'ar' ? ' سنة' : 'y'}`;
    else { const months = Math.max(1, Math.floor((Date.now() - dob.getTime()) / (30 * 24 * 3600 * 1000))); ageStr = `${months}${lang === 'ar' ? ' شهر' : 'mo'}`; }
  }

  // Isolation precaution from communicable diseases (mirrors registration logic)
  const ISO_MAP = {
    tuberculosis: { lbl_ar:'عزل تنفسي', lbl_en:'AIRBORNE', color:'#7c3aed' },
    covid19:      { lbl_ar:'عزل رذاذي', lbl_en:'DROPLET',  color:'#0ea5e9' },
    influenza:    { lbl_ar:'عزل رذاذي', lbl_en:'DROPLET',  color:'#0ea5e9' },
    meningitis:   { lbl_ar:'عزل رذاذي', lbl_en:'DROPLET',  color:'#0ea5e9' },
    mrsa:         { lbl_ar:'عزل تلامسي', lbl_en:'CONTACT', color:'#dc2626' },
    vre:          { lbl_ar:'عزل تلامسي', lbl_en:'CONTACT', color:'#dc2626' },
    c_diff:       { lbl_ar:'عزل تلامسي', lbl_en:'CONTACT', color:'#dc2626' },
    scabies:      { lbl_ar:'عزل تلامسي', lbl_en:'CONTACT', color:'#dc2626' },
  };
  const isolations = commDiseases.filter(c => ISO_MAP[c.condition_code]).map(c => ISO_MAP[c.condition_code]);

  // Code status (from admissions)
  const codeStatus = admission && admission.code_status;
  // Keys MUST match the values written by the code-status picker in
  // easy-features.js (full / dnr / dni / limited / unknown). They previously
  // read full_code/comfort, so Full-Code and Limited patients showed NO badge —
  // a patient editor could set "Full Code" yet the safety bar stayed blank.
  const codeStatusLbl = {
    full:    { ar:'كود كامل', en:'FULL CODE', color:'#10b981' },
    dnr:     { ar:'لا إنعاش (DNR)', en:'DNR', color:'#dc2626' },
    dni:     { ar:'لا تنبيب (DNI)', en:'DNI', color:'#dc2626' },
    limited: { ar:'رعاية محدودة', en:'LIMITED', color:'#d97706' },
  }[codeStatus];

  return `<div class="sticky-patient-bar no-print">
    <span class="spb-name">${escapeHtml(name)}</span>
    ${ageStr ? `<span class="spb-mrn">• ${ageStr} ${patient.gender ? (lang==='ar' ? (patient.gender==='male'?'ذكر':'أنثى') : (patient.gender==='male'?'M':'F')) : ''}</span>` : ''}
    <span class="spb-mrn">• ${escapeHtml(patient.mrn)}</span>
    ${admission && admission.bed_number ? `<span class="spb-badge spb-bed">&#128717; ${escapeHtml(admission.bed_number)}</span>` : ''}
    ${patient.blood_type && patient.blood_type !== 'unknown' ? `<span class="spb-badge spb-blood">&#129656; ${escapeHtml(patient.blood_type)}</span>` : ''}
    ${codeStatusLbl ? `<span class="spb-badge" style="background:${codeStatusLbl.color};color:#fff;">${codeStatusLbl[lang]}</span>` : ''}
    ${allergies.map(a => `<span class="spb-badge spb-allergy">&#9888; ${escapeHtml(a.allergen)}</span>`).join('')}
    ${(() => {
      // F7 fix: hide HIV/Hep B/Hep C from non-clinical roles (dietitian, social worker, receptionist, etc.)
      const session = typeof getCurrentSession === 'function' ? getCurrentSession() : null;
      const canSeePrivate = session && CLINICAL_ROLES_SEE_PRIVATE.has(session.role);
      return commDiseases.map(c => {
        const isPrivate = COMMUNICABLE_PRIVATE.has(c.condition_code);
        if (isPrivate && !canSeePrivate) return '';  // hide from non-clinical
        const label = COMMUNICABLE_DISEASES[c.condition_code] ? COMMUNICABLE_DISEASES[c.condition_code][lang] : c.condition_code;
        return `<span class="spb-badge" style="background:#dc2626;color:#fff;" title="${lang === 'ar' ? 'مرض معدٍ' : 'Communicable disease'}">&#9763; ${label}</span>`;
      }).join('');
    })()}
    ${isolations.map(i => `<span class="spb-badge" style="background:${i.color};color:#fff;font-weight:700;" title="${lang === 'ar' ? 'احتياطات عزل مطلوبة' : 'Isolation precautions required'}">&#9888; ${lang === 'ar' ? i.lbl_ar : i.lbl_en}</span>`).join('')}
    ${haiCount > 0 ? `<span class="spb-badge" style="background:#fd7e14;color:#fff;" title="${lang === 'ar' ? 'عدوى مكتسبة من المستشفى' : 'Hospital-acquired infection'}">&#127861; HAI×${haiCount}</span>` : ''}
    ${critUnack > 0 ? `<span class="spb-badge" style="background:#dc2626;color:#fff;font-weight:700;animation:pulse 1.5s infinite;" title="${lang === 'ar' ? 'نتائج حرجة لم يتم الإشعار بها' : 'Unacknowledged critical labs'}">&#128680; ${critUnack} ${lang === 'ar' ? 'حرج' : 'CRIT'}</span>` : ''}
    ${(() => {
      // Patient flags — clinician-pinned high-visibility chips (e.g. fall risk),
      // managed on the doctor/consultant problem-list screen.
      const flags = dbAll('SELECT label_en, label_ar, color FROM patient_flags WHERE patient_id = ? AND active = 1 ORDER BY flag_id DESC', [patientId]);
      const FLAG_COLORS = { info: '#0ea5e9', warn: '#d97706', danger: '#dc2626' };
      return flags.map(f => {
        const c = FLAG_COLORS[f.color] || FLAG_COLORS.info;
        const label = (lang === 'ar' && f.label_ar) ? f.label_ar : f.label_en;
        return `<span class="spb-badge" style="background:${c};color:#fff;" title="${lang === 'ar' ? 'علامة المريض' : 'Patient flag'}">&#9873; ${escapeHtml(label)}</span>`;
      }).join('');
    })()}
    <span class="spb-actions no-print">
      <button class="btn btn-sm btn-secondary" onclick="history.length > 1 ? history.back() : navigateTo('home')">${t('back_btn')}</button>
    </span>
  </div>`;
}

/**
 * Render patient warnings HTML
 * @param {number} patientId
 * @param {string} lang
 * @returns {string} HTML string
 */
function renderPatientWarningsHTML(patientId, lang) {
  const warnings = getPatientWarnings(patientId);
  if (warnings.length === 0) return '';

  const icons = {red: '&#9888;', yellow: '&#9888;', blue: '&#8505;'};
  let html = '<div class="patient-warnings">';
  html += `<h4>${lang === 'ar' ? 'تنبيهات المريض' : 'Patient Alerts'}</h4>`;
  for (const w of warnings) {
    html += `<div class="patient-warning-card warn-${w.severity}">
      <span class="warn-icon">${icons[w.severity] || '&#8505;'}</span>
      <span>${escapeHtml(lang === 'ar' ? w.ar : w.en)}</span>
    </div>`;
  }
  html += '</div>';
  return html;
}

/**
 * Render the "patient story" one-liner — appears under the safety banner.
 * Designed for fresh-grad clinicians: a single sentence summarizing who this patient is RIGHT NOW.
 */
function renderPatientStory(patientId, admissionId, lang) {
  const patient = dbGet('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
  if (!patient) return '';
  const admission = admissionId
    ? dbGet('SELECT a.*, d.name_ar as dept_ar, d.name_en as dept_en FROM admissions a LEFT JOIN departments d ON a.dept_id=d.dept_id WHERE a.admission_id=?', [admissionId])
    : null;
  const condRows = dbAll("SELECT condition_code FROM patient_conditions WHERE patient_id=? AND (category IS NULL OR category='chronic')", [patientId]);
  const recentVitals = admission ? dbGet('SELECT * FROM vitals_log WHERE admission_id=? ORDER BY recorded_at DESC LIMIT 1', [admission.admission_id]) : null;

  // Age
  let ageYears = null;
  if (patient.date_of_birth) {
    const dob = new Date(patient.date_of_birth);
    ageYears = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
  }

  // Days since admission
  let daysIn = null;
  if (admission && admission.admitted_at) {
    const adm = new Date(admission.admitted_at);
    daysIn = Math.floor((Date.now() - adm.getTime()) / (24 * 3600 * 1000));
  }

  // Build the story
  let story = '';
  const genderWord = patient.gender === 'male'
    ? (lang === 'ar' ? 'ذكر' : 'male')
    : patient.gender === 'female' ? (lang === 'ar' ? 'أنثى' : 'female') : '';

  if (lang === 'ar') {
    story = `<strong>${ageYears !== null ? ageYears + ' سنة' : 'عمر غير محدد'} ${genderWord}</strong>`;
    if (daysIn !== null) story += daysIn === 0 ? '، اليوم الأول من التنويم' : `، اليوم ${daysIn + 1} من التنويم`;
    if (admission && admission.dept_ar) story += ` في ${admission.dept_ar}`;
    if (admission && admission.chief_complaint) story += `، شكوى رئيسية: <em>${escapeHtml(admission.chief_complaint)}</em>`;
    if (condRows.length > 0) {
      const condNames = condRows.slice(0, 3).map(c => CONDITIONS[c.condition_code] ? CONDITIONS[c.condition_code].ar : c.condition_code).join('، ');
      story += `. سوابق: ${condNames}${condRows.length > 3 ? ` +${condRows.length - 3} أخرى` : ''}`;
    }
    if (recentVitals && recentVitals.news2_score !== null && recentVitals.news2_score !== undefined) {
      const sev = recentVitals.news2_score >= 7 ? 'red' : recentVitals.news2_score >= 5 ? 'orange' : 'green';
      story += `. <span style="color:${sev};font-weight:700;">NEWS2: ${recentVitals.news2_score}</span>`;
    }
  } else {
    story = `<strong>${ageYears !== null ? ageYears + 'yo' : 'age unknown'} ${genderWord}</strong>`;
    if (daysIn !== null) story += daysIn === 0 ? ', day 1 of admission' : `, day ${daysIn + 1}`;
    if (admission && admission.dept_en) story += ` in ${admission.dept_en}`;
    if (admission && admission.chief_complaint) story += `, presenting with <em>${escapeHtml(admission.chief_complaint)}</em>`;
    if (condRows.length > 0) {
      const condNames = condRows.slice(0, 3).map(c => CONDITIONS[c.condition_code] ? CONDITIONS[c.condition_code].en : c.condition_code).join(', ');
      story += `. PMH: ${condNames}${condRows.length > 3 ? ` +${condRows.length - 3} more` : ''}`;
    }
    if (recentVitals && recentVitals.news2_score !== null && recentVitals.news2_score !== undefined) {
      const sev = recentVitals.news2_score >= 7 ? '#dc2626' : recentVitals.news2_score >= 5 ? '#ea580c' : '#10b981';
      story += `. <span style="color:${sev};font-weight:700;">NEWS2 ${recentVitals.news2_score}</span>`;
    }
  }

  return `<div class="patient-story" style="background:#f8fafc;border-left:4px solid #3b82f6;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:0.92rem;line-height:1.5;color:#1e293b;">
    <span style="color:#3b82f6;font-weight:600;font-size:0.78rem;letter-spacing:0.5px;">${lang === 'ar' ? 'ملخص الحالة' : 'PATIENT STORY'}</span><br>
    ${story}.
  </div>`;
}

// ============================================================
// Help Bubbles — fresh-grad-friendly tooltip for medical jargon
// ============================================================
const MEDICAL_GLOSSARY = {
  'NEWS2':  { ar:'مقياس الإنذار المبكر الوطني 2 — يجمع 7 علامات حيوية لرصد التدهور (0-20). ≥5 = مراقبة دقيقة، ≥7 = استدعاء فوري.',  en:'National Early Warning Score 2 — aggregates 7 vitals to detect deterioration (0-20). ≥5 needs close watch, ≥7 triggers rapid response.' },
  'qSOFA':  { ar:'مقياس سريع للإنتان: ضغط ≤100، تنفس ≥22، تشوّش. ≥2 = ارتفاع خطر الوفاة من الإنتان.', en:'Quick Sepsis-related Organ Failure Assessment: SBP≤100, RR≥22, altered mental status. ≥2 = high sepsis mortality risk.' },
  'ESI':    { ar:'مؤشر شدة الطوارئ من 1 (إنعاش) إلى 5 (غير عاجل).', en:'Emergency Severity Index, 1 (resuscitation) → 5 (non-urgent).' },
  'GCS':    { ar:'مقياس غلاسكو للوعي: العين+الكلام+الحركة (3-15). 8 أو أقل = غيبوبة.', en:'Glasgow Coma Scale: Eye+Verbal+Motor (3-15). ≤8 = coma.' },
  'NANDA':  { ar:'تصنيف تشخيصات التمريض الموحد عالمياً.', en:'Standardized nursing diagnosis taxonomy.' },
  'NIC':    { ar:'تصنيف تدخلات التمريض — الأفعال التي تقوم بها الممرضة.', en:'Nursing Interventions Classification — what the nurse does.' },
  'NOC':    { ar:'تصنيف نتائج التمريض — ما يجب قياسه لتقييم النجاح.', en:'Nursing Outcomes Classification — what to measure for success.' },
  'MRSA':   { ar:'مكورات عنقودية ذهبية مقاومة للميثيسيلين. تحتاج عزل تلامسي.', en:'Methicillin-Resistant Staphylococcus Aureus. Requires contact isolation.' },
  'VRE':    { ar:'مكورات معوية مقاومة للفانكومايسين. تحتاج عزل تلامسي.', en:'Vancomycin-Resistant Enterococci. Requires contact isolation.' },
  'CAUTI':  { ar:'عدوى المسالك البولية المرتبطة بقسطرة بولية.', en:'Catheter-Associated UTI.' },
  'CLABSI': { ar:'عدوى مجرى الدم المرتبطة بقسطرة وريدية مركزية.', en:'Central Line-Associated Bloodstream Infection.' },
  'VAP':    { ar:'الالتهاب الرئوي المرتبط بجهاز التنفس الاصطناعي.', en:'Ventilator-Associated Pneumonia.' },
  'SSI':    { ar:'عدوى موضع الجراحة.', en:'Surgical Site Infection.' },
  'MAR':    { ar:'سجل إعطاء الأدوية — يحدد متى وما يجب إعطاؤه.', en:'Medication Administration Record — schedules what to give when.' },
  'PRN':    { ar:'حسب الحاجة (Pro Re Nata).', en:'As-needed (Pro Re Nata).' },
  'NPO':    { ar:'صائم (Nil Per Os) — لا أكل ولا شرب.', en:'Nothing by mouth (Nil Per Os).' },
  'STAT':   { ar:'فوري — يجب التنفيذ خلال دقائق.', en:'Immediate — execute within minutes.' },
  'DNR':    { ar:'لا إنعاش قلبي رئوي.', en:'Do Not Resuscitate.' },
  'DNI':    { ar:'لا تنبيب.', en:'Do Not Intubate.' },
  'STEMI':  { ar:'احتشاء عضلة قلب مع ارتفاع ST — يحتاج فتح شرايين فوري (90 دقيقة).', en:'ST-Elevation MI — needs immediate revascularization (90-min door-to-balloon).' },
  'NSTEMI': { ar:'احتشاء عضلة قلب بدون ارتفاع ST — يحتاج علاج لمنع التطور.', en:'Non-ST-Elevation MI — needs treatment to prevent progression.' },
  'ACS':    { ar:'متلازمة شريانية حادة — تشمل STEMI/NSTEMI/الذبحة غير المستقرة.', en:'Acute Coronary Syndrome — includes STEMI/NSTEMI/Unstable Angina.' },
  'eGFR':   { ar:'معدل ترشيح كبيبي مُقدّر. <60 = اختلال كلوي، <30 = شديد.', en:'Estimated Glomerular Filtration Rate. <60 = kidney impairment, <30 = severe.' },
  'INR':    { ar:'النسبة المعيارية الدولية. هدف الوارفارين عادة 2-3.', en:'International Normalized Ratio. Warfarin target usually 2-3.' },
  'SBAR':   { ar:'صيغة تواصل: الحالة، الخلفية، التقييم، التوصية.', en:'Communication format: Situation, Background, Assessment, Recommendation.' },
};

/**
 * Inline help bubble — `${help('NEWS2')}` shows a (?) tooltip explaining the term
 */
function help(termKey) {
  const lang = currentLanguage();
  const def = MEDICAL_GLOSSARY[termKey];
  if (!def) return '';
  const text = lang === 'ar' ? def.ar : def.en;
  return `<span class="help-bubble" tabindex="0" title="${escapeHtml(text)}" style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:#dbeafe;color:#1e40af;font-size:0.7rem;font-weight:700;margin:0 3px;cursor:help;border:1px solid #93c5fd;vertical-align:super;">?</span>`;
}

// ============================================================
// Decline-with-Reason — universal helper for verifying user acknowledged alert
// User can override an alert/suggestion but MUST log why → blackbox
// ============================================================
function requireReasonToDecline(alertHtml, contextKey, onAccept, onDecline) {
  const lang = currentLanguage();
  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay';
  overlay.innerHTML = `
    <div class="alert-modal" style="max-width:540px;">
      <div style="padding:18px 22px;">
        <h3 style="margin-bottom:10px;color:#dc2626;">&#9888; ${lang === 'ar' ? 'يلزم تأكيد' : 'Action Required'}</h3>
        <div style="background:#fff5f5;border-left:4px solid #dc2626;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:0.92rem;">
          ${alertHtml}
        </div>
        <p style="font-size:0.85rem;color:#666;margin-bottom:8px;">
          ${lang === 'ar' ? 'اختر إجراءً. إذا قمت بتجاوز التنبيه، اذكر السبب — سيتم تسجيله في سجل المراجعة.' : 'Choose an action. If you override the alert, state the reason — it will be saved to the audit log.'}
        </p>
        <textarea id="decline-reason" rows="2" style="width:100%;border:1px solid #ccc;border-radius:6px;padding:8px;margin-bottom:10px;font-size:0.9rem;"
          placeholder="${lang === 'ar' ? 'سبب التجاوز (مطلوب لتجاوز التنبيه)...' : 'Reason for override (required to dismiss)...'}"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" id="rd-decline-btn">${lang === 'ar' ? 'تجاوز' : 'Override'}</button>
          <button class="btn btn-success" id="rd-accept-btn">${lang === 'ar' ? 'تم — اتخذت الإجراء' : 'Done — Action Taken'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('rd-accept-btn').onclick = async () => {
    overlay.remove();
    if (typeof logAction === 'function') {
      const user = getCurrentUser();
      await logAction('ALERT_ACCEPTED', `${user ? user.full_name_en : 'User'} acknowledged alert and took action: ${contextKey}`, null);
    }
    if (onAccept) onAccept();
  };
  document.getElementById('rd-decline-btn').onclick = async () => {
    const reason = document.getElementById('decline-reason').value.trim();
    if (!reason || reason.length < 5) {
      showError(lang === 'ar' ? 'يجب ذكر سبب التجاوز (٥ أحرف على الأقل)' : 'Override reason required (min 5 characters)');
      return;
    }
    overlay.remove();
    if (typeof logAction === 'function') {
      const user = getCurrentUser();
      await logAction('ALERT_OVERRIDDEN', `${user ? user.full_name_en : 'User'} overrode alert (${contextKey}). Reason: ${reason}`, null);
    }
    if (onDecline) onDecline(reason);
  };
}

// ============================================================
// Generic Modal helper (overlay)
// Used by Care Plan, Assessment forms, etc.
// ============================================================

function showModal(innerHtml, opts) {
  opts = opts || {};
  // Remove any existing modal
  const existing = document.querySelector('.alert-overlay.generic-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'alert-overlay generic-modal';
  overlay.innerHTML = `<div class="alert-modal" style="max-width:${opts.maxWidth || 720}px;width:90vw;max-height:90vh;overflow-y:auto">${innerHtml}</div>`;

  // Click outside to close
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay && !opts.preventOutsideClose) overlay.remove();
  });

  document.body.appendChild(overlay);
  return overlay;
}

function closeModal() {
  document.querySelectorAll('.alert-overlay.generic-modal').forEach(m => m.remove());
}

// ============================================================
// Modal accessibility (a11y): focus trap + focus restore
// Covers BOTH showModal() generic modals and the ad-hoc `.alert-overlay`
// modals (they are all appended as direct children of <body>). When a modal
// opens, focus moves into it; Tab / Shift+Tab cycle within the topmost overlay
// so a keyboard user can't reach the page behind it; when the last modal
// closes, focus returns to whatever had it before the modal opened.
// ============================================================
(function installModalFocusTrap() {
  const MODAL_SEL = '.alert-overlay, .generic-modal';
  let lastFocused = null;

  function topOverlay() {
    const all = document.querySelectorAll(MODAL_SEL);
    return all.length ? all[all.length - 1] : null;
  }
  function focusables(container) {
    return Array.from(container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
  }

  function start() {
    // Move focus into a modal when it appears; restore it when the last closes.
    const obs = new MutationObserver(() => {
      const top = topOverlay();
      if (top && !top.contains(document.activeElement)) {
        if (!lastFocused) lastFocused = document.activeElement;
        const f = focusables(top);
        if (f[0]) f[0].focus();
      } else if (!top && lastFocused) {
        try { lastFocused.focus(); } catch (e) {}
        lastFocused = null;
      }
    });
    obs.observe(document.body, { childList: true });

    // Trap Tab within the topmost overlay (capture phase, before app handlers).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const overlay = topOverlay();
      if (!overlay) return;
      const f = focusables(overlay);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }, true);
  }

  if (typeof document !== 'undefined') {
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  }
})();

// Node test harness only (browser has no `module`): expose the pure helpers.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sha256, hashPassword, verifyPassword, pbkdf2Hex, timingSafeEqualHex, generateSalt, escapeHtml, jsAttr, PW_HASH_ITERATIONS };
}
