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
