# @shipbook/browser

Shipbook SDK for web browsers and single-page applications (SPAs). Capture logs, errors, and exceptions from your frontend applications and view them in the [Shipbook console](https://console.shipbook.io/).

## Installation

```bash
npm install @shipbook/browser
```

## Quick Start

```typescript
import Shipbook from '@shipbook/browser';

// Initialize Shipbook (do this once at app startup)
await Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY');

// Get a logger for your component/module
const log = Shipbook.getLogger('MyComponent');

// Log messages at different severity levels
log.v('Detailed trace information');
log.d('Debug information');
log.i('General information');
log.w('Warning message');
log.e('Error message');

// Log with additional parameters (like console.log)
log.d('User data:', { id: 123, name: 'John' });
log.i('Items:', ['apple', 'banana']);
log.d('Count:', 42, 'Status:', { active: true });

// Log with an error object (must be last argument)
try {
  throw new Error('Something failed');
} catch (error) {
  log.e('Operation failed', error);
  log.e('Failed with context:', { userId: 'user123' }, error);
}
```

## Features

- **Remote Logging** - View all your frontend logs in the Shipbook console
- **Error Tracking** - Automatically captures uncaught exceptions and unhandled promise rejections
- **Session Tracking** - Group logs by user session
- **Offline Support** - Logs are queued and sent when connectivity is restored
- **Dynamic Configuration** - Change log levels remotely without redeploying
- **User Identification** - Associate logs with specific users

## Configuration

### Enable Inner Logging (Debug Mode)

```typescript
Shipbook.enableInnerLog(true);
```

### Register User

```typescript
Shipbook.registerUser(
  'user-123',           // userId
  'johndoe',            // userName (optional)
  'John Doe',           // fullName (optional)
  'john@example.com',   // email (optional)
  '+1234567890',        // phoneNumber (optional)
  { role: 'admin' }     // additionalInfo (optional)
);
```

### Screen/Page Tracking

```typescript
Shipbook.screen('HomePage');
```

## Framework Integration

### React

```tsx
import { useEffect, useRef } from 'react';
import Shipbook from '@shipbook/browser';

const log = Shipbook.getLogger('App');

function App() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY')
      .then(() => log.i('App started'));
  }, []);

  return <div>Your App</div>;
}
```

### Vue

```typescript
// main.ts
import Shipbook from '@shipbook/browser';

Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY')
  .then(() => {
    createApp(App).mount('#app');
  });
```

## Getting Your App ID and Key

1. Sign up at [shipbook.io](https://www.shipbook.io/)
2. Create a new application in the console
3. Copy your App ID and App Key from the application settings

## Links

- [Shipbook Website](https://www.shipbook.io/)
- [Shipbook Console](https://console.shipbook.io/)
- [GitHub Repository](https://github.com/ShipBook/shipbook-js)
- [Documentation](https://docs.shipbook.io/)

## License

MIT
