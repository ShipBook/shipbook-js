# @shipbook/node

Shipbook SDK for Node.js applications. Capture logs, errors, and exceptions from your server-side applications, APIs, and serverless functions, and view them in the [Shipbook console](https://console.shipbook.io/).

## Installation

```bash
npm install @shipbook/node
```

## Quick Start

```typescript
import Shipbook from '@shipbook/node';

// Initialize Shipbook (do this once at app startup)
await Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY');

// Get a logger for your module
const log = Shipbook.getLogger('MyService');

// Log messages at different severity levels
log.verbose('Detailed trace information');
log.debug('Debug information');
log.info('General information');
log.warning('Warning message');
log.error('Error message');

// Log with additional parameters (like console.log)
log.debug('Request data:', { method: 'POST', path: '/api' });
log.info('Processing items:', ['item1', 'item2']);
log.debug('User:', userId, 'Action:', action);

// Log with an error object (must be last argument)
try {
  await someOperation();
} catch (error) {
  log.error('Operation failed', error);
  log.error('Failed with context:', { requestId }, error);
}
```

## Features

- **Remote Logging** - View all your server logs in the Shipbook console
- **Error Tracking** - Automatically captures uncaught exceptions and unhandled rejections
- **Session Tracking** - Group logs by request/session
- **Persistent Storage** - Logs are stored locally and sent when connectivity is available
- **Dynamic Configuration** - Change log levels remotely without redeploying
- **User Identification** - Associate logs with specific users or requests

## Configuration

### Enable Inner Logging (Debug Mode)

```typescript
Shipbook.enableInnerLog(true);
```

### Register User/Request Context

```typescript
Shipbook.registerUser(
  'user-123',           // userId
  'john@example.com',   // email (optional)
  'John Doe',           // userName (optional)
  'John',               // firstName (optional)
  'Doe',                // lastName (optional)
  { role: 'admin' }     // additionalInfo (optional)
);
```

## Framework Integration

### Express

```typescript
import express from 'express';
import Shipbook from '@shipbook/node';

const app = express();
const log = Shipbook.getLogger('ExpressApp');

// Initialize before starting server
Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY').then(() => {
  app.listen(3000, () => {
    log.info('Server started on port 3000');
  });
});

app.get('/', (req, res) => {
  log.info('Request received', { path: req.path });
  res.send('Hello World');
});
```

### NestJS

```typescript
// main.ts
import Shipbook from '@shipbook/node';

async function bootstrap() {
  await Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY');
  
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### AWS Lambda / Serverless

```typescript
import Shipbook from '@shipbook/node';

const log = Shipbook.getLogger('LambdaHandler');

// Initialize outside handler for connection reuse
const initPromise = Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY');

export const handler = async (event: any) => {
  await initPromise;
  
  log.info('Lambda invoked', { event });
  
  // Your handler logic
  return { statusCode: 200, body: 'Success' };
};
```

## Storage Location

Logs are persisted to `~/.shipbook/` by default. This ensures logs are not lost if the process crashes or loses connectivity.

## Getting Your App ID and Key

1. Sign up at [shipbook.io](https://www.shipbook.io/)
2. Create a new application in the console
3. Copy your App ID and App Key from the application settings

## Requirements

- Node.js 14.0.0 or higher

## Links

- [Shipbook Website](https://www.shipbook.io/)
- [Shipbook Console](https://console.shipbook.io/)
- [GitHub Repository](https://github.com/ShipBook/shipbook-js)
- [Documentation](https://docs.shipbook.io/)

## License

MIT
