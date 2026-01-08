import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { IStorage } from '@shipbook/core';

/**
 * Node.js storage adapter with filesystem + memory fallback
 * Supports PaaS/serverless environments where filesystem may be unavailable
 */
class NodeStorage implements IStorage {
  private memoryStorage = new Map<string, string>();
  private fsEnabled = true;
  private storagePath: string;
  private initialized = false;

  constructor() {
    // Allow override via environment variable (useful for Lambda /tmp)
    this.storagePath = process.env.SHIPBOOK_STORAGE_PATH 
      || path.join(os.tmpdir(), '.shipbook');
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    this.fsEnabled = await this.testFileSystemAccess();
    this.initialized = true;
  }

  private async testFileSystemAccess(): Promise<boolean> {
    try {
      // Try to create storage directory
      await fs.promises.mkdir(this.storagePath, { recursive: true });
      
      // Try to write and read a test file
      const testFile = path.join(this.storagePath, '.test');
      await fs.promises.writeFile(testFile, 'test');
      await fs.promises.unlink(testFile);
      
      return true;
    } catch {
      return false;
    }
  }

  private getFilePath(key: string): string {
    // Sanitize key for filesystem
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storagePath, `${safeKey}.json`);
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.initialize();
    
    // Always store in memory (fast, survives within process)
    this.memoryStorage.set(key, value);

    // Try filesystem for persistence (best effort)
    if (this.fsEnabled) {
      try {
        await fs.promises.writeFile(this.getFilePath(key), value, 'utf-8');
      } catch {
        // Filesystem unavailable, continue with memory-only mode
        this.fsEnabled = false;
      }
    }
  }

  async getItem(key: string): Promise<string | null> {
    await this.initialize();
    
    // Check memory first
    const memValue = this.memoryStorage.get(key);
    if (memValue !== undefined) {
      return memValue;
    }

    // Try filesystem
    if (this.fsEnabled) {
      try {
        const value = await fs.promises.readFile(this.getFilePath(key), 'utf-8');
        // Cache in memory
        this.memoryStorage.set(key, value);
        return value;
      } catch {
        // File doesn't exist or can't be read
        return null;
      }
    }

    return null;
  }

  async removeItem(key: string): Promise<void> {
    await this.initialize();
    
    this.memoryStorage.delete(key);

    if (this.fsEnabled) {
      try {
        await fs.promises.unlink(this.getFilePath(key));
      } catch {
        // File doesn't exist or can't be deleted
      }
    }
  }

  async setObj(key: string, value: object): Promise<void> {
    await this.setItem(key, JSON.stringify(value));
  }

  async getObj<T = object>(key: string): Promise<T | undefined> {
    const value = await this.getItem(key);
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  async pushArrayObj(key: string, value: object | object[]): Promise<void> {
    await this.initialize();
    
    const sizeKey = `${key}_size`;
    const sizeStr = await this.getItem(sizeKey);
    let size = Number(sizeStr ?? '0');

    const items = Array.isArray(value) ? value : [value];

    for (const item of items) {
      await this.setItem(`${key}_${size}`, JSON.stringify(item));
      size++;
    }

    await this.setItem(sizeKey, size.toString());
  }

  async popAllArrayObj(key: string): Promise<object[]> {
    await this.initialize();
    
    const sizeKey = `${key}_size`;
    const sizeStr = await this.getItem(sizeKey);
    const size = Number(sizeStr ?? '0');

    if (size === 0) return [];

    const objects: object[] = [];

    for (let i = 0; i < size; i++) {
      const itemKey = `${key}_${i}`;
      const value = await this.getItem(itemKey);
      if (value) {
        try {
          objects.push(JSON.parse(value));
        } catch {
          // Skip invalid items
        }
      }
      await this.removeItem(itemKey);
    }

    await this.removeItem(sizeKey);

    return objects;
  }

  async arraySize(key: string): Promise<number> {
    const sizeStr = await this.getItem(`${key}_size`);
    return Number(sizeStr ?? '0');
  }

  /**
   * Check if filesystem storage is enabled
   */
  isFileSystemEnabled(): boolean {
    return this.fsEnabled;
  }
}

export const storage = new NodeStorage();
