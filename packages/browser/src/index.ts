import { Shipbook } from '@shipbook/client';
import { storage, platform, eventManager, exceptionHandler } from './adapters';
import { PLATFORM_VERSION } from './generated/version';

// Configure Shipbook with Browser adapters
Shipbook.init({
  storage,
  platform,
  eventManager,
  exceptionHandler,
  platformVersion: PLATFORM_VERSION
});

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
