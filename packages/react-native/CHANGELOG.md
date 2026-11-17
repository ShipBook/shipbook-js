# Changelog

## 2.0.0
- Upgrade to get an SDK that follows the Shipbook server: it stops sending when the server refuses your app or is busy, and calling `Shipbook.start` again costs nothing.
- The SDK obeys the server. If the server refuses the app (an unknown app ID, or traffic far past fair use), the SDK pauses: it sends nothing and drops new logs until the pause ends, at most 30 days and across restarts. If the server or a proxy answers busy (429 or 503), it waits (the `Retry-After` time, 5 minutes without one, at most an hour) and sends the saved logs afterwards. With inner logging on, the SDK prints `paused until …` or `backing off until …`.
- Every request carries `x-shipbook-app-id` and `x-shipbook-sdk: react-native/2.0.0`.
- Calling `Shipbook.start` again with the same app ID and key returns the first call's result without logging in again.
- Depends on `@shipbook/client` 2.0.0 and `@shipbook/core` 2.6.0.

## 1.2.1
- A corrupt value in AsyncStorage no longer makes `Shipbook.start()` fail. The SDK removes the bad value, falls back to the default config, and connects as usual.

## 1.2.0
- New `Shipbook.getSessionHeaders()`. Add it to requests to your own backend to link app sessions with your Node.js backend's sessions in the Shipbook console.

## 1.1.1
- Handle non-`Error` values thrown to the global exception handler.

## 1.1.0
- Rebuilt on the new `@shipbook/core` + `@shipbook/client` split.

## 1.0.2
- SDK platform version is now reported automatically.

## 1.0.1
- Packaged as part of the multiplatform monorepo; added README.
