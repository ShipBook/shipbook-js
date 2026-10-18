# Changelog

## 2.3.0
- Added `RequestEvent` (with `RequestEventPhase`, `RequestKind`, `RequestOutcome`): the start and end of a request, used by `@shipbook/node` to group a request's logs. Logs and the request context gain an optional `requestId`.

## 2.3.0
- Added `RequestEvent` (with `RequestEventPhase`, `RequestKind`, `RequestOutcome`): the start and end of a request, used by `@shipbook/node` to group a request's logs. Logs and the request context gain an optional `requestId`.

## 2.2.0
- Added the shared pieces for cross-app session linking: the `x-shipbook-session` header name and a `callerSessionLink` field on sessions. Used by `@shipbook/client` and `@shipbook/node`.

## 2.1.0
- Send empty session stubs for HTTP requests, supporting the Node SDK's per-request sessions.
- Test infrastructure fixes.

## 2.0.1
- Added `configRefreshInterval` to control how often remote config is refreshed.

## 2.0.0
- Split the SDK into `@shipbook/core` (this package) and `@shipbook/client`. Core is now a platform-agnostic logging engine — logging, appenders, models, and the connection client; client-side auth and sessions moved to `@shipbook/client`.

## 1.0.5
- Logs print to the console before `start()` is called.
- Groundwork for sending multiple sessions.
- Fixed the job name not being passed and not being attached to the session.

## 1.0.4
- Added `sdkPlatformVersion`; SDK versions are now reported automatically.
- Login info can now carry the client's user agent.
- Accept `undefined` values in log arguments.

## 1.0.3
- Fixed stack-trace capture.

## 1.0.2
- Log methods accept extra arguments after the message, like `console`.
