# Changelog

## 2.0.0
- Upgrade to get an SDK that follows the Shipbook server: it stops sending when the server refuses your app or is busy, and calling `Shipbook.start` again costs nothing.
- The SDK obeys the server. If the server refuses the app (an unknown app ID, or traffic far past fair use), the SDK pauses: it sends nothing and drops new logs until the pause ends, at most 30 days and across restarts. If the server or a proxy answers busy (429 or 503), it waits (the `Retry-After` time, 5 minutes without one, at most an hour) and sends the saved logs afterwards. With inner logging on, the SDK prints `paused until …` or `backing off until …`.
- Every request carries `x-shipbook-app-id` and `x-shipbook-sdk: <platform>/<version>`.
- Calling `Shipbook.start` again with the same app ID and key returns the first call's result without logging in again.

## 1.1.1
- A corrupt cached config no longer blocks login. The SDK deletes it, falls back to the default config, and connects as usual.

## 1.1.0
- New `getSessionHeaders()`. Spread it into requests to your own backend, and the Shipbook console links this app session to the backend session those requests create. It returns an empty object until login completes, so spreading it is always safe.

## 1.0.1
- Stop retrying after a 4xx `loginSdk`/`loginSdkServer` response. Bad credentials now surface as an integration error instead of an upload-retry loop against the server.

## 1.0.0
- First release. The client auth and session layer extracted from the core split — the `Shipbook` class, session manager, login, and the `SBCloudAppender` used by the browser and React Native SDKs.
