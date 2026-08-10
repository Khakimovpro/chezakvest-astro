# Code review — 2026-08-09

Scope: final Astro routes, SEO helpers, internal links, schema, and conversion paths.

Resolved during review:

- Route URLs and sitemap/canonicals use the selected trailing-slash form.
- JSON-LD now uses route URLs and asset URLs through separate helpers; image and logo filenames do not acquire a trailing slash.
- Holiday current-page anchors, the `vypusknoj-kalmar` `ob-igre` target, and horror CTAs point to real destinations.
- Legacy fallback pages import their visible fallback styles.
- The raw Tilda snapshot is excluded from the public route tree.

Result: no confirmed code-level release blocker remains. The host must still implement the documented legacy redirects if direct 301/308 behavior is required before GitHub Pages' directory normalization.
