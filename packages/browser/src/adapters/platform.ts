import type { IPlatform } from '@shipbook/core';

/**
 * Browser platform adapter
 */
class BrowserPlatform implements IPlatform {
  get os(): string {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('win')) return 'windows';
    if (userAgent.includes('mac')) return 'macos';
    if (userAgent.includes('linux')) return 'linux';
    if (userAgent.includes('android')) return 'android';
    if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'ios';
    
    return 'unknown';
  }

  get osVersion(): string {
    const userAgent = navigator.userAgent;
    
    // Try to extract OS version from user agent
    const matches = userAgent.match(/(?:Windows NT|Mac OS X|Android|iPhone OS|iPad OS)[/ ]?([\d._]+)/i);
    if (matches && matches[1]) {
      return matches[1].replace(/_/g, '.');
    }
    
    return 'unknown';
  }

  get platformName(): 'browser' {
    return 'browser';
  }

  get manufacturer(): string {
    // Browser doesn't have manufacturer info
    return 'unknown';
  }

  get model(): string {
    // Try to get browser name as "model"
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    
    return 'Browser';
  }

  get language(): string {
    return navigator.language || 'en';
  }

  get orientation(): string {
    if (typeof screen !== 'undefined' && screen.orientation) {
      return screen.orientation.type.includes('portrait') ? 'portrait' : 'landscape';
    }
    
    // Fallback based on window dimensions
    return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
  }

  get bundleIdentifier(): string {
    // Use hostname as bundle identifier for browser
    return typeof window !== 'undefined' ? window.location.hostname : '';
  }

  get appName(): string {
    // Use document title or hostname
    return typeof document !== 'undefined' 
      ? document.title || window.location.hostname 
      : '';
  }
}

export const platform = new BrowserPlatform();
