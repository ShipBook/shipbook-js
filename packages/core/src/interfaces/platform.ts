/**
 * Platform interface for device/environment information.
 * 
 * Implementations provide platform-specific device details.
 */
export interface IPlatform {
  /**
   * Operating system name (e.g., 'ios', 'android', 'windows', 'linux', 'darwin')
   */
  readonly os: string;

  /**
   * OS version string
   */
  readonly osVersion: string;

  /**
   * Platform identifier ('react-native' | 'browser' | 'node')
   */
  readonly platformName: 'react-native' | 'browser' | 'node';

  /**
   * Device manufacturer (e.g., 'apple', 'samsung')
   * Optional - may not be available on all platforms
   */
  readonly manufacturer?: string;

  /**
   * Device model (e.g., 'iPhone 14', 'Pixel 7')
   * Optional - may not be available on all platforms
   */
  readonly model?: string;

  /**
   * User's language/locale (e.g., 'en-US', 'de-DE')
   */
  readonly language: string;

  /**
   * Screen orientation ('portrait' | 'landscape')
   * Optional - may not be relevant on all platforms
   */
  readonly orientation?: string;

  /**
   * Bundle identifier / package name
   * Optional - may not be available on all platforms
   */
  readonly bundleIdentifier?: string;

  /**
   * Application name
   * Optional - may not be available on all platforms
   */
  readonly appName?: string;
}
