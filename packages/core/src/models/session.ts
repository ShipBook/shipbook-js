import type User from './user';
import type BaseLog from './base-log';

// =============================================================================
// Platform Types
// =============================================================================

/**
 * Platform enum matching server's Platform enum.
 * @see Server: src/models/interfaces/platform.interface.ts
 */
export enum Platform {
  IOS = 'ios',
  TVOS = 'tvos',
  ANDROID = 'android',
  REACT_NATIVE = 'react-native',
  FLUTTER = 'flutter',
  BROWSER = 'browser',
  NODE = 'node'
}

// =============================================================================
// Device Types
// =============================================================================

/**
 * Browser information.
 * @see Server: src/models/interfaces/device.interface.ts - IBrowser
 */
export interface Browser {
  userAgent: string;
  name: string;
  version: string;
}

/**
 * Device information.
 * @see Server: src/models/interfaces/device.interface.ts - IDevice
 */
export interface DeviceInfo {
  udid: string;
  manufacturer?: string;
  deviceModel?: string;
  deviceName?: string;
  advertisementId?: string;
  os: Platform;
  config?: object;
  browser?: Browser;
}

// =============================================================================
// Version Types
// =============================================================================

/**
 * Version information.
 * @see Server: src/models/interfaces/session.interface.ts - IVersionInfo
 */
export interface VersionInfo {
  version?: string;
  versionCode?: number;
  build?: string;
}

/**
 * Application version information.
 * @see Server: src/models/interfaces/session.interface.ts - IAppVersionInfo
 */
export interface AppVersionInfo extends VersionInfo {
  isDebug?: boolean;
  isObfuscated?: boolean;
}

/**
 * Operating system information.
 * @see Server: src/models/interfaces/session.interface.ts - os field
 */
export interface OsInfo {
  name: string;
  version: string;
}

/**
 * Cell/network information.
 * @see Server: src/models/interfaces/session.interface.ts - cellInfo field
 */
export interface CellInfo {
  country: string;
  networkId: string;
}


// =============================================================================
// Session Types
// =============================================================================

/**
 * Session data structure sent to the server.
 * @see Server: src/models/interfaces/session.interface.ts
 *
 * Note: Server-only fields excluded: app, _id, _index, joinField
 */
export interface Session {
  sessionId?: string;
  platform: Platform;
  metadata?: Record<string, unknown>;
  isBackground?: boolean;
  jobName?: string;
  callerApp?: string; // Set by backend SDKs from the incoming x-shipbook-session header
  callerSessionId?: string;
  deviceInfo: DeviceInfo;
  time: string;  // ISO string, server parses as Date
  deviceTime?: string;  // ISO string, server parses as Date
  ipAddress?: string;
  language?: string;
  appInfo: AppVersionInfo;
  sdkInfo: VersionInfo;
  cellInfo?: CellInfo;
  os: OsInfo;
  userInfo?: User;
  logs?: BaseLog[];
}

// Cross-app session link: client SDKs send "<version>:<appId>:<sessionId>" on requests to the customer's backend.
export const SESSION_LINK_HEADER = 'x-shipbook-session';
export const SESSION_LINK_VERSION = '1';

export interface SessionLink {
  appId: string;
  sessionId: string;
}

// Unknown versions are rejected so older backend SDKs ignore future formats instead of storing garbage.
export function parseSessionLinkHeader(value?: string): SessionLink | undefined {
  if (!value) return undefined;
  const [version, appId, sessionId, ...rest] = value.split(':');
  if (version !== SESSION_LINK_VERSION || !appId || !sessionId || rest.length) return undefined;
  return { appId, sessionId };
}

