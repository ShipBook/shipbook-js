# @shipbook/react-native

Shipbook SDK for React Native applications. Capture logs, errors, crashes, and exceptions from your mobile apps and view them in the [Shipbook console](https://console.shipbook.io/).

## Installation

```bash
npm install @shipbook/react-native @react-native-async-storage/async-storage
```

For Expo projects:

```bash
npx expo install @shipbook/react-native @react-native-async-storage/async-storage
```

## Quick Start

```typescript
import Shipbook from '@shipbook/react-native';

// Initialize Shipbook (do this once at app startup)
await Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY');

// Get a logger for your component/screen
const log = Shipbook.getLogger('MyScreen');

// Log messages at different severity levels
log.verbose('Detailed trace information');
log.debug('Debug information');
log.info('General information');
log.warning('Warning message');
log.error('Error message');

// Log with additional parameters (like console.log)
log.debug('User data:', { id: 123, name: 'John' });
log.info('Items:', ['apple', 'banana']);
log.debug('Screen:', screenName, 'Params:', params);

// Log with an error object (must be last argument)
try {
  await fetchData();
} catch (error) {
  log.error('Fetch failed', error);
  log.error('Failed with context:', { endpoint }, error);
}
```

## Features

- **Remote Logging** - View all your mobile logs in the Shipbook console
- **Crash Reporting** - Automatically captures crashes and exceptions
- **Session Tracking** - Group logs by user session
- **Offline Support** - Logs are queued and sent when connectivity is restored
- **Dynamic Configuration** - Change log levels remotely without app updates
- **User Identification** - Associate logs with specific users
- **Screen Tracking** - Track navigation and screen views

## Configuration

### Enable Inner Logging (Debug Mode)

```typescript
Shipbook.enableInnerLog(true);
```

### Register User

```typescript
Shipbook.registerUser(
  'user-123',           // userId
  'john@example.com',   // email (optional)
  'John Doe',           // userName (optional)
  'John',               // firstName (optional)
  'Doe',                // lastName (optional)
  { plan: 'premium' }   // additionalInfo (optional)
);
```

### Screen Tracking

```typescript
// Call when navigating to a new screen
Shipbook.screen('HomeScreen');
```

## Integration Examples

### Basic App.tsx

```tsx
import React, { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import Shipbook from '@shipbook/react-native';

const log = Shipbook.getLogger('App');

export default function App() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    Shipbook.start('YOUR_APP_ID', 'YOUR_APP_KEY')
      .then(() => log.info('App initialized'));
  }, []);

  return (
    <View>
      <Text>My App</Text>
    </View>
  );
}
```

### With React Navigation

```tsx
import { NavigationContainer } from '@react-navigation/native';
import Shipbook from '@shipbook/react-native';

function App() {
  const routeNameRef = useRef<string>();
  const navigationRef = useNavigationContainerRef();

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        routeNameRef.current = navigationRef.getCurrentRoute()?.name;
      }}
      onStateChange={() => {
        const currentRouteName = navigationRef.getCurrentRoute()?.name;
        if (routeNameRef.current !== currentRouteName && currentRouteName) {
          Shipbook.screen(currentRouteName);
        }
        routeNameRef.current = currentRouteName;
      }}
    >
      {/* Your navigation structure */}
    </NavigationContainer>
  );
}
```

## Peer Dependencies

This package requires:

- `react-native` >= 0.60.0
- `@react-native-async-storage/async-storage` >= 1.17.0

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
