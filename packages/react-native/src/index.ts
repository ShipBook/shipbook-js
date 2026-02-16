import { Shipbook } from '@shipbook/client';
import { Exception } from '@shipbook/core';
import { storage, platform, eventManager, exceptionHandler } from './adapters';
import { PLATFORM_VERSION } from './generated/version';

// Configure Shipbook with React Native adapters
Shipbook.init({
  storage,
  platform,
  eventManager,
  exceptionHandler,
  platformVersion: PLATFORM_VERSION
});

// Set up React Native specific symbolication for exceptions
try {
  const symbolicateStackTrace = require('react-native/Libraries/Core/Devtools/symbolicateStackTrace');
  if (typeof symbolicateStackTrace === 'function') {
    Exception.symbolicateStackTrace = symbolicateStackTrace;
  }
} catch {
  // Symbolication not available, will use raw stack traces
}

// Re-export Shipbook as default and named export
export default Shipbook;
export { Shipbook };

// Re-export commonly used types and classes from core
export {
  Log,
  Severity,
  SeverityUtil,
  type User,
  type IStorage,
  type IPlatform,
  type IEventManager,
  type IExceptionHandler,
  type PlatformAdapters
} from '@shipbook/core';
