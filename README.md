# Shipbook JavaScript SDK

Multi-platform JavaScript SDK for [Shipbook](https://www.shipbook.io/) - remote logging and crash reporting.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| `@shipbook/core` | Core SDK (platform-agnostic) | [![npm](https://img.shields.io/npm/v/@shipbook/core)](https://www.npmjs.com/package/@shipbook/core) |
| `@shipbook/react-native` | React Native adapter | [![npm](https://img.shields.io/npm/v/@shipbook/react-native)](https://www.npmjs.com/package/@shipbook/react-native) |
| `@shipbook/browser` | Browser/SPA adapter | [![npm](https://img.shields.io/npm/v/@shipbook/browser)](https://www.npmjs.com/package/@shipbook/browser) |
| `@shipbook/node` | Node.js adapter | [![npm](https://img.shields.io/npm/v/@shipbook/node)](https://www.npmjs.com/package/@shipbook/node) |

## Installation

Choose the package for your platform:

### React Native

```bash
npm install @shipbook/react-native
# or
yarn add @shipbook/react-native
```

**Note:** React Native also requires `@react-native-async-storage/async-storage`:

```bash
npm install @react-native-async-storage/async-storage
```

### Browser / SPA

```bash
npm install @shipbook/browser
# or
yarn add @shipbook/browser
```

### Node.js

```bash
npm install @shipbook/node
# or
yarn add @shipbook/node
```

## Usage

The API is **identical across all platforms**:

```typescript
// Import from your platform's package
import Shipbook from '@shipbook/react-native';  // or @shipbook/browser, @shipbook/node

// Initialize with your credentials from shipbook.io
await Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY');

// Get a logger for a specific tag/module
const log = Shipbook.getLogger('MyComponent');

// Log messages at different severity levels
log.e('Error message');
log.w('Warning message');
log.i('Info message');
log.d('Debug message');
log.v('Verbose message');

// Log with an error object
try {
  // ...
} catch (error) {
  log.e('Operation failed', error);
}
```

### User Registration

Track logs by user:

```typescript
Shipbook.registerUser(
  'user123',           // userId (required)
  'johndoe',           // userName (optional)
  'John Doe',          // fullName (optional)
  'john@example.com',  // email (optional)
  '+1234567890',       // phoneNumber (optional)
  { plan: 'premium' }  // additionalInfo (optional)
);
```

### Screen Events

Track screen views:

```typescript
Shipbook.screen('HomeScreen');
Shipbook.screen('SettingsScreen');
```

### Manual Flush

Force send pending logs:

```typescript
Shipbook.flush();
```

### Logout

Clear user data and start a new session:

```typescript
Shipbook.logout();
```

## Configuration Options

### Start Options

```typescript
await Shipbook.start('APP_ID', 'APP_KEY', {
  appVersion: '1.0.0',  // Optional: override app version
  appBuild: '100'       // Optional: override build number
});
```

### Debug Mode

Enable internal SDK logging for debugging:

```typescript
Shipbook.enableInnerLog(true);
```

### Custom API URL

For enterprise deployments:

```typescript
Shipbook.setConnectionUrl('https://your-shipbook-server.com/v1/');
```

## Platform-Specific Notes

### React Native

- Uses `@react-native-async-storage/async-storage` for persistence
- Captures crashes via `ErrorUtils`
- Tracks app state changes (background/foreground)
- Supports stack trace symbolication in development

### Browser

- Uses `localStorage` for persistence
- Captures errors via `window.onerror` and `unhandledrejection`
- Tracks page visibility changes
- Flushes logs on `beforeunload`

### Node.js

- Uses filesystem storage with memory fallback (for serverless/PaaS)
- Captures errors via `uncaughtException` and `unhandledRejection`
- Flushes logs on process exit signals (SIGINT, SIGTERM)
- Set `SHIPBOOK_STORAGE_PATH` env var to customize storage location

## Static Logging

You can also log without creating a logger instance:

```typescript
import { Log } from '@shipbook/react-native';

Log.e('Static error message');
Log.i('Static info message');
```

## Development

This is a monorepo using npm workspaces.

### Building

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Build specific package
npm run build:core
npm run build:react-native
npm run build:browser
npm run build:node
```

### Project Structure

```
packages/
├── core/           # Platform-agnostic core SDK
├── react-native/   # React Native adapter
├── browser/        # Browser adapter
└── node/           # Node.js adapter
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [Shipbook Website](https://www.shipbook.io/)
- [Documentation](https://docs.shipbook.io/)
- [GitHub Issues](https://github.com/ShipBook/shipbook-js/issues)
