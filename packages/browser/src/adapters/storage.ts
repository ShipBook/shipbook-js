import type { IStorage } from '@shipbook/core';

/**
 * Browser storage adapter using localStorage
 */
class BrowserStorage implements IStorage {
  private storage: Storage;

  constructor() {
    // Use localStorage by default, fallback to sessionStorage if not available
    this.storage = typeof localStorage !== 'undefined' 
      ? localStorage 
      : sessionStorage;
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      this.storage.setItem(key, value);
    } catch (e) {
      // Storage might be full or disabled
      console.warn('Shipbook: Failed to save to storage', e);
    }
  }

  async getItem(key: string): Promise<string | null> {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      this.storage.removeItem(key);
    } catch {
      // Ignore errors
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
    const sizeStr = this.storage.getItem(`${key}_size`);
    let size = Number(sizeStr ?? '0');

    const items = Array.isArray(value) ? value : [value];
    
    for (const item of items) {
      this.storage.setItem(`${key}_${size}`, JSON.stringify(item));
      size++;
    }

    this.storage.setItem(`${key}_size`, size.toString());
  }

  async popAllArrayObj(key: string): Promise<object[]> {
    const sizeStr = this.storage.getItem(`${key}_size`);
    const size = Number(sizeStr ?? '0');

    if (size === 0) return [];

    const objects: object[] = [];
    const keysToRemove: string[] = [];

    for (let i = 0; i < size; i++) {
      const itemKey = `${key}_${i}`;
      const value = this.storage.getItem(itemKey);
      if (value) {
        try {
          objects.push(JSON.parse(value));
        } catch {
          // Skip invalid items
        }
      }
      keysToRemove.push(itemKey);
    }

    // Clean up
    keysToRemove.forEach(k => this.storage.removeItem(k));
    this.storage.removeItem(`${key}_size`);

    return objects;
  }

  async arraySize(key: string): Promise<number> {
    const sizeStr = this.storage.getItem(`${key}_size`);
    return Number(sizeStr ?? '0');
  }
}

export const storage = new BrowserStorage();
