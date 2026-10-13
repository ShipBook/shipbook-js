# Changelog

## 1.2.0
- New `Shipbook.getSessionHeaders()`. Add it to requests to your own backend to link browser sessions with your Node.js backend's sessions in the Shipbook console. Your backend must allow the `x-shipbook-session` header in its CORS configuration.

## 1.1.0
- Rebuilt on the new `@shipbook/core` + `@shipbook/client` split.

## 1.0.4
- SDK platform version is now reported automatically.
- Send the browser's user agent with login info.

## 1.0.3
- Store logs in IndexedDB, with related storage fixes.

## 1.0.2
- Packaged as part of the multiplatform monorepo; added README.
