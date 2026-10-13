# Changelog

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
