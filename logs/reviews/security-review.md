# Security review — 2026-08-09

Scope: forms, redirects, raw archive, generated output, dependencies, and CI permissions.

Resolved during review:

- The raw Tilda page with inline scripts and legacy forms is no longer emitted to `dist`.
- Lead forms no longer submit as no-JavaScript GET forms and no longer include query strings or fragments in the WhatsApp message.
- Consent text explicitly states the WhatsApp transfer; the message includes only the page pathname.
- Legacy redirect targets are compile-time literals and the generated fallback canonicals are contract-tested.
- `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities.

Residual external release gates:

- The owner must approve WhatsApp as the production processor or provide a first-party lead endpoint.
- The chosen host must supply TLS, redirect policy, and security headers documented in `docs/PRODUCTION_CUTOVER.md`.
- The privacy-policy text and authoritative opening hours need owner/legal confirmation.
