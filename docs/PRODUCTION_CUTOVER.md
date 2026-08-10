# Production cutover

The repository deliberately contains no workflow that publishes to production. The
current production domain is still served by Tilda, and a safe deployment requires
the owner-controlled DNS/hosting target and a repository with Pages (or another
static-hosting) configuration. CI always produces a verified `dist/` artifact; it
never deploys or changes DNS.

## Release gate

Use Node `22.22.1` (or a supported Node 22 release) and run:

```bash
npm ci
npm run ci
```

The gate runs unit tests, root and GitHub Pages project-base static builds,
`scripts/production-contract.mjs`, and `npm audit --omit=dev --audit-level=high`.
It verifies the public build contains `robots.txt`, `sitemap.xml`, canonical and
social metadata, schema and breadcrumb structure, internal routes and anchors, the
five migrated P0 paths, valid lead-form markup, and the absence of the raw Tilda
archive from the public artifact.

## Host cutover checklist

1. Configure the host to publish the CI `dist/` artifact from the selected GitHub
   repository. Do not use the password-encrypted preview artifact as production.
2. Attach `чезаквест.рф` and its punycode equivalent
   `xn--80aehcht5ci1b.xn--p1ai` at the host, issue TLS, and choose one HTTPS
   canonical host. Redirect HTTP and every alternate host to it with a permanent
   redirect.
3. Keep production at the domain root: do not set `SITE_BASE` for the custom-domain
   release. `SITE_BASE` is only for GitHub Pages project previews.
4. Configure host-level permanent redirects for the four legacy landing URLs when
   the platform supports them. The generated static fallback pages keep those paths
   available on GitHub Pages, which cannot create server-side redirects itself.
5. Set platform security headers at the CDN/host layer: HSTS (after TLS is proven),
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
   `X-Frame-Options: SAMEORIGIN`, and a CSP tested against the inline Astro assets.
   Do not enable a CSP blindly: this site intentionally uses inline CSS and scripts.
6. Run the public smoke check below before switching traffic, then re-run it after
   DNS propagation: verify `/`, `robots.txt`, `sitemap.xml`, all sitemap URLs,
   `/privacy`, the four legacy paths, forms, canonical URLs,
   JSON-LD, and the HTTP/HTTPS/www redirect matrix.
7. Submit the new sitemap only after the preceding checks pass. Retain the Tilda
   hosting configuration until the new host passes the same checks and a rollback
   route is agreed.

## Required owner inputs before DNS changes

- The intended static hosting provider and repository/Pages configuration.
- DNS access and the desired canonical hostname.
- The authoritative business contact and opening-hours registry, plus approval of
  the privacy-policy text.
- A real lead-delivery endpoint or confirmation that the configured WhatsApp route
  is the production lead channel.

These are external business and infrastructure facts; they must not be guessed by
the build pipeline.

## Public smoke command

After the host is configured, run the following from this repository against the
new host (not the previous Tilda host):

```bash
SITE_ORIGIN=https://xn--80aehcht5ci1b.xn--p1ai npm run verify:live
```

The command follows no redirects while testing the sitemap and P0 paths, so an
unexpected 404 or cross-origin redirect fails loudly. It accepts a `301`/`308`
legacy redirect to its mapped replacement, or GitHub Pages' one-time slash
normalization followed by the noindex static fallback with the mapped canonical.
The remaining HTTP/HTTPS/www redirects and lead submission must still be checked
manually in a real browser because they depend on the chosen host and lead channel.
