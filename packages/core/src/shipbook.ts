import InnerLog from './utils/inner-log';
import Log from './log';
import logManager from './log-manager';
import ScreenEvent from './models/screen-event';
import { connectionClient } from './networking';
import sessionManager from './session-manager';
import type { PlatformAdapters } from './interfaces';
import type { LoginOptions } from './models/login';

/**
 * Main Shipbook SDK class
 * 
 * Usage:
 * 1. Platform packages call Shipbook.configure() with platform adapters
 * 2. Users call Shipbook.start() with their app credentials
 * 3. Users get loggers via Shipbook.getLogger()
 */
export default class Shipbook {
  private static configured = false;

  /**
   * Configure Shipbook with platform-specific adapters
   * This is called by platform packages (react-native, browser, node)
   */
  static configure(adapters: PlatformAdapters): void {
    sessionManager.configure(adapters);
    Shipbook.configured = true;
  }

  /**
   * Start Shipbook with your app credentials
   * 
   * @param appId Your Shipbook app ID
   * @param appKey Your Shipbook app key
   * @param options Optional configuration (appVersion, appBuild)
   * @returns Session URL if successful
   */
  static async start(
    appId: string, 
    appKey: string, 
    options?: LoginOptions
  ): Promise<string | undefined> {
    if (!Shipbook.configured) {
      throw new Error(
        'Shipbook not configured. Import from a platform package (@shipbook/react-native, @shipbook/browser, or @shipbook/node)'
      );
    }
    return await sessionManager.login(appId, appKey, options);
  }

  /**
   * Enable or disable internal SDK logging (for debugging)
   */
  static enableInnerLog(enable: boolean): void {
    InnerLog.enabled = enable;
  }

  /**
   * Set a custom API URL (for enterprise deployments)
   */
  static setConnectionUrl(url: string): void {
    connectionClient.BASE_URL = url;
  }

  /**
   * Register the current user for tracking
   */
  static registerUser(
    userId: string,
    userName?: string,
    fullName?: string,
    email?: string,
    phoneNumber?: string,
    additionalInfo?: object
  ): void {
    sessionManager.registerUser(userId, userName, fullName, email, phoneNumber, additionalInfo);
  }

  /**
   * Logout the current user and start a new session
   */
  static logout(): void {
    sessionManager.logout();
  }

  /**
   * Get a logger instance for a specific tag/module
   * 
   * @param tag The tag/module name for this logger
   * @returns A Log instance
   */
  static getLogger(tag: string): Log {
    return new Log(tag);
  }

  /**
   * Flush all pending logs to the server
   */
  static flush(): void {
    logManager.flush();
  }

  /**
   * Log a screen view event
   * 
   * @param name The screen name
   */
  static screen(name: string): void {
    const event = new ScreenEvent(name);
    logManager.push(event);
  }

  /**
   * Get the unique device ID
   */
  static getUUID(): string | undefined {
    return sessionManager.getUUID();
  }
}
