# Changelog

## 1.6.0
### Added
- **Crash capture.** An uncaught exception or unhandled rejection is recorded and sent before the process exits. On `SIGTERM` or `SIGINT` (every deploy, Ctrl+C) pending logs are sent first, then the process ends as it would have. If your app has its own handler for one of these, the SDK only sends and leaves the exit to you.
- **Background jobs count.** Each `Shipbook.runInContext()` run is reported as a request of kind `job`: when it started, how long it took, and whether it threw. Runs appear in the request counts and error rates like HTTP requests. `runInContext()` now always returns a promise.
- Each session reports how many requests it handled in the upload, so the request totals the server shows are exact, also for sessions grouped across many requests.

### Changed
- **Uploads are batched, like the mobile SDKs.** Logs go up on a timer (every 3 seconds by default) or once 1,000 records are waiting, instead of one upload per error. A burst of errors is one upload.
- **`flushSeverity` now works on Node.** Logs below it wait in a per-request buffer and are sent as context only when that request logs at or above it. A request that stays quiet costs nothing beyond its count.
- **The queue is in memory, per process.** Before, every record was appended to a temp file shared by every Node process on the machine. Only the machine id is kept on disk.
- `start()` applies the default config at once, then the cached one, then the server's. Logs written right after `start()` reach the cloud. The cached config is kept per app id.

### Fixed
- Importing the SDK (1.4.0 and 1.5.0) stopped `SIGTERM` and Ctrl+C from ending a process that had no handler of its own.
- 1.5.0 uploaded every request event on its own, flooding the server. Events are batched with everything else now.
- A log written while an upload was in progress could be dropped (1.4.0).
- A full batch no longer throws an error into your log call.

## 1.5.0
- Each HTTP request is now its own unit. The Express middleware and NestJS interceptor give every request an id and record when it started and ended, with its method, route, status and duration. In the console a session reads request by request, and requests that ran at the same time no longer mix.
- MCP servers: calls to an MCP endpoint are labelled with what they were asked to do, e.g. `tools/call get-logs`. For MCP over stdio or any other transport, wrap the transport: `server.connect(Shipbook.mcpTransport(new StdioServerTransport()))`. Each call becomes a request, with its JSON-RPC error code when it fails.
- New `Shipbook.runInRequest(kind, operation, fn)` groups work that isn't an HTTP request (a queue message, a WebSocket message) as one request. A thrown error marks it failed.
- NestJS on Fastify: sessions now record the request path.

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
