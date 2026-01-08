export type { IStorage } from './storage';
export type { IPlatform } from './platform';
export type { IEventManager, AppState } from './event-manager';
export type { IExceptionHandler, ExceptionCallback } from './exception-handler';

import type { IStorage } from './storage';
import type { IPlatform } from './platform';
import type { IEventManager } from './event-manager';
import type { IExceptionHandler } from './exception-handler';

/**
 * Bundle of all platform adapters required to initialize Shipbook
 */
export interface PlatformAdapters {
  storage: IStorage;
  platform: IPlatform;
  eventManager: IEventManager;
  exceptionHandler: IExceptionHandler;
}
