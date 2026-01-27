import { Shipbook, sdkConfig } from '@shipbook/core';
import { storage, platform, eventManager, exceptionHandler } from './adapters';
import { SDK_PLATFORM_VERSION } from './generated/version';

// Set platform version (internal, not exposed to users)
sdkConfig.sdkPlatformVersion = SDK_PLATFORM_VERSION;

// Configure Shipbook with Browser adapters
Shipbook.configure({
  storage,
  platform,
  eventManager,
  exceptionHandler
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
