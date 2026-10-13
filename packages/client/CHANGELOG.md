# Changelog

## 1.1.1
- A corrupt cached config no longer blocks login. The SDK deletes it, falls back to the default config, and connects as usual.

## 1.1.0
- New `getSessionHeaders()`. Spread it into requests to your own backend, and the Shipbook console links this app session to the backend session those requests create. It returns an empty object until login completes, so spreading it is always safe.

## 1.0.1
- Stop retrying after a 4xx `loginSdk`/`loginSdkServer` response. Bad credentials now surface as an integration error instead of an upload-retry loop against the server.

## 1.0.0
- First release. The client auth and session layer extracted from the core split — the `Shipbook` class, session manager, login, and the `SBCloudAppender` used by the browser and React Native SDKs.
