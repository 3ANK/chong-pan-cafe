# CHONG&PAN POS order inbox integration (isolated branch)

Branch: `feature/pos-order-inbox`
Base: `chongpan-ordering-v2`

## Scope
This branch adds a dedicated, token-protected API for the Android POS to read active orders from the existing D1-backed ordering system. It does not change the LINE LIFF ordering flow, order schema, Telegram bot/group, or existing admin dashboard.

## Existing order notification
The current order creation flow sends the existing order summary to the configured Telegram bot/group. This branch removes the owner-alert fallback to LINE Messaging API, so an unsuccessful Telegram send does not consume the limited LINE message quota. The order is still saved in D1 and `order_notifications.delivered=0` records the failed alert.

The Telegram message remains as before: order short ID, amount/payment method, fulfillment, item list/modifiers, and the existing admin deep link.

## POS device API
Pair devices using the owner-only pairing panel in the admin dashboard. It issues an eight-digit, single-use code valid for five minutes. The Android app exchanges it at `POST /api/pos/pair` for a random device token. Only the SHA-256 token hash is stored in D1; the raw token is returned once to the app and must be stored in Android Keystore. Never commit or log the token.

- `POST /api/pos/pair` (no prior token): body `{"code":"12345678","label":"Samsung Tab S9"}`; returns `accessToken` once.
- `GET /api/pos/orders`
  - Header: `Authorization: Bearer <device access token>`
  - Returns active orders in `pending`, `accepted`, `preparing`, or `ready` status using the existing order serializer, including items, modifiers, fulfillment, payment status, and existing Loyverse sync metadata.
- `PATCH /api/pos/orders`
  - Same Authorization header.
  - Accepts the existing admin order status payload, e.g. `{"id":"<uuid>","status":"accepted"}`.
  - Reuses the existing state transition and QR-payment verification checks.

Unauthorized requests receive HTTP 401. The endpoint does not expose customer LINE identifiers.

## Important security / deployment notes
1. Apply `migrations/021_pos_device_pairing.sql` to the preview D1 database before deploying this branch.
2. Device tokens are revocable by setting `revoked_at` in `pos_devices`; add a device-management screen before broad rollout.
3. Pairing endpoints should be protected with Cloudflare rate limiting before public production rollout.
3. Do not reuse the LINE Messaging token, Telegram bot token, or Loyverse token as the POS credential.
4. Keep Telegram Bot and group settings unchanged. Do not configure LINE owner-push fallback.
5. The Android app integration and Firebase push notifications are not included in this backend-only change yet. The POS should initially poll this authenticated endpoint while the app is foregrounded; FCM/background delivery requires Firebase project configuration and device registration.
6. QR payments remain subject to the existing staff verification workflow. Do not mark an order accepted/completed before verifying QR payment as required by the current API.
7. The API returns only active orders, maximum 100, sorted newest first. Poll with a modest interval and deduplicate by order UUID on the device.

## Test plan
- Use a non-production Pages preview environment and apply migration 021 to its D1 binding.
- GET without token: expect 401. Pair with an unexpired code, then verify the code cannot be reused.
- GET with token: expect active orders and nested item details.
- PATCH invalid transition: expect 409.
- PATCH valid transition: expect the same result as the admin dashboard.
- Create a test order and verify Telegram still receives the normal message, with no owner LINE push.
- Confirm production branch and production secrets remain unchanged until review is complete.
