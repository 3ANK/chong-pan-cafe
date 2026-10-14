# ชง&ปั่น — LINE ordering v2 (safe replacement staging)

New dedicated Cloudflare Pages + Functions + D1 project; original `chongpan-members` and dormitory app are **not changed**.

## Current stage

- Shop checkout is **OFF** by design until owner verifies LINE Login endpoint, the current Loyverse catalog, pricing, and payments. This is an operational safeguard, not a bug.
- Menu seed includes **38 products** with documented historical prices from October 2026. This is not the full latest live catalog (the original used about 90 Loyverse SKU). Do **not** declare the clone complete or turn on production orders until the current catalog is verified/imported.
- Point rule: 1 point for each full 25 THB of an order when it is completed; no fractional carry. Points are stored in D1 only, not imported from old Site.
- Owner view requires authenticated LINE user ID to match server-side `OWNER_LINE_USER_ID`. Client cannot choose owner status.
- Client never supplies trusted price. Server calculates totals from D1; all order mutations validate sessions and same-origin requests.

## Infrastructure

- Cloudflare Pages project: `chongpan-ordering-v2` (separate from `phaksakul-dorm`)
- Cloudflare D1: `chongpan-orders-v2` with `DB` binding
- GitHub source: maintain in isolated branch until a standalone repository is established; do not commit this app onto `chong-pan-cafe` main.
- Migration files: `migrations/001_schema.sql` and `migrations/002_seed_recovered_catalog.sql` (run in order on **new database only**)
- Static frontend: `index.html`, `styles.css`, `app.js`; Cloudflare Pages function: `functions/api/[[path]].js`

## Required production config (set only on Cloudflare, never commit keys)

- `LINE_CHANNEL_ID` — LINE Login Channel ID (from the existing record: `2011951537`)
- `LIFF_ID` — new/updated LIFF endpoint ID. The existing LIFF ID must have its endpoint reconfigured to the new site URL before using it.
- `SESSION_SECRET` — random 32+ byte signing secret
- `OWNER_LINE_USER_ID` — owner account LINE user ID, from private owner config
- `LINE_MESSAGING_ACCESS_TOKEN` — optional push notifications to owner
- `SHOP_ENABLED` = `true` AND D1 `shop_settings.shop_enabled` = `1`, only after complete end-to-end tests

## API

- `GET /api/health` — health + readiness flag
- `GET /api/menu` — public menu, prices from DB, explicit checkout enabled flag
- `POST /api/auth/line` — verify LINE ID Token via LINE's official API, issue signed HttpOnly session cookie
- `GET /api/me` — authenticated LINE member / points / owner flag
- `GET/POST /api/orders` — member orders / create validated new order
- `GET /api/admin/orders` — owner only
- `PATCH /api/admin/orders` — owner only, strict transitions, points on completed order
- `PATCH /api/admin/menu` — owner only price/stock update

## Go-live checklist

1. Import the complete current catalog from Loyverse and validate images, prices and modifiers against source. Historical 38-product seed is only a partial recovery.
2. Configure the new site URL as LINE Login callback/LIFF endpoint; test in the LINE client and normal browsers.
3. Configure server-only secrets, verify owner admin access, run test orders and audit notifications without charging real customers.
4. Back up original customer member/points/order data if the old account becomes available. New D1 currently has no migrated members or past orders.
5. Make a backup, configure payment QR and delivery workflow, then explicitly enable checkout in env + DB.
6. Only after approval update the existing LINE rich menu / ordering URL. Never overwrite original website automatically.

## Build & test

This app is plain static HTML/CSS/JS with a Cloudflare Pages Function, no npm dependencies. Check JavaScript syntax with:

```sh
node --check app.js
node --check 'functions/api/[[path]].js'
```

No credentials, tokens, customer databases, or encrypted recipes are in this repository.