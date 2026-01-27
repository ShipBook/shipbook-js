import { v4 as uuidv4 } from 'uuid';
import type { IPlatform } from '../interfaces/platform';
import type { IStorage } from '../interfaces/storage';
import type User from './user';
import { SDK_VERSION } from '../generated/version';

const UUID_KEY = 'uuid';

/**
 * Internal SDK configuration set by platform packages.
 * Not exposed to end users.
 */
export const sdkConfig = {
  sdkPlatformVersion: undefined as string | undefined
};

/**
 * Login data sent to the server
 */
export interface LoginData {
  appId: string;
  appKey: string;
  bundleIdentifier?: string;
  appName?: string;
  udid: string;
  time: Date;
  deviceTime: Date;
  os: string;
  platform: string;
  osVersion: string;
  appVersion?: string;
  appBuild?: string;
  sdkVersion: string;
  sdkPlatformVersion?: string;
  manufacturer?: string;
  deviceName?: string;
  deviceModel?: string;
  language: string;
  isDebug?: boolean;
  user?: User;
  userAgent?: string;
}

export interface LoginOptions {
  appVersion?: string;
  appBuild?: string;
}

/**
 * Login model - uses injected platform and storage adapters
 */
export class Login {
  appId: string;
  appKey: string;
  bundleIdentifier?: string;
  appName?: string;
  udid: string = '';
  time: Date;
  deviceTime: Date;
  os: string;
  platform: string;
  osVersion: string;
  appVersion?: string;
  appBuild?: string;
  sdkVersion: string = SDK_VERSION;
  sdkPlatformVersion?: string;
  manufacturer?: string;
  deviceName?: string;
  deviceModel?: string;
  language: string;
  isDebug?: boolean;
  user?: User;
  userAgent?: string;

  private storage: IStorage;

  constructor(
    appId: string,
    appKey: string,
    platformAdapter: IPlatform,
    storage: IStorage,
    options?: LoginOptions
  ) {
    this.appId = appId;
    this.appKey = appKey;
    this.storage = storage;

    // Set optional values if provided
    if (options?.appVersion) this.appVersion = options.appVersion;
    if (options?.appBuild) this.appBuild = options.appBuild;

    // Set platform version from internal SDK config (set by platform packages)
    this.sdkPlatformVersion = sdkConfig.sdkPlatformVersion;

    this.time = new Date();
    this.deviceTime = this.time;

    // Get platform info from adapter
    this.os = platformAdapter.os;
    this.osVersion = platformAdapter.osVersion;
    this.platform = platformAdapter.platformName;
    this.manufacturer = platformAdapter.manufacturer || undefined;
    this.deviceModel = platformAdapter.model || undefined;
    this.language = platformAdapter.language;
    this.bundleIdentifier = platformAdapter.bundleIdentifier || undefined;
    this.appName = platformAdapter.appName || undefined;
    this.userAgent = platformAdapter.userAgent;
  }

  async getObj(): Promise<Login> {
    if (!this.udid) {
      const uuid = await this.storage.getItem(UUID_KEY);
      if (uuid) {
        this.udid = uuid;
      } else {
        this.udid = uuidv4();
        await this.storage.setItem(UUID_KEY, this.udid);
      }
    }
    return this;
  }
}
