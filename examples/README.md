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

## Claude connector demo: "payments fail, only in Canada"

A checkout API whose release 2.4.0 moved currency conversion to a new FX feed that has no CAD rate. Every Canadian order is charged `NaN` and declined, while USD, EUR and GBP orders keep working. With the [Shipbook connector in Claude](https://www.shipbook.io/docs/mcp), you ask Claude why payments are failing, and it finds the cause in Shipbook's errors, releases and logs.

1. Create an app in the Console for the API and put its credentials in `node-app/.env`.
2. Run the old release with some traffic: `cd node-app && APP_VERSION=2.3.0 npm run start:checkout`, and in another terminal `npm run checkout:traffic`. Stop the server when it's done.
3. Run the new release the same way: `APP_VERSION=2.4.0 npm run start:checkout`, then `npm run checkout:traffic`.
4. Optionally, `cd browser-app && npm run dev` and open http://localhost:5173/checkout.html, then click **Pay**: "Payment failed".
5. In Claude, connect Shipbook from **Settings** → **Connectors**, and ask: *Why are payments failing in my checkout API?*
