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
  // Memory fallback for array storage (one JSON-encoded line per item). Used when
  // filesystem is unavailable (PaaS/serverless with no writable disk, or test mode).
  private memoryArrays = new Map<string, string[]>();
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

  private getFilePath(key: string, ext = '.json', suffix = ''): string {
    // Sanitize key for filesystem
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storagePath, `${safeKey}${suffix}${ext}`);
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

  // Append-only JSONL queue. One fs.appendFile syscall per push regardless of how many
  // items — the OS handles the atomic append. No read-then-write race window like the
  // old per-item-file design had.
  async pushArrayObj(key: string, value: object | object[]): Promise<void> {
    await this.initialize();

    const items = Array.isArray(value) ? value : [value];
    const encoded = items.map(item => JSON.stringify(item));

    if (this.fsEnabled) {
      try {
        await fs.promises.appendFile(this.getFilePath(key, '.jsonl'), encoded.join('\n') + '\n', 'utf-8');
        return;
      } catch {
        this.fsEnabled = false;
      }
    }

    const arr = this.memoryArrays.get(key) ?? [];
    arr.push(...encoded);
    this.memoryArrays.set(key, arr);
  }

  // Atomic rotate: rename live file aside so concurrent pushes write to a fresh file.
  // Then read, parse, unlink. No locking needed; rename is atomic on every POSIX fs.
  async popAllArrayObj(key: string): Promise<object[]> {
    await this.initialize();

    if (this.fsEnabled) {
      const live = this.getFilePath(key, '.jsonl');
      const consuming = this.getFilePath(key, '.jsonl', '_consuming');
      try {
        await fs.promises.rename(live, consuming);
      } catch {
        return [];  // file doesn't exist — nothing to drain
      }
      try {
        const content = await fs.promises.readFile(consuming, 'utf-8');
        await fs.promises.unlink(consuming);
        return content.split('\n').reduce<object[]>((acc, line) => {
          if (!line) return acc;
          try { acc.push(JSON.parse(line)); } catch { /* skip malformed */ }
          return acc;
        }, []);
      } catch {
        return [];
      }
    }

    const snapshot = this.memoryArrays.get(key) ?? [];
    this.memoryArrays.delete(key);
    return snapshot.reduce<object[]>((acc, line) => {
      try { acc.push(JSON.parse(line)); } catch { /* skip */ }
      return acc;
    }, []);
  }

  async arraySize(key: string): Promise<number> {
    await this.initialize();

    if (this.fsEnabled) {
      try {
        const content = await fs.promises.readFile(this.getFilePath(key, '.jsonl'), 'utf-8');
        // Lines are newline-terminated, so a trailing empty split element doesn't count.
        let count = 0;
        for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) count++;
        return count;
      } catch {
        return 0;
      }
    }

    return this.memoryArrays.get(key)?.length ?? 0;
  }

  /**
   * Check if filesystem storage is enabled
   */
  isFileSystemEnabled(): boolean {
    return this.fsEnabled;
  }

  /**
   * Clear all in-memory storage
   */
  clear(): void {
    this.memoryStorage.clear();
    this.memoryArrays.clear();
  }
}

export const storage = new NodeStorage();
