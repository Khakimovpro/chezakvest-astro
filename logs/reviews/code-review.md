# Code review — 2026-08-09

Scope: final Astro routes, SEO helpers, internal links, schema, and conversion paths.

Resolved during review:

- Route URLs and sitemap/canonicals use the selected trailing-slash form.
- JSON-LD now uses route URLs and asset URLs through separate helpers; image and logo filenames do not acquire a trailing slash.
- Holiday current-page anchors, the `vypusknoj-kalmar` `ob-igre` target, and horror CTAs point to real destinations.
- Legacy fallback pages import their visible fallback styles.
- The raw Tilda snapshot is excluded from the public route tree.

Result: no confirmed code-level release blocker remains. The host must still implement the documented legacy redirects if direct 301/308 behavior is required before GitHub Pages' directory normalization.

## Parity source-artboard review — 2026-08-11

Scope: source-backed campaign artboards, route-local carousels, parity capture, and generated production output.

Resolved findings:

- Artboard rails that clipped locally mirrored source cards now expose touch, keyboard, arrow, and dot navigation without changing their captured first frame.
- T396 hall galleries retain every local source image through accessible controls and reduced-motion-safe deterministic capture behaviour.
- The source-artboard section inspector now preserves explicit record boundaries and legacy artboard wrappers without weakening visual thresholds.
- A footer route in `KalmarLandingArtboard` now uses the shared base-aware URL helper, so the GitHub Pages build does not bypass `SITE_BASE`.
- The visual checker recognises generated legacy redirect paths as valid internal links; the redirect target contract remains the authority for the actual mapping.
- Supplementary per-section screenshots now time out rather than indefinitely blocking a full-page capture; mandatory full-page evidence is not downgraded.

Follow-up: the post-fix full-round visual gate remains pending. Final release status must use the final round rather than this review.
