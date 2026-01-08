import * as os from 'os';
import type { IPlatform } from '@shipbook/core';

/**
 * Node.js platform adapter
 */
class NodePlatform implements IPlatform {
  get os(): string {
    return process.platform;
  }

  get osVersion(): string {
    return os.release();
  }

  get platformName(): 'node' {
    return 'node';
  }

  get manufacturer(): string {
    // Node.js doesn't have manufacturer info
    return 'unknown';
  }

  get model(): string {
    // Return CPU model as "model"
    const cpus = os.cpus();
    return cpus.length > 0 ? cpus[0].model : 'unknown';
  }

  get language(): string {
    // Get language from environment variables
    return process.env.LANG 
      || process.env.LANGUAGE 
      || process.env.LC_ALL 
      || 'en';
  }

  get orientation(): string {
    // Not applicable for Node.js
    return 'unknown';
  }

  get bundleIdentifier(): string {
    // Use package name from package.json if available
    try {
      const pkg = require(process.cwd() + '/package.json');
      return pkg.name || '';
    } catch {
      return '';
    }
  }

  get appName(): string {
    // Use package name or process title
    try {
      const pkg = require(process.cwd() + '/package.json');
      return pkg.name || process.title || '';
    } catch {
      return process.title || '';
    }
  }
}

export const platform = new NodePlatform();
