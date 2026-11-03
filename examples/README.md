# Shipbook JS examples

- `browser-app` — the browser SDK: a page with a button per log level, plus the shop demo below
- `node-app` — the Node.js SDK: Express, background jobs, and the shop demo's backend
- `react-native-app` — the React Native SDK

Each app reads its Shipbook credentials from a `.env` file; copy its `.env.example` and fill in an app ID and key from [console.shipbook.io](https://console.shipbook.io).

## Session-linking demo: "checkout failed, but the API returned 200"

A browser shop and its Express backend, each with its own Shipbook app. The shop sends `Shipbook.getSessionHeaders()` with its API call, so in the Console the backend request and its logs appear inside the shop's session timeline.

The bug is in neither side alone: the backend can't estimate shipping, logs a warning and still returns `200` with `shipping: null`; the shop assumes every order has a shipping estimate and fails on `order.shipping.eta`. Each log on its own looks harmless; side by side in one timeline, the cause is obvious.

1. Create two apps in the Console (one for the shop, one for the backend) and put their credentials in `browser-app/.env` and `node-app/.env`.
2. Start the backend: `cd node-app && npm run start:shop` (port 3001).
3. Start the shop: `cd browser-app && npm run dev`, then open http://localhost:5173/shop.html and click **Checkout**.
4. In the Console, open the shop app's session for the user `sam.taylor`: the `POST /api/orders` request and the backend's warning sit right before the checkout error.

See [Cross-App Session Linking](https://www.shipbook.io/docs/session-linking) for the setup in your own app.
