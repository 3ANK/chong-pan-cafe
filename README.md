# ชง&ปั่น — LINE ordering v2 (safe replacement staging)

New dedicated Cloudflare Pages + Functions + D1 project; original `chongpan-members` and dormitory app are **not changed**.

## Current stage

- Shop checkout is **OFF** by design until owner verifies LINE Login endpoint, the current Loyverse catalog, pricing, and payments. This is an operational safeguard, not a bug.
- Catalogue migration now stages **90 entries**, of which **seven are disabled drafts with unknown prices** (IDs 84–90). The original 83 recovered entries also require owner price review. This is not the full latest live catalog (the original used about 90 Loyverse SKU). Do **not** declare the clone complete or turn on production orders until the current catalog is verified/imported.
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

## 2026-10-14 — Migration staging (old loyalty points)

- Existing LIFF on the original LINE Login Channel may be reused **after changing the LIFF Endpoint in LINE Developers to https://chongpan-ordering-v2.pages.dev**. Changing Cloudflare's `LIFF_ID` alone is not enough; this LINE Console operation has NOT been completed by the assistant.
- Production Cloudflare environment stores `LINE_CHANNEL_ID`, `LIFF_ID`, a random `SESSION_SECRET`, `OWNER_LINE_USER_ID` and `SHOP_ENABLED=false`; do not copy secrets to source control.
- Migration `003_legacy_points.sql` creates `legacy_accounts` and `points_adjustments` with unique idempotency keys. It was applied to the **new** database, not the dormitory database.
- Owner-provided screenshot balances for 11 accounts / 49 points were inserted directly into private D1 (without personal data in this repository), marked **pending identity matching**. No real account received legacy points yet.
- After customers have logged into the NEW LINE site, only authenticated owner can go to **จัดการร้าน → ย้ายแต้มสมาชิกเก่า** and manually match their verified identity; a migration can be applied once and will remain included in points after future orders are completed.
- Check disputed names or changed balances with owner; eight-character legacy codes are NOT verified full LINE IDs and cannot be used as automatic login evidence.
- The menu now has 83 recovered items plus seven disabled draft items pending confirmation. Checkout remains **OFF** pending current catalog and end-to-end test. Do not change actual customer ordering links or flip `SHOP_ENABLED` until this is done.
## 2026-10-14 — Owner review editor + staged catalogue completion
- Apply migration `005_catalog_drafts_and_reviews.sql` to **chongpan-orders-v2 only**. Seven items (IDs 84–90) were mentioned as missing during handoff. Their prices and even continued sale must be confirmed; initially `price=0`, `available=0`, and they cannot be ordered.
- All products have a per-item owner price review flag. Admin → จัดการเมนู allows price edits, stock toggles, owner price verification, and draft creation. A saved price change invalidates verification unless explicitly reconfirmed.
- Checkout requires both existing flags **and no unverified available menu prices**. Do not bulk-approve unknown prices or enable orders without actual LINE callback, payment, and notification tests.
- Basket prices are refreshed from the server menu (never trusted at checkout). Payment is still offline; no account or QR has been invented.
- Keep the older live ordering URL untouched until owner approves a cutover. 

### Price and promotion corrections
- Migration `006_owner_prices.sql` brings **กาแฟโตนด** from stale 45 to historically owner-requested 40 THB, but keeps it unverified until the current price is checked against Loyverse.
- **ปังเนยนม** is 15 THB each or 25 THB per pair; discounts are reflected in cart and recomputed server-side. This remains conditional on base price being 15 THB. No discount is inferred for other bread items.
