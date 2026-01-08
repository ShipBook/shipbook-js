import { Platform, NativeModules, Dimensions, PlatformAndroidStatic } from 'react-native';
import type { IPlatform } from '@shipbook/core';

/**
 * React Native platform adapter
 */
class ReactNativePlatform implements IPlatform {
  get os(): string {
    return Platform.OS;
  }

  get osVersion(): string {
    return String(Platform.Version);
  }

  get platformName(): 'react-native' {
    return 'react-native';
  }

  get manufacturer(): string {
    if (Platform.OS === 'android') {
      const p = Platform as PlatformAndroidStatic;
      return p.constants.Manufacturer ?? 'google';
    }
    return 'apple';
  }

  get model(): string {
    if (Platform.OS === 'android') {
      const p = Platform as PlatformAndroidStatic;
      return p.constants.Model;
    }
    return '';
  }

  get language(): string {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      return (
        settings?.AppleLocale ||
        (Array.isArray(settings?.AppleLanguages) && settings.AppleLanguages.length > 0
          ? settings.AppleLanguages[0]
          : 'en')
      );
    } else {
      // Android
      return NativeModules.I18nManager?.localeIdentifier || 'en';
    }
  }

  get orientation(): string {
    const dim = Dimensions.get('screen');
    return dim.height >= dim.width ? 'portrait' : 'landscape';
  }

  get bundleIdentifier(): string {
    // This would need react-native-device-info for accurate bundle ID
    return '';
  }

  get appName(): string {
    // This would need react-native-device-info for accurate app name
    return '';
  }
}

export const platform = new ReactNativePlatform();
