# เชฟจิว
สมุดสูตรส่วนตัว โทนม่วงพาสเทล เริ่มต้นไม่มีเมนู รองรับ JSON / .chefjewe และปริมาณแบบช่วง

## Hosting
Cloudflare Pages project `chefjewe`, Git branch `chefjewe`, root `chefjewe`, output `public`, no build command.
Pages advanced-mode `public/_worker.js` serves the interface and authenticated API.

D1 binding `DB` uses a dedicated `chefjewe` database. Apply `schema.sql` before deploying.
Server environment secrets: `PASS_VERIFIER` (PBKDF2 salt/hash/iterations JSON) and `SESSION_SECRET` (random signing key). Never commit their values or the passphrase.

## Data
Recipes are encrypted in the browser using PBKDF2 and AES-GCM. Server login adds an HttpOnly Secure session cookie. Failed login attempts are limited in D1. Writes use atomic revision checks.
Existing ChongPan services and databases are separate. No source recipes are automatically imported.

## Updating
Commit changes to `chefjewe/public/_worker.js` on branch `chefjewe`; Cloudflare builds and deploys from GitHub. Do not edit the main or ordering branches for this site.

## Ingredient pictures and Android exchange (28 October 2026)

The ingredient table includes standalone ledger entries, thumbnails, a dedicated
ingredient JSON import preview and an Android-compatible export with embedded
images. Imported photos take precedence over the checked-in product pictures.
The preview preserves existing prices/photos by default, fills missing photos,
and provides separate options to replace photos or update positive purchase
prices. Zero prices and blank photos never clear an existing value. A native
website snapshot is downloaded before applying an ingredient import.

Ingredient exports use `chef-jewe` version 1 with `recipes: []`, packet quantities,
purchase units/prices, unit weights, groups and Base64 JPEG/PNG/WebP photos.
The previous website ingredient JSON format remains accepted. Full recipe and
category exports also include available ingredient photos. Unused ingredients
are retained by full exports. No database schema, secret, login or encryption
settings were changed.

Product images in `public/ingredient-images/` are verified raster derivatives;
`photo-catalogue.json` records their source pages, original URLs and whether an
image is illustrative. They supplement missing pictures and do not update prices
or imply a new supplier. Unknown products retain a missing-photo placeholder and
can receive the owner's actual picture through Android import.

After editing `photo-interop.js` or the catalogue, run
`node scripts/build-photo-interop.cjs`. The helper embeds the readable source into
the existing advanced-mode Worker. Run `npm ci && npm test` for data, DOM and
whole-Worker syntax checks. Ingredient import accepts files up to 20 MiB, individual
photos up to 4 MiB, and a combined plaintext state of at most 12 MiB to fit the
existing encrypted state endpoint. Oversized imports fail before saving.
