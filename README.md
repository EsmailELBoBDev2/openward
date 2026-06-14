# 🦷 OpenSmile

> **A FOSS dental-clinic management system.** Bilingual (English / العربية, full RTL).
> Odontogram charting, treatment plans, appointment & operatory scheduling, billing,
> recalls, an allergy-aware prescribing guard, and a patient portal — with a
> **fresh-grad-friendly UX** and a one-click **guided showcase** that walks a single
> patient through every role.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: Educational Demo](https://img.shields.io/badge/Status-Educational%20Demo-orange)]()
[![Bilingual](https://img.shields.io/badge/Lang-EN%20%2F%20%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-blue)]()

> **History:** OpenSmile began life as *OpenWard*, a hospital information system, and was
> repurposed into a dental clinic. The git repo is still named `openward`; the product is
> **OpenSmile**.

---

## ⚠️ Read this first — what OpenSmile is NOT

**This is a prototype, not a certified clinical product.** Do not deploy it to a real clinic,
real patients, or real PHI without significant review. Specifically:

- **It does NOT meet HIPAA, GDPR, or any healthcare-data regulation.** Optional AES-GCM
  encryption at rest exists (key derived from a device passphrase via PBKDF2-SHA256), and
  logout / 15-minute idle auto-logout purges the in-memory key — but it's opt-in, guards
  only data *at rest*, a forgotten passphrase is unrecoverable, and there's no managed key
  storage (KMS/HSM), no MFA, no row-level security, no patient-consent flow.
- **The clinical/billing content is AI-drafted demo data.** The procedure catalog and its
  **prices**, the drug formulary, the drug-interaction table, and the allergy
  cross-reactivity map were drafted with an AI from training data and have **not** been
  reviewed by a licensed dentist or pharmacist. Every entry needs professional sign-off and
  adjustment to your local formulary/fee schedule before any real use.
- The "blackbox" audit log is hash-chained (tamper-*evident*), but in browser mode it lives
  in the same IndexedDB an admin could wipe — real tamper-proofing needs off-device
  append-only storage (the LAN server keeps the HMAC key outside the DB, which is better).

**It is NOT a medical device** and has not been cleared by FDA, CE, SFDA, or any regulator.

---

## ✅ What OpenSmile IS, and is good for

- A **reference implementation** of a friendly dental-clinic EHR/PMS UX.
- A **teaching tool** for dental-informatics / health-IT students.
- A **portfolio piece** showing bilingual clinical UX + defense-in-depth safety patterns.
- A **starting point** for someone building a real dental PMS who wants to inherit the
  patterns (odontogram, treatment-plan builder, allergy-blocked prescribing, audit log,
  patient portal) without rebuilding them.

Patterns worth studying:
- **Odontogram** (FDI / ISO-3950 numbering): click a tooth to chart its status
  (caries/filled/crown/RCT/missing/implant/…), with a dated charting history.
- **Allergy-aware prescribing**: a class-based, typo-tolerant allergen matcher (incl. Arabic
  aliases) blocks an unsafe drug at the point of prescribing and logs any override with a reason.
- **Costed treatment plans** built from a procedure catalog, with planned-vs-completed totals.
- **Safety strip** on every patient screen surfacing allergies + flags (e.g. *on anticoagulant*).
- **Tamper-evident audit log** the clinic manager reviews — every action, who and when, hash-chained.
- **Schema triggers as defense-in-depth**: only a dentist id can sit in `prescriptions.doctor_id`,
  only clinical staff can author odontogram/perio rows — enforced in the DB, both modes.

---

## 👥 Roles (7)

| Role | Sees |
|---|---|
| **IT Admin** | Users, specialties & chairs, system settings |
| **Clinic Manager** | Dashboard (today's schedule, recalls due, collected vs. outstanding revenue, production by category) + the tamper-evident **audit log** |
| **Dentist** | Patient list, **odontogram**, treatment plans, appointments, safety-checked **prescribing** |
| **Dental Specialist** | Same clinical tools as the dentist + specialist referrals (ortho, oral surgery…) |
| **Dental Assistant / Hygienist** | Medical-history & allergy intake, cleanings, **perio charting** |
| **Receptionist** | Registration (creates the patient + MRN), scheduling, check-in queue, **billing**, recalls |
| **Patient Portal** | Their treatment plan, prescriptions, appointments, visits, messages, recall reminders |

---

## 🚀 Run it

**Standalone browser demo** (runs 100% in the browser; data lives in *this* browser's
IndexedDB only — a single-device demo, not a shared record):

```bash
python3 serve.py     # any static host works
```
Open <http://localhost:8080>, choose **Demo**, and either pick a role or start the guided tour.

**Shared — the LAN-server target** (one PC owns the database and serves it to staff browsers
on the LAN; no cloud, no internet):

```bash
node server/server.js                 # http://127.0.0.1:8080
# First run prints a one-time SETUP TOKEN; create the admin once:
#   curl -X POST 127.0.0.1:8080/api/setup -H 'Content-Type: application/json' \
#        -d '{"token":"<printed-token>","username":"admin","password":"<strong password>"}'
# Throwaway demo only (seeds known credentials):
#   OPENWARD_DEMO=1 OPENWARD_INSECURE_HTTP=1 node server/server.js
```

> ⚠️ **Never run `OPENWARD_DEMO=1` on a real clinic network or with real patients** — it
> seeds widely-known demo credentials. For any real deployment, omit it and create the first
> admin with the one-time setup token.

**🎬 Guided tour (the fastest way to see it):** a fresh demo offers the tour right after
setup. Press **Continue** and watch it drive the real forms across every role — **one
toothache, end to end**: reception registers the patient → the hygienist records a
**penicillin allergy** → the dentist charts caries on tooth 36, builds a costed plan, has an
**amoxicillin prescription blocked by the allergy guard**, prescribes clindamycin instead,
and completes the filling → reception invoices the visit and books a 6-month recall → the
**manager reviews the production dashboard and the tamper-evident audit log** → and the
patient signs into the portal and sees it all. Fully-automatic and hands-on modes are one
click away; nothing is mocked.

**Demo accounts** (browser **Demo** install / `OPENWARD_DEMO=1` server only):

| Role | Username | Password |
|---|---|---|
| IT Admin | `admin` | `HIS@2024` |
| Clinic Manager | `manager` | `manager123` |
| Dentist | `dr.omar` | `doctor123` |
| Specialist (Ortho) | `dr.sara` | `doctor123` |
| Specialist (Oral Surgery) | `dr.khalid` | `doctor123` |
| Hygienist | `hyg.mona` | `nurse123` |
| Receptionist | `reception` | `recept123` |

**Patient portal:** use the **Patient Portal** toggle with the demo patient's MRN + date of
birth (shown in the demo's patient list; the registered demo patient *Ahmed* is portal-enabled).

---

## 🏗️ Stack

Vanilla HTML/CSS/JS (+ CSP) · `sql.js` (SQLite in WebAssembly) · IndexedDB (browser mode) or a
~1.2k-line Node LAN server owning one SQLite DB (server mode) · PBKDF2-HMAC-SHA256 auth ·
hash-chained audit log · Chart-free dashboards · qrcode.js + native BarcodeDetector. No
build step, no framework, no runtime dependencies.

The browser and the server **share the same schema builder and the same allergy matcher**
(`js/db.js`, `js/allergy-check.js`), so a rule fixed once holds in both modes.

---

## 🧪 Tests

`npm test` runs the Node suite (preflight + `test/test_*.js`), all green. It executes the
**real source** (reverting the code breaks the test). Highlights:

- `test_dental.js` — the dental schema (dental tables present, hospital tables gone,
  `prescriptions` patient-linked), the **role triggers** (a dentist can prescribe / a
  receptionist can't; only clinical staff chart teeth; only a dentist authors a plan),
  odontogram + treatment-plan round-trips, and the **allergy guard**
  (penicillin-allergic + amoxicillin → blocked; + clindamycin → allowed).
- `test_allergy.js` — class-based + Arabic allergen matching and drug-vs-condition guards.
- `test_first_run.js` — production installs come up with **zero default credentials**, an
  interrupted first run can't brick the install, and the guided tour drives the real handlers.
- `test_jsattr.js` / `test_html.js` / preflight — XSS-pattern and structural gates.
- crypto, audit-receipt, snapshot-rotation, lockout, remanence, logout-purge, dark-mode,
  LAN-sync, incident-report, problem-list suites.

`npm run preflight` is the structural HTML/JS corruption gate (also run in CI).

---

## 🌍 i18n

Every string lives in `js/lang.js` (English + Arabic, full RTL). Adding a third language =
adding a key to each entry.

---

## 📜 License

MIT. Use it, fork it, ship it. **No warranty. Not a medical device.** Validate the clinical
and billing content with licensed professionals before any real use.

**Maintainer:** [@EsmailELBoBDev2](https://github.com/EsmailELBoBDev2) · built with
[Claude](https://www.anthropic.com/claude).
