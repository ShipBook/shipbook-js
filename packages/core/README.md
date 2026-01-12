# @shipbook/core

The platform-agnostic core of the Shipbook SDK. This package provides the foundational logging infrastructure used by all Shipbook platform-specific packages.

## ⚠️ Important

**This package is not meant to be used directly.** Instead, use one of the platform-specific packages:

- **[@shipbook/react-native](https://www.npmjs.com/package/@shipbook/react-native)** - For React Native apps
- **[@shipbook/browser](https://www.npmjs.com/package/@shipbook/browser)** - For web/SPA applications
- **[@shipbook/node](https://www.npmjs.com/package/@shipbook/node)** - For Node.js servers and serverless functions

## What's Included

This core package contains:

- **Log Management** - Centralized logging with severity levels (verbose, debug, info, warning, error)
- **Session Management** - User session tracking and configuration
- **Appenders** - Console and cloud appender implementations
- **Models** - Data structures for logs, exceptions, and events
- **Networking** - API client for Shipbook cloud services

## For Package Developers

If you're building a new platform adapter for Shipbook, you'll need to implement the following interfaces:

```typescript
import {
  IStorage,
  IPlatform,
  IEventManager,
  IExceptionHandler,
} from '@shipbook/core';
```

### Required Interfaces

- **IStorage** - Persistent key-value storage
- **IPlatform** - Platform information (OS, version, device info)
- **IEventManager** - Lifecycle event handling (foreground/background)
- **IExceptionHandler** - Uncaught exception capture

See the existing adapters in [@shipbook/react-native](https://github.com/ShipBook/shipbook-js/tree/master/packages/react-native), [@shipbook/browser](https://github.com/ShipBook/shipbook-js/tree/master/packages/browser), or [@shipbook/node](https://github.com/ShipBook/shipbook-js/tree/master/packages/node) for reference implementations.

## Links

- [Shipbook Website](https://www.shipbook.io/)
- [GitHub Repository](https://github.com/ShipBook/shipbook-js)
- [Documentation](https://docs.shipbook.io/)

## License

MIT
