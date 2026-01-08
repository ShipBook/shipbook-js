import { v4 as uuidv4 } from 'uuid';
import type { IPlatform } from '../interfaces/platform';
import type { IStorage } from '../interfaces/storage';
import type User from './user';

const UUID_KEY = 'uuid';
const SDK_VERSION = '0.3.0';

/**
 * Login data sent to the server
 */
export interface LoginData {
  appId: string;
  appKey: string;
  bundleIdentifier: string;
  appName: string;
  udid: string;
  time: Date;
  deviceTime: Date;
  os: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  appBuild: string;
  sdkVersion: string;
  manufacturer: string;
  deviceName: string;
  deviceModel: string;
  language: string;
  isDebug?: boolean;
  user?: User;
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
  bundleIdentifier: string = '';
  appName: string = '';
  udid: string = '';
  time: Date;
  deviceTime: Date;
  os: string;
  platform: string;
  osVersion: string;
  appVersion: string = '';
  appBuild: string = '';
  sdkVersion: string = SDK_VERSION;
  manufacturer: string = '';
  deviceName: string = '';
  deviceModel: string = '';
  language: string;
  isDebug?: boolean;
  user?: User;

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

    this.time = new Date();
    this.deviceTime = this.time;

    // Get platform info from adapter
    this.os = platformAdapter.os;
    this.osVersion = platformAdapter.osVersion;
    this.platform = platformAdapter.platformName;
    this.manufacturer = platformAdapter.manufacturer ?? '';
    this.deviceModel = platformAdapter.model ?? '';
    this.language = platformAdapter.language;
    this.bundleIdentifier = platformAdapter.bundleIdentifier ?? '';
    this.appName = platformAdapter.appName ?? '';
  }

  async getObj(): Promise<Login> {
    if (this.udid.length === 0) {
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
