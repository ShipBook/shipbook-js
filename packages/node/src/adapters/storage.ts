import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Node.js key-value storage (machine udid, cached config) with filesystem + memory fallback
 * Supports PaaS/serverless environments where filesystem may be unavailable
 */
class NodeStorage {
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
}

export const storage = new NodeStorage();
