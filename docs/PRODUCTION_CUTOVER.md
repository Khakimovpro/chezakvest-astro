# Production cutover

The repository has a repeatable release path to the configured Moscow server. The operational
entry point, [`deploy/README.md`](../deploy/README.md), documents how `deploy/deploy.sh` verifies
and builds `dist/`, publishes an atomic release, installs the nginx configuration, and runs HTTP
smoke checks. Until the owner switches DNS, `http://82.146.60.212` remains a noindex staging
endpoint and the current production domain continues to be served by Tilda. The prepared DNS,
TLS, and rollback cutover through `deploy/enable-domain.sh` is documented in
[`deploy/DOMEN.md`](../deploy/DOMEN.md). CI verifies artifacts and can publish the GitHub Pages
preview; it does not deploy to the Moscow server or change DNS.

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

## Generated legacy redirect map

`migration/legacy-url-map.csv` is the source of truth for every audited hidden
Tilda URL and the consolidated Wednesday duplicate. Generate `public/_redirects`,
the root `.htaccess`, `docs/nginx-legacy-redirects.conf`, and this table with
`node migration/build_legacy_redirects.mjs`; use
`node migration/build_legacy_redirects.mjs --check` in CI. `_redirects` is for
Cloudflare Pages/Netlify-style static hosts; deploy `.htaccess` beside `dist/` on
Apache (with `mod_rewrite` and `AllowOverride FileInfo`), or include the nginx
file inside the relevant `server` block. Rows marked `301 + fallback` also have a
static noindex route for GitHub Pages, where server-side redirects are unavailable.
The `200` rows are already published at their canonical paths and deliberately
produce no self-redirect. The checked-in
`migration/legacy-url-audit-snapshot.csv` freezes the 102 audited source paths so
the test suite can enforce complete coverage without relying on an external crawl
artifact.

<!-- LEGACY_REDIRECTS:START -->
| Source | Target | Status | Reason |
| --- | --- | --- | --- |
| `/agent` | `/contacts/` | 301 | Retired agency request form returns visitors to contacts. |
| `/agregator/bez-api-kvesthunter` | `/kvesty-v-rostove-na-donu/` | 301 | Retired KvestHunter aggregator page returns visitors to the catalog. |
| `/agregator/bez-api-kvesttam` | `/kvesty-v-rostove-na-donu/` | 301 | Retired KvestTam aggregator page returns visitors to the catalog. |
| `/aimg` | `/` | 301 | Retired image utility page returns visitors to the homepage. |
| `/alias-block` | `/` | 301 | Retired Tilda alias-block utility page returns visitors to the homepage. |
| `/alkatraz-hunter` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Alcatraz quest has no matching migrated page; send visitors to the catalog. |
| `/alkatraz-kvesttam` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Alcatraz quest has no matching migrated page; send visitors to the catalog. |
| `/amongus-land` | `/amongus-land/` | 200 | Published Among Us campaign landing owns its canonical URL. |
| `/annabel-hunter` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Annabelle quest has no matching migrated page; send visitors to the catalog. |
| `/annabel-kvesttam` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Annabelle quest has no matching migrated page; send visitors to the catalog. |
| `/bank-hunter` | `/kvest_v_realnosti_ograblenie_banka_bumazhniy_dom/` | 301 | KvestHunter alias for the matching Bank Heist quest. |
| `/bank-kvesttam` | `/kvest_v_realnosti_ograblenie_banka_bumazhniy_dom/` | 301 | KvestTam alias for the matching Bank Heist quest. |
| `/dikiy-hunter` | `/kvest_v_realnosti_zapad/` | 301 | KvestHunter alias for the matching Wild West quest. |
| `/dikiy-kvesttam` | `/kvest_v_realnosti_zapad/` | 301 | KvestTam alias for the matching Wild West quest. |
| `/drakula-kvesttam` | `/kvest_v_realnosti_zamok_drakuly/` | 301 | KvestTam alias for the matching Dracula Castle quest. |
| `/error` | `/` | 301 | Retired Tilda error page returns visitors to the homepage. |
| `/fantom-hunter` | `/kvest_v_realnosti_fantom/` | 301 | KvestHunter alias for the matching Fantom quest. |
| `/fantom-kvesttam` | `/kvest_v_realnosti_fantom/` | 301 | KvestTam alias for the matching Fantom quest. |
| `/garri-hunter` | `/kvest_v_realnosti_garri_potter_/` | 301 | KvestHunter alias for the matching Harry Potter quest. |
| `/garri-kvesttam` | `/kvest_v_realnosti_garri_potter_/` | 301 | KvestTam alias for the matching Harry Potter quest. |
| `/header` | `/` | 301 | Retired Tilda header utility page returns visitors to the homepage. |
| `/igra-v-kalmara-lend` | `/igra-v-kalmara-lend/` | 200 | Published Squid Game campaign landing owns its canonical URL. |
| `/kids_spasibo` | `/kids/` | 301 | Retired children's thank-you page returns to the party landing. |
| `/krestrazh-hunter` | `/kvest_v_realnosti_harry_potter_i_krestrazh/` | 301 | KvestHunter alias for the matching Harry Potter Horcrux quest. |
| `/krestrazh-kvesttam` | `/kvest_v_realnosti_harry_potter_i_krestrazh/` | 301 | KvestTam alias for the matching Harry Potter Horcrux quest. |
| `/madagaskar-hunter` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Madagascar quest has no matching migrated page; send visitors to the catalog. |
| `/madagaskar-kvesttam` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Madagascar quest has no matching migrated page; send visitors to the catalog. |
| `/minecraft-lend` | `/minecraft-lend/` | 200 | Published Minecraft campaign landing owns its canonical URL. |
| `/new-year` | `/new-year/` | 200 | Published current New Year campaign owns its canonical URL. |
| `/new-year-2025` | `/new-year/` | 301 + fallback | Retired seasonal landing redirects to the current New Year campaign. |
| `/noch-hunter` | `/kvest_v_realnosti_noch_v_museum_ograblenie/` | 301 | KvestHunter alias for the matching Night at the Museum quest. |
| `/noch-kvesttam` | `/kvest_v_realnosti_noch_v_museum_ograblenie/` | 301 | KvestTam alias for the matching Night at the Museum quest. |
| `/ono-hunter` | `/ono/` | 301 | KvestHunter alias for the matching IT quest. |
| `/ono-kvesttam` | `/ono/` | 301 | KvestTam alias for the matching IT quest. |
| `/page10719803.html` | `/` | 301 | Legacy numeric alias for the homepage. |
| `/page131787606.html` | `/` | 301 | Retired image utility page returns visitors to the homepage. |
| `/page17601643.html` | `/kvesty-v-rostove-na-donu/` | 301 | Retired KvestHunter aggregator page returns visitors to the catalog. |
| `/page17601875.html` | `/kvest_v_realnosti_ograblenie_banka_bumazhniy_dom/` | 301 | KvestHunter alias for the matching Bank Heist quest. |
| `/page17602182.html` | `/kvest_v_realnosti_sherlock_holms/` | 301 | KvestHunter alias for the matching Sherlock Holmes quest. |
| `/page17602241.html` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Alcatraz quest has no matching migrated page; send visitors to the catalog. |
| `/page17602499.html` | `/kvest_v_realnosti_fantom/` | 301 | KvestHunter alias for the matching Fantom quest. |
| `/page17602532.html` | `/kvest_v_realnosti_zapad/` | 301 | KvestHunter alias for the matching Wild West quest. |
| `/page17602569.html` | `/kvest_v_realnosti_psihbolnitsa/` | 301 | KvestHunter alias for the matching Psychiatric Hospital quest. |
| `/page17602664.html` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Madagascar quest has no matching migrated page; send visitors to the catalog. |
| `/page17602693.html` | `/kvest_v_realnosti_garri_potter_/` | 301 | KvestHunter alias for the matching Harry Potter quest. |
| `/page17602725.html` | `/pirati/` | 301 | KvestHunter alias for the matching Pirates quest. |
| `/page17602753.html` | `/ono/` | 301 | KvestHunter alias for the matching IT quest. |
| `/page17602790.html` | `/kvest_v_realnosti_zamok_drakuly/` | 301 | KvestHunter alias for the matching Dracula Castle quest. |
| `/page17602829.html` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Annabelle quest has no matching migrated page; send visitors to the catalog. |
| `/page17602893.html` | `/kvest_v_realnosti_dom_prizrakov/` | 301 | KvestHunter alias for the matching Ghost House quest. |
| `/page17602934.html` | `/kvest_v_realnosti_noch_v_museum_ograblenie/` | 301 | KvestHunter alias for the matching Night at the Museum quest. |
| `/page17602969.html` | `/kvest_v_realnosti_harry_potter_i_krestrazh/` | 301 | KvestHunter alias for the matching Harry Potter Horcrux quest. |
| `/page17604184.html` | `/kvesty-v-rostove-na-donu/` | 301 | Retired KvestTam aggregator page returns visitors to the catalog. |
| `/page17604510.html` | `/kvest_v_realnosti_ograblenie_banka_bumazhniy_dom/` | 301 | KvestTam alias for the matching Bank Heist quest. |
| `/page17604543.html` | `/kvest_v_realnosti_sherlock_holms/` | 301 | KvestTam alias for the matching Sherlock Holmes quest. |
| `/page17604674.html` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Alcatraz quest has no matching migrated page; send visitors to the catalog. |
| `/page17604718.html` | `/kvest_v_realnosti_fantom/` | 301 | KvestTam alias for the matching Fantom quest. |
| `/page17604750.html` | `/kvest_v_realnosti_zapad/` | 301 | KvestTam alias for the matching Wild West quest. |
| `/page17605141.html` | `/kvest_v_realnosti_psihbolnitsa/` | 301 | KvestTam alias for the matching Psychiatric Hospital quest. |
| `/page17605205.html` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Madagascar quest has no matching migrated page; send visitors to the catalog. |
| `/page17605245.html` | `/kvest_v_realnosti_garri_potter_/` | 301 | KvestTam alias for the matching Harry Potter quest. |
| `/page17605296.html` | `/pirati/` | 301 | KvestTam alias for the matching Pirates quest. |
| `/page17605327.html` | `/ono/` | 301 | KvestTam alias for the matching IT quest. |
| `/page17605351.html` | `/kvest_v_realnosti_zamok_drakuly/` | 301 | KvestTam alias for the matching Dracula Castle quest. |
| `/page17605385.html` | `/kvesty-v-rostove-na-donu/` | 301 | Retired Annabelle quest has no matching migrated page; send visitors to the catalog. |
| `/page17605408.html` | `/kvest_v_realnosti_dom_prizrakov/` | 301 | KvestTam alias for the matching Ghost House quest. |
| `/page17605454.html` | `/kvest_v_realnosti_noch_v_museum_ograblenie/` | 301 | KvestTam alias for the matching Night at the Museum quest. |
| `/page17605476.html` | `/kvest_v_realnosti_harry_potter_i_krestrazh/` | 301 | KvestTam alias for the matching Harry Potter Horcrux quest. |
| `/page40355277.html` | `/` | 301 | Retired Tilda block archive returns visitors to the homepage. |
| `/page41891214.html` | `/prazdniki-pod-kluch/` | 301 | Legacy numeric alias for the published turnkey party landing. |
| `/page48039931.html` | `/` | 301 | Retired Tilda error page returns visitors to the homepage. |
| `/page48687287.html` | `/` | 301 | Retired thank-you page returns visitors to the homepage. |
| `/page51322757.html` | `/privacy/` | 301 | Legacy numeric alias for the published privacy policy. |
| `/page52903497.html` | `/contacts/` | 301 | Retired agency request form returns visitors to contacts. |
| `/page56207935.html` | `/kvesty-v-rostove-na-donu/` | 301 | Retired quest-cart utility page returns visitors to the catalog. |
| `/page56559131.html` | `/` | 301 | Retired loyalty-form utility page returns visitors to the homepage. |
| `/page57141531.html` | `/` | 301 | Retired certificate-form utility page returns visitors to the homepage. |
| `/page57307963.html` | `/minecraft/` | 301 | Legacy numeric alias for the Minecraft landing. |
| `/page59359589.html` | `/new-year/` | 301 | Legacy numeric alias for the current New Year landing. |
| `/page62529067.html` | `/kids/` | 301 | Retired children's thank-you page returns to the party landing. |
| `/page63266477.html` | `/igra_v_kalmara/` | 301 | Legacy numeric alias for the Squid Game landing. |
| `/page64505705.html` | `/roblox/` | 301 | Legacy numeric alias for the Roblox landing. |
| `/page69116991.html` | `/among_us/` | 301 | Legacy numeric alias for the Among Us landing. |
| `/page71881007.html` | `/` | 301 | Retired Tilda alias-block utility page returns visitors to the homepage. |
| `/page7266054.html` | `/` | 301 | Retired Tilda header utility page returns visitors to the homepage. |
| `/page7837595.html` | `/` | 301 | Retired Tilda script utility page returns visitors to the homepage. |
| `/page87839976.html` | `/new-year/` | 301 | Legacy numeric alias for the current New Year landing. |
| `/pirate-hunter` | `/pirati/` | 301 | KvestHunter alias for the matching Pirates quest. |
| `/pirate-kvesttam` | `/pirati/` | 301 | KvestTam alias for the matching Pirates quest. |
| `/pl` | `/` | 301 | Retired loyalty-form utility page returns visitors to the homepage. |
| `/prazdniki-pod-kluch` | `/prazdniki-pod-kluch/` | 200 | Captured turnkey party landing is published at its canonical path. |
| `/privacy` | `/privacy/` | 200 | Already published at its canonical path; no redirect is emitted. |
| `/prizrak-hunter` | `/kvest_v_realnosti_dom_prizrakov/` | 301 | KvestHunter alias for the matching Ghost House quest. |
| `/prizrak-kvesttam` | `/kvest_v_realnosti_dom_prizrakov/` | 301 | KvestTam alias for the matching Ghost House quest. |
| `/psihbolnica-kvesttam` | `/kvest_v_realnosti_psihbolnitsa/` | 301 | KvestTam alias for the matching Psychiatric Hospital quest. |
| `/psihbolniza-hunter` | `/kvest_v_realnosti_psihbolnitsa/` | 301 | KvestHunter alias for the matching Psychiatric Hospital quest. |
| `/roblox-land` | `/roblox-land/` | 200 | Published Roblox campaign landing owns its canonical URL. |
| `/sherlok-hunter` | `/kvest_v_realnosti_sherlock_holms/` | 301 | KvestHunter alias for the matching Sherlock Holmes quest. |
| `/sherlok-kvesttam` | `/kvest_v_realnosti_sherlock_holms/` | 301 | KvestTam alias for the matching Sherlock Holmes quest. |
| `/spasibo` | `/` | 301 | Retired thank-you page returns visitors to the homepage. |
| `/sv` | `/` | 301 | Retired certificate-form utility page returns visitors to the homepage. |
| `/wednesday_ukradennaya_vesch` | `/wednesday-poteryannaya-dusha/` | 301 + fallback | Tilda captures are duplicate; consolidate on the retained Wednesday page. |
| `/zamok-hunter` | `/kvest_v_realnosti_zamok_drakuly/` | 301 | KvestHunter alias for the matching Dracula Castle quest. |
<!-- LEGACY_REDIRECTS:END -->

## Host cutover checklist

1. Publish a verified `dist/` artifact to the configured Moscow host with
   `deploy/deploy.sh`. Do not use the GitHub Pages preview artifact as production.
2. Attach `чезаквест.рф` and its punycode equivalent
   `xn--80aehcht5ci1b.xn--p1ai` at the host, issue TLS, and choose one HTTPS
   canonical host. Redirect HTTP and every alternate host to it with a permanent
   redirect.
3. Keep production at the domain root: do not set `SITE_BASE` for the custom-domain
   release. `SITE_BASE` is only for GitHub Pages project previews.
4. Configure host-level permanent redirects from the generated artifact for the
   chosen host: `public/_redirects` for Cloudflare Pages/Netlify-style static
   hosts, root `.htaccess` deployed beside `dist/` for Apache, or
   `docs/nginx-legacy-redirects.conf` included inside nginx's `server` block.
   The Apache and nginx forms use exact path matches and retain query strings. On
   Netlify, force all `301 + fallback` rows (`301!` or `force = true`) so
   their static fallback file cannot shadow the server redirect. Static fallbacks
   keep those explicitly marked paths available on GitHub Pages, which cannot
   create server-side redirects itself.
5. Set platform security headers at the CDN/host layer: HSTS (after TLS is proven),
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
   `X-Frame-Options: SAMEORIGIN`, and a CSP tested against the inline Astro assets.
   Do not enable a CSP blindly: this site intentionally uses inline CSS and scripts.
6. Run the public smoke check below before switching traffic, then re-run it after
   DNS propagation: verify `/`, `robots.txt`, `sitemap.xml`, all sitemap URLs,
   `/privacy`, every legacy path with a `301` status, forms, canonical URLs,
   JSON-LD, and the HTTP/HTTPS/www redirect matrix.
7. Submit the new sitemap only after the preceding checks pass. Retain the Tilda
   hosting configuration until the new host passes the same checks and a rollback
   route is agreed.

## Required owner inputs before DNS changes

The canonical list of external facts and their delivery impact is
[`OWNER_INPUTS.md`](OWNER_INPUTS.md). The build pipeline must not infer any of them.

## Public smoke command

After the domain cutover, run the following from this repository against the new host
(not the previous Tilda host):

```bash
SITE_ORIGIN=https://xn--80aehcht5ci1b.xn--p1ai npm run verify:live
```

For the production cutover, require server redirects explicitly:

```bash
SITE_ORIGIN=https://xn--80aehcht5ci1b.xn--p1ai REQUIRE_SERVER_REDIRECTS=1 npm run verify:live
```

The command follows no redirects while testing the sitemap and every generated
`301` path, so an unexpected 404 or cross-origin redirect fails loudly. The
strict production command also rejects a static fallback that shadows a required
server-side redirect. Without `REQUIRE_SERVER_REDIRECTS=1`, it additionally
supports GitHub Pages' one-time slash normalization followed by the noindex static
fallback with the mapped canonical. The remaining HTTP/HTTPS/www redirects and
lead submission must still be checked manually in a real browser because they
depend on the configured host and lead channel.
