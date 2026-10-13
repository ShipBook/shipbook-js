# Changelog

## 1.4.0
- The Express middleware and NestJS interceptor now read the `x-shipbook-session` header sent by your client apps, so the console can link each request to the app session that made it. All requests from one app session are grouped into a single session, ahead of any custom session extractor. Requests without the header behave as before.

## 1.3.0
- `start()` now detects your app's version automatically. When the `appVersion` argument is omitted, the SDK reads the `version` field from the nearest `package.json` — the same approach Bugsnag and Datadog use. Passing it explicitly still overrides.

## 1.2.1
- Switched the offline queue to JSONL for sessions and logs.

## 1.2.0
- Register the request session at middleware start.
- Send empty session stubs for HTTP requests.

## 1.1.2
- Stop retrying after a 4xx `loginSdkServer` response. Bad credentials now surface as an integration error instead of a retry loop.

## 1.1.1
- Added `configRefreshInterval`.

## 1.1.0
- Rebuilt on the new core split; initialization and wrapper fixes.

## 1.0.0
- First release of the Node.js SDK. Server-side logging with per-request sessions via `AsyncLocalStorage`, console output before `start()` is called, and offline log storage.
