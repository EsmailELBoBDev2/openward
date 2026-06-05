# OpenWard

> **A FOSS hospital information system prototype.** Bilingual (English / العربية), runs entirely in the browser, designed to demonstrate what a thoughtful, fresh-grad-friendly clinical UX could look like.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: Educational Demo](https://img.shields.io/badge/Status-Educational%20Demo-orange)]()
[![Bilingual](https://img.shields.io/badge/Lang-EN%20%2F%20%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-blue)]()

---

## ⚠️ Read this first — what OpenWard is NOT

**This is a prototype, not a production HIS.** Do not deploy this to a real hospital, real patients, or real PHI without significant architectural changes. Specifically:

### 1. The browser-only architecture is a deal-breaker for real clinical use
- Data lives in **IndexedDB on each device**. There is no central database.
- A nurse who clears her browser cache loses everything.
- A nurse who walks to a different workstation cannot see her patients.
- Two nurses on two devices each have their own diverging copy of "the truth."
- The "your data stays on the device" framing is a *privacy demo*, not a real clinical workflow.

**To make this production-ready you would need:** a central server (Postgres + REST or GraphQL API), per-row encryption, sync to the browser as offline cache only, conflict resolution for concurrent edits.

### 2. It does NOT meet HIPAA, GDPR, or any healthcare data regulation
- Optional AES-GCM encryption at rest now exists (key derived from a device passphrase via PBKDF2-SHA256) — but it's opt-in, guards only data **at rest** (a live unlocked tab is still readable in DevTools), a forgotten passphrase is unrecoverable, and there's still no managed key storage (KMS/HSM)
- The "blackbox" audit log lives in the same IndexedDB any admin can wipe with one DevTools command
- Brute-force protection now lives in the DB, not `localStorage` (a `localStorage.clear()` no longer resets the counter, it survives a refresh, and the patient portal is throttled too) — but it's still client-side: a determined user can edit the IndexedDB SQLite blob directly, and there is still no MFA
- No MFA, no row-level security, no patient consent flow, no right-to-be-forgotten, no data-residency controls
- A real DPO / compliance officer / hospital security team would (correctly) reject this

**To make this compliant you would need:** server-side session management with MFA, encryption at rest (DB-level + field-level for PHI), tamper-evident audit log on append-only storage (S3 Object Lock, immudb, etc.), patient consent module, deletion workflow, BAAs with all infrastructure providers.

### 3. Every clinical decision rule needs a licensed clinician to verify
All of the following were drafted with the help of an AI (Claude) drawing on its training data. **None of it has been reviewed by a board-certified physician, pharmacist, or clinical informaticist:**

- The drug class → cross-reactivity map (penicillin → amoxicillin/augmentin/etc.)
- The ACS protocol order set (aspirin 325 mg, troponin ×3, ECG within 10 min, etc.)
- NEWS2 thresholds (warn ≥5, escalate ≥7) and the SpO₂ Scale 1 / Scale 2 tables (Scale 2 is clinician-selected per admission for COPD/chronic hypercapnia, target 88–92%, to avoid alarm fatigue)
- qSOFA criteria
- Isolation precaution mappings (TB → airborne, MRSA → contact, etc.)
- High-alert medication list (insulin, opioids, heparin, warfarin, KCl, digoxin, methotrexate)
- The plain-English lab interpretations in the patient portal
- All allergen typo aliases and Levenshtein distance thresholds

**Before any clinical deployment**, every entry above needs:
- Review against your hospital's current formulary
- Review against the latest published guidelines (ACC/AHA, NICE, SCCM, IDSA, etc.)
- Adjustment for your local patient population
- Sign-off by a credentialed clinical informaticist

The bug-free code is necessary but not sufficient. **AI-generated clinical content is the riskiest part of any AI-assisted medical project, full stop.**

---

## ✅ What OpenWard actually IS, and is good for

- A **reference implementation** for what a fresh-grad-friendly EHR UX could look like
- A **teaching tool** for healthcare informatics students
- A **portfolio piece** showing what bilingual clinical UX + defense-in-depth safety patterns can look like
- A **starting point** for someone building a real HIS, who wants to inherit the UX patterns (safety banner, decline-with-reason, smart triggers, attention widget) without rebuilding them from scratch
- A **conversation piece** for "AI-assisted full-stack development"

The patterns it demonstrates are legitimate and worth studying:
- Universal "decline-with-reason" pattern → audit-logged overrides
- Safety banner with isolation + HAI + critical labs on every patient view
- "Patient story" one-line summary for instant context
- Smart triggers (chief complaint → suggest order set)
- Class-based allergy matching with typo fuzz
- 9 schema triggers + 8 partial unique indexes for DB-level defense
- Bilingual EN/AR with full RTL

---

## 🚀 Run it locally (30 seconds)

```bash
git clone https://github.com/EsmailELBoBDev2/openward.git
cd openward
python3 serve.py
```

Open <http://localhost:8080>.

Demo logins (all fictional, no real PHI):

| Role | Username | Password |
|---|---|---|
| IT Admin | `admin` | `admin123` |
| Hospital Manager | `manager` | `manager123` |
| ER Doctor | `dr.omar` | `er123` |
| Doctor | `dr.ahmed` | `doctor123` |
| Senior Nurse | `nurse.fatima` | `senior123` |
| Nurse | `nurse.mona` | `nurse123` |
| Pharmacist | `pharm.ali` | `pharm123` |

**Patient portal:** MRN `HIS-20260518-00028`, DOB `1981-03-15` (no portal password set yet, so MRN+DOB works — but a patient can now set a password, and it's **required once set**. MRN+DOB alone is wristband-printed *identity*, not authentication, so the portal prompts to set one on first login.)

---

## 🌐 Deploy as a static demo

Because OpenWard is 100% client-side, you can host the demo on any static host:

- **GitHub Pages** (recommended for FOSS demos — free, HTTPS, auto-deploys on push)
- Netlify, Vercel, Cloudflare Pages — same flow
- Your own server with any HTTP server

The QR scanner and NFC features require HTTPS (not plain HTTP) — GitHub Pages and the others all give you that.

**Live demo:** https://esmailelbobdev2.github.io/openward/

---

## 🏗️ Stack (and why it's a demo stack, not a production stack)

| Layer | What | Why it's fine for a demo / not OK for production |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS (+ CSP) | ✅ Same as any other webapp ✅ CSP `connect-src 'self'` blocks network-request exfiltration (fetch/beacon/image) even if a script is injected ❌ navigation exfil (`window.location`) and the injection itself still get through — closing both needs dropping `'unsafe-inline'` via a nonce refactor |
| State | `sql.js` (SQLite in WebAssembly) | ✅ Works in browser ❌ Single-device only; the whole DB lives in RAM and every save re-exports + re-encrypts the full blob, so memory spikes to a few × DB size and it OOMs at ~hundreds of MB on a mobile tab (real fix: a streaming VFS — wa-sqlite/OPFS — that writes only changed pages) |
| Persistence | IndexedDB (+ optional AES-GCM at rest, generational backups) | ✅ Survives reload ✅ Opt-in passphrase encryption ✅ Auto-recovers from a corrupt copy; minute/hour/day snapshots survive a burst of bad saves ❌ Wiped by a full cache clear or a console-capable insider, no cross-device sync, no off-device backup |
| Auth | Salted SHA-256 + localStorage session | ✅ Better than nothing ✅ Brute-force counter in the DB (not reset by `localStorage.clear()`) ❌ No MFA, whole DB blob is client-editable |
| Audit log | `audit_log` table with hash chaining | ✅ Backdating flagged in the signed chain (backward-vs-last + monotonic in-session drift) ✅ Exportable integrity receipt detects a full recompute internal verification can't ❌ Keyless chain (not a signature); a console-capable insider can still rewrite+recompute or wipe — real tamper-proofing needs off-device append-only storage |
| Charts | Chart.js | ✅ Real library |
| QR | qrcode.js + native BarcodeDetector | ✅ Modern web API |
| NFC | Web NFC (Chrome Android only) | ✅ Cool demo ❌ Not portable across browsers |

~21,000 lines total (17.3k JS + 2.2k CSS + 0.7k HTML).

---

## 🛡️ The patterns worth keeping (if you fork this)

These are the patterns I'd carry over to a real production HIS:

1. **`requireReasonToDecline(alert, contextKey, onAccept, onDecline)`** — universal pattern that every interruptive alert routes through, gives the user a way out but mandates a logged reason
2. **`renderSafetyBanner(patientId, admissionId, lang)`** — sticky bar that surfaces the high-risk facts (allergies, isolation, code status, HAI, unack crit labs) on every patient view
3. **`renderPatientStory(patientId, admissionId, lang)`** — one-sentence narrative summary, drastically reduces cognitive load for fresh grads
4. **`computeNurseAttention(admissionIds, nurseId)`** — top-N prioritized to-do for the current shift, surfaced on home view
5. **Smart triggers at registration** — regex on chief complaint → suggest matching order set with one-tap apply
6. **Schema triggers as defense-in-depth** — even if the UI is bypassed, the DB rejects implausible values
7. **`help(termKey)`** — inline (?) tooltips on jargon (NEWS2, qSOFA, ESI, etc.) → freshness-grad-friendly

These patterns are language-agnostic. Port them to your stack.

---

## 🌍 i18n

Every string is in `js/lang.js`. Two languages today (English + Arabic), full RTL support. Adding a third language = adding a key to each entry in the `LANG` object.

---

## 🧪 Tested workflows

11 personas walked through actual code paths during development. See `memory/` directory (in the conversation, not the repo) for details. The personas:

- Fresh-grad ICU nurse, 4 patients, morning routine + sepsis alarm
- ER resident at 2am with walk-in chest pain
- Senior consultant rounding on 12 patients
- Triage nurse with incoming STEMI ambulance
- Pharmacist with 30-Rx morning queue
- Senior nurse with 3 sick-callouts at shift start
- Code Blue activation
- Outgoing→incoming shift handoff
- Chronic CHF patient using portal at home
- Lab tech rejecting hemolyzed specimen
- Social worker planning discharge for elderly patient

15/15 runtime tests pass against the sql.js schema (vitals plausibility, fluid sign, lab time order, partial unique indexes, role enforcement, etc.). The tests verify code-level correctness — not clinical correctness.

---

## 🤝 Contributing

PRs welcome. The codebase has a table-of-contents comment at the top of `js/router.js` to help navigate the ~10k-line file.

Patterns to follow when contributing:
- **All clinical alerts use `requireReasonToDecline()`** — gives users an out but logs the reason
- **All SQL is parameterized** — never string-concat user input
- **All user-rendered fields (names, allergens, lab values, free text) go through `escapeHtml()`** — which escapes `< > & "`, so it is safe in both text and double-quoted attribute (`value="…"`) contexts
- **Custom dropdowns expose ARIA** (`role="listbox/option"`, `aria-activedescendant`) and **modals trap focus** (`installModalFocusTrap` in `utils.js`) — keyboard- and screen-reader-friendly
- **All schema changes go in `js/db.js` migration block** (the `if (saved) {...}` section) — auto-applies to existing installs
- **If you add a clinical decision rule**, cite the guideline source in a comment AND note that it needs MD review (the dose calculator and sepsis screen carry explicit "estimate / screening only — verify" caveats)

---

## 📜 License

MIT. Use it, fork it, ship it.

**Liability disclaimer:** This software is provided "as is" with no warranty. **It is NOT a medical device.** It has not been cleared by FDA, CE, SFDA, or any regulatory body. Do not use it for actual clinical decision-making without appropriate validation, training, regulatory review, and oversight.

---

## 🙏 Built with

[Claude](https://www.anthropic.com/claude) — ~60 hours of conversation, ~$60 in API tokens.

**Important context for clinicians:** the code is the result of human-AI collaboration, but the clinical content (drug interactions, protocol order sets, scoring thresholds, isolation precaution mappings, plain-English lab interpretations) was drafted by AI from training data and has **not** been reviewed by a board-certified physician or clinical pharmacist. Every clinical decision rule needs MD/PharmD verification before any real clinical use. See the "Read this first" section above.

Click the **OpenWard logo 5 times** in the running app to see the easter egg with full stats.

---

**Maintainer:** [@EsmailELBoBDev2](https://github.com/EsmailELBoBDev2)
