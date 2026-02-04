import { storage } from '../src/adapters/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const storagePath = process.env.SHIPBOOK_STORAGE_PATH || path.join(os.tmpdir(), '.shipbook');

// Clean up test files
async function cleanupTestFiles() {
  try {
    const files = await fs.promises.readdir(storagePath);
    for (const file of files) {
      if (file.startsWith('test_')) {
        await fs.promises.unlink(path.join(storagePath, file));
      }
    }
  } catch {
    // Directory doesn't exist, ignore
  }
}

describe('NodeStorage (memory-only)', () => {
  beforeEach(() => {
    storage.setMemoryOnly(true);
    storage.clear();
  });

  describe('setItem/getItem', () => {
    it('should store and retrieve string values', async () => {
      await storage.setItem('key1', 'value1');
      const result = await storage.getItem('key1');
      expect(result).toBe('value1');
    });

    it('should return null for non-existent keys', async () => {
      const result = await storage.getItem('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('removeItem', () => {
    it('should remove stored values', async () => {
      await storage.setItem('key1', 'value1');
      await storage.removeItem('key1');
      const result = await storage.getItem('key1');
      expect(result).toBeNull();
    });
  });

  describe('setObj/getObj', () => {
    it('should store and retrieve objects', async () => {
      const obj = { name: 'test', count: 42 };
      await storage.setObj('obj1', obj);
      const result = await storage.getObj('obj1');
      expect(result).toEqual(obj);
    });

    it('should return undefined for non-existent keys', async () => {
      const result = await storage.getObj('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('pushArrayObj/popAllArrayObj', () => {
    it('should push and pop single objects', async () => {
      await storage.pushArrayObj('arr1', { id: 1 });
      await storage.pushArrayObj('arr1', { id: 2 });

      const result = await storage.popAllArrayObj('arr1');
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should push array of objects', async () => {
      await storage.pushArrayObj('arr1', [{ id: 1 }, { id: 2 }]);

      const result = await storage.popAllArrayObj('arr1');
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should clear array after popAll', async () => {
      await storage.pushArrayObj('arr1', { id: 1 });
      await storage.popAllArrayObj('arr1');

      const result = await storage.popAllArrayObj('arr1');
      expect(result).toEqual([]);
    });

    it('should return empty array for non-existent key', async () => {
      const result = await storage.popAllArrayObj('non-existent');
      expect(result).toEqual([]);
    });
  });

  describe('arraySize', () => {
    it('should return correct size', async () => {
      await storage.pushArrayObj('arr1', { id: 1 });
      await storage.pushArrayObj('arr1', { id: 2 });
      await storage.pushArrayObj('arr1', { id: 3 });

      const size = await storage.arraySize('arr1');
      expect(size).toBe(3);
    });

    it('should return 0 for non-existent key', async () => {
      const size = await storage.arraySize('non-existent');
      expect(size).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all stored data', async () => {
      await storage.setItem('key1', 'value1');
      await storage.setObj('obj1', { name: 'test' });
      await storage.pushArrayObj('arr1', { id: 1 });

      storage.clear();

      expect(await storage.getItem('key1')).toBeNull();
      expect(await storage.getObj('obj1')).toBeUndefined();
      expect(await storage.popAllArrayObj('arr1')).toEqual([]);
    });
  });
});

describe('NodeStorage (with filesystem)', () => {
  beforeEach(async () => {
    storage.setMemoryOnly(false);
    storage.clear();
    await cleanupTestFiles();
  });

  afterEach(async () => {
    await cleanupTestFiles();
  });

  it('should persist data to filesystem', async () => {
    await storage.setItem('test_key', 'test_value');

    // Clear memory to force read from filesystem
    storage.clear();

    const result = await storage.getItem('test_key');
    expect(result).toBe('test_value');
  });

  it('should persist objects to filesystem', async () => {
    const obj = { name: 'fs_test', count: 99 };
    await storage.setObj('test_obj', obj);

    storage.clear();

    const result = await storage.getObj('test_obj');
    expect(result).toEqual(obj);
  });

  it('should persist arrays to filesystem', async () => {
    await storage.pushArrayObj('test_arr', { id: 1 });
    await storage.pushArrayObj('test_arr', { id: 2 });

    storage.clear();

    const size = await storage.arraySize('test_arr');
    expect(size).toBe(2);
  });

  it('should remove files on removeItem', async () => {
    await storage.setItem('test_remove', 'value');
    await storage.removeItem('test_remove');

    storage.clear();

    const result = await storage.getItem('test_remove');
    expect(result).toBeNull();
  });
});
