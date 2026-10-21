import * as fs from 'fs';
import * as path from 'path';
import { storage } from '../src/adapters/storage';

// A fresh module is a new process's storage: no memory cache, only what's on disk.
const freshStorage = () => {
  let fresh!: typeof storage;
  jest.isolateModules(() => { fresh = require('../src/adapters/storage').storage; });
  return fresh;
};

describe('NodeStorage', () => {
  it('returns a stored item and null for a missing one', async () => {
    await storage.setItem('machine_udid', 'udid-1');

    expect(await storage.getItem('machine_udid')).toBe('udid-1');
    expect(await storage.getItem('missing')).toBeNull();
  });

  it('round-trips an object and returns undefined for a missing one', async () => {
    await storage.setObj('config', { maxTime: 3 });

    expect(await storage.getObj('config')).toEqual({ maxTime: 3 });
    expect(await storage.getObj('missing-config')).toBeUndefined();
  });

  it('persists to the storage folder, so the next process reads it', async () => {
    await storage.setItem('persisted', 'value');

    expect(fs.existsSync(path.join(process.env.SHIPBOOK_STORAGE_PATH!, 'persisted.json'))).toBe(true);
    expect(await freshStorage().getItem('persisted')).toBe('value');
  });

  it('falls back to memory when the folder is not writable', async () => {
    const folder = process.env.SHIPBOOK_STORAGE_PATH;
    process.env.SHIPBOOK_STORAGE_PATH = '/dev/null/shipbook';
    const memoryOnly = freshStorage();
    process.env.SHIPBOOK_STORAGE_PATH = folder;

    await memoryOnly.setItem('key', 'value');

    expect(await memoryOnly.getItem('key')).toBe('value');
  });
});
