import { connectionClient, logManager } from '@shipbook/core';
import type { IStorage, IPlatform, IEventManager, IExceptionHandler, ConfigResponse } from '@shipbook/core';
import sessionManager from '../src/session-manager';

class MemoryStorage implements IStorage {
  items = new Map<string, string>();
  corruptKeys = new Set<string>();

  async getItem(key: string) { return this.items.get(key) ?? null; }
  async setItem(key: string, value: string) { this.items.set(key, value); }
  async removeItem(key: string) { this.items.delete(key); this.corruptKeys.delete(key); }
  async getObj<T = object>(key: string): Promise<T | undefined> {
    if (this.corruptKeys.has(key)) throw new SyntaxError('Unexpected token in JSON');
    const value = this.items.get(key);
    return value ? JSON.parse(value) as T : undefined;
  }
  async setObj(key: string, value: object) { this.items.set(key, JSON.stringify(value)); }
  async pushArrayObj() {}
  async popAllArrayObj() { return []; }
  async arraySize() { return 0; }
}

const platform: IPlatform = { os: 'test', osVersion: '1', platformName: 'browser', language: 'en-US' };
const eventManager: IEventManager = { onBackground: () => () => {}, onForeground: () => () => {}, destroy() {} };
const exceptionHandler: IExceptionHandler = { start() {}, stop() {}, isActive: () => false };

const customConfig: ConfigResponse = {
  appenders: [{ type: 'ConsoleAppender', name: 'cachedConsole' }],
  loggers: [{ name: '', severity: 'Verbose', appenderRef: 'cachedConsole' }]
};

describe('SessionManager.login cached config handling', () => {
  let storage: MemoryStorage;
  let configSpy: jest.SpyInstance;

  const appliedAppenderNames = () => (configSpy.mock.calls[0][0] as ConfigResponse).appenders.map(a => a.name);

  beforeEach(() => {
    storage = new MemoryStorage();
    sessionManager.init({ storage, platform, eventManager, exceptionHandler });
    sessionManager.loginObj = undefined;
    configSpy = jest.spyOn(logManager, 'config').mockImplementation(() => {});
    jest.spyOn(connectionClient, 'request').mockResolvedValue({ ok: false, status: 400, text: async () => '' } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('corrupt cached config is discarded and login still happens', async () => {
    await storage.setItem('config', '�� not json');
    storage.corruptKeys.add('config');

    await sessionManager.login('appId', 'appKey');

    expect(sessionManager.loginObj).toBeDefined();
    expect(await storage.getItem('config')).toBeNull();
    expect(appliedAppenderNames()).toContain('cloud');
    expect(connectionClient.request).toHaveBeenCalledWith('auth/loginSdk', expect.anything(), expect.anything());
  });

  test('valid cached config is used', async () => {
    await storage.setObj('config', customConfig);

    await sessionManager.login('appId', 'appKey');

    expect(sessionManager.loginObj).toBeDefined();
    expect(appliedAppenderNames()).toEqual(['cachedConsole']);
  });

  test('missing cached config falls back to the default config', async () => {
    await sessionManager.login('appId', 'appKey');

    expect(sessionManager.loginObj).toBeDefined();
    expect(appliedAppenderNames()).toContain('cloud');
  });
});
