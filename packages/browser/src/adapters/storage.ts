import { type IStorage, InnerLog } from '@shipbook/core';

/**
 * Browser storage adapter using IndexedDB for efficient large-scale storage
 * Gracefully handles all errors to never crash the host application
 */
class BrowserStorage implements IStorage {
  private dbName = 'ShipbookDB';
  private version = 2;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private initFailed = false;

  // Store name - only need one for arrays
  private readonly ARRAY_STORE = 'arrays';

  /**
   * Wraps IndexedDB request into a Promise
   */
  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Waits for a transaction to complete
   */
  private waitForTx(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * Opens and initializes the IndexedDB database
   */
  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

        // Create array store with auto-increment and indexes for logs
        if (!db.objectStoreNames.contains(this.ARRAY_STORE)) {
          const arrayStore = db.createObjectStore(this.ARRAY_STORE, {
            keyPath: 'id',
            autoIncrement: true
          });
          arrayStore.createIndex('arrayKey', 'arrayKey', { unique: false });
        }

        // Migration from version 1 to 2: remove timestamp index
        if (oldVersion < 2 && db.objectStoreNames.contains(this.ARRAY_STORE)) {
          const transaction = (event.target as IDBOpenDBRequest).transaction;
          if (transaction) {
            const store = transaction.objectStore(this.ARRAY_STORE);
            if (store.indexNames.contains('timestamp')) {
              store.deleteIndex('timestamp');
            }
          }
        }
      };
    });
  }

  /**
   * Ensures database is initialized before use
   */
  private async ensureDB(): Promise<IDBDatabase | null> {
    if (this.initFailed) return null;
    if (this.db) return this.db;

    // Initialize only once, even if called multiple times
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          this.db = await this.openDatabase();
        } catch (error) {
          InnerLog.e('Failed to initialize IndexedDB', error);
          this.initFailed = true;
        }
      })();
    }

    await this.initPromise.catch(() => {});
    return this.db;
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      InnerLog.e('setItem error', error);
    }
  }

  async getItem(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      InnerLog.e('getItem error', error);
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      InnerLog.e('removeItem error', error);
    }
  }

  async setObj(key: string, value: object): Promise<void> {
    try {
      await this.setItem(key, JSON.stringify(value));
    } catch (error) {
      InnerLog.e('setObj error', error);
    }
  }

  async getObj<T = object>(key: string): Promise<T | undefined> {
    try {
      const value = await this.getItem(key);
      if (!value) return undefined;
      return JSON.parse(value) as T;
    } catch (error) {
      InnerLog.e('getObj error', error);
      return undefined;
    }
  }

  async pushArrayObj(key: string, value: object | object[]): Promise<void> {
    try {
      const db = await this.ensureDB();
      if (!db) return;

      const items = Array.isArray(value) ? value : [value];

      // Sanitize items to ensure they can be cloned by IndexedDB
      // JSON.parse(JSON.stringify()) removes functions, symbols, and other non-cloneable properties
      const sanitizedItems = JSON.parse(JSON.stringify(items));

      const tx = db.transaction([this.ARRAY_STORE], 'readwrite');
      const store = tx.objectStore(this.ARRAY_STORE);

      // Add all items without awaiting to keep transaction alive
      for (const item of sanitizedItems) {
        store.add({
          arrayKey: key,
          data: item
        });
      }

      // Fire-and-forget: don't wait for transaction to complete
      // Log errors if they occur
      tx.onerror = () => InnerLog.e('pushArrayObj transaction error', tx.error);
    } catch (error) {
      InnerLog.e('pushArrayObj error', error);
    }
  }

  async popAllArrayObj(key: string): Promise<object[]> {
    try {
      const db = await this.ensureDB();
      if (!db) return [];

      // Get and delete all items in a single transaction to avoid race conditions
      const tx = db.transaction([this.ARRAY_STORE], 'readwrite');
      const store = tx.objectStore(this.ARRAY_STORE);
      const index = store.index('arrayKey');

      // Get all items
      const items = await this.promisifyRequest(index.getAll(key));
      const objects = items.map((item: any) => item.data);

      // Delete all items by their primary key (id)
      // Don't await individual deletes to keep transaction alive
      for (const item of items) {
        store.delete(item.id);
      }

      // Wait for transaction to complete
      await this.waitForTx(tx);

      return objects;
    } catch (error) {
      InnerLog.e('popAllArrayObj error', error);
      return [];
    }
  }

  async arraySize(key: string): Promise<number> {
    try {
      const db = await this.ensureDB();
      if (!db) return 0;

      const tx = db.transaction([this.ARRAY_STORE], 'readonly');
      const store = tx.objectStore(this.ARRAY_STORE);
      const index = store.index('arrayKey');
      return await this.promisifyRequest(index.count(key));
    } catch (error) {
      InnerLog.e('arraySize error', error);
      return 0;
    }
  }
}

export const storage = new BrowserStorage();
