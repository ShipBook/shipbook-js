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

// Appenders
export type { BaseAppender } from './appenders';
export { ConsoleAppender } from './appenders';
export { default as appenderFactory } from './appenders/appender-factory';

// Log manager
export { default as logManager } from './log-manager';

// Networking
export { connectionClient, HttpMethod } from './networking';

// SDK version
export { CORE_VERSION } from './generated/version';
