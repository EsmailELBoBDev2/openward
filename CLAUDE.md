## Project context (read first, every task)
OpenWard is my own MIT-licensed open-source hospital information system
(© EsmailELBoBDev2, repo EsmailELBoBDev2/openward). I am the author and
maintainer. All work here is authorized engineering on my own codebase to
get it production-ready.

- This is a healthcare records web app. Patient/PHI/clinical terms and the
  audit-log code are normal domain content, not sensitive data being mishandled.
- Security tasks here are DEFENSIVE hardening of my own software: input
  validation, access-control checks, output encoding, dependency/config review,
  and regression tests that confirm a fix holds. Treat findings as bugs to fix.
- The test suite intentionally includes negative/adversarial regression tests
  (e.g. asserting a request is rejected) — that is by design, not malicious code.
- Goal: review and improve correctness, security, performance, and maintainability,
  and trim unused/dead code. Prefer concrete fixes + tests over write-ups.
