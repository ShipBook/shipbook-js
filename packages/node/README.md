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
log.v('Detailed trace information');
log.d('Debug information');
log.i('General information');
log.w('Warning message');
log.e('Error message');

// Log with additional parameters (like console.log)
log.d('Request data:', { method: 'POST', path: '/api' });
log.i('Processing items:', ['item1', 'item2']);
log.d('User:', userId, 'Action:', action);

// Log with an error object (must be last argument)
try {
  await someOperation();
} catch (error) {
  log.e('Operation failed', error);
  log.e('Failed with context:', { requestId }, error);
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

### Associate Logs with a User

A server handles many users at once, so the user is set per request, not globally. If your auth middleware sets `req.user` (Passport and most others do), the Express middleware and the NestJS interceptor pick it up automatically: `id` or `userId`, `name` or `userName`, and `email`.

For any other shape, pass a `user` extractor:

```typescript
app.use(Shipbook.expressMiddleware({
  user: (req) => req.account && { userId: req.account.id, email: req.account.email }
}));

// NestJS
app.useGlobalInterceptors(Shipbook.nestjsInterceptor({
  user: (ctx) => {
    const account = ctx.switchToHttp().getRequest().account;
    return account && { userId: account.id, email: account.email };
  }
}));
```

The only required field is `userId`; `userName`, `fullName`, `email`, `phoneNumber` and `additionalInfo` are optional.

## Framework Integration

### Express

```typescript
import express from 'express';
import Shipbook from '@shipbook/node';

const app = express();
app.use(Shipbook.expressMiddleware()); // groups each request's logs, with its user
const log = Shipbook.getLogger('ExpressApp');

// Initialize before starting server
Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY').then(() => {
  app.listen(3000, () => {
    log.i('Server started on port 3000');
  });
});

app.get('/', (req, res) => {
  log.i('Request received', { path: req.path });
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
  
  log.i('Lambda invoked', { event });
  
  // Your handler logic
  return { statusCode: 200, body: 'Success' };
};
```

## Background Jobs

Use `runInContext` to group logs from background jobs into separate sessions. Each job run gets a unique session ID.

```typescript
import Shipbook from '@shipbook/node';

// Process email queue with its own session
await Shipbook.runInContext({ jobName: 'email-queue' }, async () => {
  const log = Shipbook.getLogger('EmailProcessor');

  log.i('Processing email queue');
  // ... process emails ...
  log.i('Email queue completed', { processed: 100 });
});

// Data cleanup job with its own attributes
await Shipbook.runInContext(
  { jobName: 'data-cleanup', attributes: { priority: 'low' } },
  async () => {
    const log = Shipbook.getLogger('DataCleanup');

    log.i('Starting cleanup');
    // ... cleanup logic ...
    log.i('Cleanup completed');
  }
);
```

Each `runInContext` call creates a unique session; the job name and the attributes are shown in the Shipbook console.

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
