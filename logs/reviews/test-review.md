# Test review — 2026-08-09

Resolved test gaps:

- The production contract now checks trailing-slash sitemap/canonicals, legacy target canonicals and noindex, no public raw Tilda archive, valid lead-form markup, JSON-LD semantics, internal routes, and internal fragment targets.
- The live smoke permits only permanent legacy redirects and supports the one GitHub Pages slash-normalization hop before a checked static fallback.
- CI verifies both root and GitHub Pages project-base builds.

Evidence:

- `npm run ci`: 20 tests pass; 64 generated HTML pages pass the production contract; production dependency audit is clean.
- Browser smoke passed for form validation and keyboard submission, WhatsApp URL privacy, tabs, slider, mobile burger behavior, privacy/noindex, legacy fallback, and structured-data asset URLs.
- Local Lighthouse on the home page: Performance 97, Accessibility 100, Best Practices 100, SEO 100; CLS 0 and TBT 0 ms.

The live host smoke remains intentionally post-cutover because it requires the owner-selected DNS and static host.
