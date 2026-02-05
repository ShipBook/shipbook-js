// Main Shipbook class
export { default as Shipbook } from './shipbook';
export { default } from './shipbook';

// Log class
export { default as Log } from './log';

// Interfaces
export type { 
  IStorage,
  IPlatform,
  IEventManager,
  IExceptionHandler,
  PlatformAdapters,
  AppState,
  ExceptionCallback
} from './interfaces';

// Models
export {
  BaseLog,
  LogType,
  BaseEvent,
  AppEvent,
  ScreenEvent,
  Message,
  Exception,
  StackTraceElement,
  Severity,
  SeverityUtil,
  Platform
} from './models';

export type {
  User,
  ConfigResponse,
  AppenderResponse,
  LoggerResponse,
  RootResponse,
  Login,
  LoginData,
  LoginOptions,
  RequestContext,
  Session,
  Browser,
  DeviceInfo,
  VersionInfo,
  AppVersionInfo,
  OsInfo,
  CellInfo,
  ThreadInfo
} from './models';

// Utilities
export {
  InnerLog,
  AutoQueue,
  eventEmitter,
  CONFIG_CHANGE,
  CONNECTED,
  USER_CHANGE,
  normalizeStackTrace,
  extractFileName,
  extractModuleName
} from './utils';

export type {
  StackFrame,
  NormalizedStackTrace
} from './utils';

// Appenders (for advanced use)
export type { BaseAppender } from './appenders';
export { ConsoleAppender, SBCloudAppender } from './appenders';
export type { SBCloudAppenderDeps } from './appenders';
export { default as appenderFactory } from './appenders/appender-factory';

// Managers (for advanced use)
export { default as logManager } from './log-manager';
export { default as sessionManager } from './session-manager';

// Networking
export { connectionClient, HttpMethod } from './networking';

// Internal SDK config (for platform packages only)
export { sdkConfig } from './models/login';
