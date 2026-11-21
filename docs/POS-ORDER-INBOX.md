# CHONG&PAN POS order inbox integration (isolated branch)

Branch: `feature/pos-order-inbox`
Base: `chongpan-ordering-v2`

## Scope
This branch adds a dedicated, token-protected API for the Android POS to read active orders from the existing D1-backed ordering system. It does not change the LINE LIFF ordering flow, order schema, Telegram bot/group, or existing admin dashboard.

## Existing order notification
The current order creation flow sends the existing order summary to the configured Telegram bot/group. This branch removes the owner-alert fallback to LINE Messaging API, so an unsuccessful Telegram send does not consume the limited LINE message quota. The order is still saved in D1 and `order_notifications.delivered=0` records the failed alert.

The Telegram message remains as before: order short ID, amount/payment method, fulfillment, item list/modifiers, and the existing admin deep link.

## POS device API
Configure a Cloudflare Pages secret named `POS_DEVICE_TOKEN` with a cryptographically random value of at least 32 characters. Never commit it to GitHub or embed it in an APK.

- `GET /api/pos/orders`
  - Header: `Authorization: Bearer <POS_DEVICE_TOKEN>`
  - Returns active orders in `pending`, `accepted`, `preparing`, or `ready` status using the existing order serializer, including items, modifiers, fulfillment, payment status, and existing Loyverse sync metadata.
- `PATCH /api/pos/orders`
  - Same Authorization header.
  - Accepts the existing admin order status payload, e.g. `{"id":"<uuid>","status":"accepted"}`.
  - Reuses the existing state transition and QR-payment verification checks.

Unauthorized requests receive HTTP 401. The endpoint does not expose customer LINE identifiers.

## Important security / deployment notes
1. Do not deploy this branch to production until a POS-device credential provisioning and rotation method is selected.
2. A bearer token embedded in an APK can be extracted. For production, use a pairing flow that exchanges a one-time pairing code for a revocable device credential, or another short-lived device-auth design. The static secret endpoint is for controlled integration testing only.
3. Do not reuse the LINE Messaging token, Telegram bot token, or Loyverse token as the POS credential.
4. Keep Telegram Bot and group settings unchanged. Do not configure LINE owner-push fallback.
5. The Android app integration and Firebase push notifications are not included in this backend-only change yet. The POS should initially poll this authenticated endpoint while the app is foregrounded; FCM/background delivery requires Firebase project configuration and device registration.
6. QR payments remain subject to the existing staff verification workflow. Do not mark an order accepted/completed before verifying QR payment as required by the current API.
7. The API returns only active orders, maximum 100, sorted newest first. Poll with a modest interval and deduplicate by order UUID on the device.

## Test plan
- Set `POS_DEVICE_TOKEN` only in a non-production Pages preview environment.
- GET without token: expect 401.
- GET with token: expect active orders and nested item details.
- PATCH invalid transition: expect 409.
- PATCH valid transition: expect the same result as the admin dashboard.
- Create a test order and verify Telegram still receives the normal message, with no owner LINE push.
- Confirm production branch and production secrets remain unchanged until review is complete.
