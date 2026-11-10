import {
  connectionClient,
  logManager,
  HttpMethod,
  InnerLog,
  Exception,
  CORE_VERSION,
  APP_ID_HEADER,
  SDK_HEADER,
  PAUSE_HEADER,
  SESSION_LINK_HEADER
} from '@shipbook/core';
import type { IStorage, IPlatform, IEventManager, IExceptionHandler, ConfigResponse } from '@shipbook/core';
import sessionManager from '../src/session-manager';
import Shipbook from '../src/shipbook';
import { CLIENT_VERSION } from '../src/generated';

class MemoryStorage implements IStorage {
  items = new Map<string, string>();
  arrays = new Map<string, object[]>();
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
  async pushArrayObj(key: string, value: object | object[]) {
    this.arrays.set(key, [...this.arrays.get(key) ?? [], ...JSON.parse(JSON.stringify([value].flat())) as object[]]);
  }
  async popAllArrayObj(key: string) {
    const all = this.arrays.get(key) ?? [];
    this.arrays.delete(key);
    return all;
  }
  async arraySize(key: string) { return this.arrays.get(key)?.length ?? 0; }
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

describe('SDK control plane', () => {
  const NOW = Date.UTC(2026, 10, 9, 12);
  const HOUR = 60 * 60 * 1000;
  const MAX_PAUSE = 30 * 24 * HOUR;
  const SESSION_URL = 'https://console.shipbook.io/session/1';
  const sdkVersion = `core:${CORE_VERSION}/client:${CLIENT_VERSION}/browser:1.2.3`;
  const cloudConfig: ConfigResponse = {
    appenders: [{ type: 'SBCloudAppender', name: 'cloud', config: { maxTime: 5, flushSeverity: 'Verbose' } }],
    loggers: [{ name: '', severity: 'Verbose', appenderRef: 'cloud' }]
  };

  let storage: MemoryStorage;
  let now: number;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  const loginOk = (sessionUrl = SESSION_URL) =>
    new Response(JSON.stringify({ token: 'token', sessionUrl, sessionLink: 'link', config: cloudConfig }));
  const rejected = (status: number, headers: Record<string, string> = {}) => new Response('', { status, headers });

  const requestedPaths = () => fetchSpy.mock.calls.map(([url]) => String(url).replace(connectionClient.BASE_URL, ''));
  const headersOf = (call: number) => fetchSpy.mock.calls[call][1]!.headers as Headers;
  const uploadedMessages = () => fetchSpy.mock.calls
    .filter(([url]) => String(url).endsWith('sessions/uploadSavedData'))
    .flatMap(([, init]) => JSON.parse(init!.body as string) as { logs: { message?: string; name?: string }[] }[])
    .flatMap(session => session.logs.map(log => log.message ?? log.name));
  const storedMessages = () => (storage.arrays.get('session_data') ?? [])
    .map(item => (item as { data: { message?: string; name?: string } }).data)
    .flatMap(data => data.message ?? data.name ?? []);

  // Lets work nobody awaits (a log on its way to storage, a login started by a log) finish.
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  };

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.setObj('config', cloudConfig);
    Shipbook.init({ storage, platform, eventManager, exceptionHandler, platformVersion: '1.2.3' });
    sessionManager.token = undefined;
    sessionManager.sessionLink = undefined;
    now = NOW;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => loginOk());
  });

  afterEach(() => {
    logManager.config({ appenders: [], loggers: [] });
    jest.restoreAllMocks();
  });

  describe('request headers', () => {
    test('login and upload identify the app and the SDK', async () => {
      await Shipbook.start('app1', 'key1');
      Shipbook.getLogger('test').e('boom');
      await settle();
      Shipbook.flush();
      await settle();

      expect(requestedPaths()).toEqual(['auth/loginSdk', 'sessions/uploadSavedData']);
      expect(uploadedMessages()).toEqual(['boom']);
      for (const call of [0, 1]) {
        expect(headersOf(call).get(APP_ID_HEADER)).toBe('app1');
        expect(headersOf(call).get(SDK_HEADER)).toBe('browser/1.2.3');
      }
    });

    test('a request before start carries the SDK header and no app id', async () => {
      sessionManager.appId = undefined;

      await connectionClient.request('auth/loginSdk', {}, HttpMethod.POST);

      expect(headersOf(0).get(SDK_HEADER)).toBe('browser/1.2.3');
      expect(headersOf(0).has(APP_ID_HEADER)).toBe(false);
    });

    test('an adapter without a platform version reports the client version', async () => {
      Shipbook.init({ storage, platform, eventManager, exceptionHandler });

      await Shipbook.start('app1', 'key1');

      expect(headersOf(0).get(SDK_HEADER)).toBe(`browser/${CLIENT_VERSION}`);
    });
  });

  describe('refusal: x-shipbook-pause', () => {
    test.each([
      ['a 401', 401, { [PAUSE_HEADER]: '120' }, 120 * 1000],
      ['a 429 that also has Retry-After', 429, { [PAUSE_HEADER]: '120', 'Retry-After': '60' }, 120 * 1000],
      ['a 503', 503, { [PAUSE_HEADER]: '30' }, 30 * 1000],
      ['a 401 with a value above the cap', 401, { [PAUSE_HEADER]: '99999999' }, MAX_PAUSE]
    ])('on %s pauses and stores the pause', async (_name, status, headers, duration) => {
      fetchSpy.mockImplementation(async () => rejected(status, headers));

      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();

      expect(await storage.getObj('pause')).toEqual({ appId: 'app1', sdkVersion, until: NOW + duration });
      now += duration - 1;
      Shipbook.logout();
      await settle();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test.each([
      ['Retry-After alone', { 'Retry-After': '120' }],
      ['no signal', {}],
      ['a fractional x-shipbook-pause', { [PAUSE_HEADER]: '12.5' }],
      ['an x-shipbook-pause that is not a number', { [PAUSE_HEADER]: 'soon' }],
      ['x-shipbook-pause 0', { [PAUSE_HEADER]: '0' }],
      ['a negative x-shipbook-pause', { [PAUSE_HEADER]: '-5' }]
    ])('a 401 with %s changes nothing', async (_name, headers) => {
      fetchSpy.mockImplementation(async () => rejected(401, headers));

      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();

      expect(await storage.getItem('pause')).toBeNull();
      Shipbook.logout();
      await settle();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test('a 500 with Retry-After changes nothing', async () => {
      fetchSpy.mockImplementation(async () => rejected(500, { 'Retry-After': '120' }));

      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();

      expect(await storage.getItem('pause')).toBeNull();
      Shipbook.logout();
      await settle();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test('both signals on a successful response are ignored', async () => {
      fetchSpy.mockImplementation(async () =>
        new Response(await loginOk().text(), { headers: { [PAUSE_HEADER]: '120', 'Retry-After': '120' } }));

      expect(await Shipbook.start('app1', 'key1')).toBe(SESSION_URL);

      expect(await storage.getItem('pause')).toBeNull();
      expect(sessionManager.token).toBe('token');
      Shipbook.logout();
      await settle();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test('is reported once in the inner log', async () => {
      const warn = jest.spyOn(InnerLog, 'w');
      fetchSpy.mockImplementation(async () => rejected(401, { [PAUSE_HEADER]: '120', 'Retry-After': '120' }));

      await Shipbook.start('app1', 'key1');
      Shipbook.getLogger('test').e('dropped');
      Shipbook.getLogger('test').e('dropped too');
      Shipbook.logout();
      await settle();

      expect(warn.mock.calls).toEqual([
        ['paused until 2026-11-09T12:02:00.000Z: the server answered 401 with x-shipbook-pause 120']
      ]);
    });

    test('while paused nothing is sent, new logs and crashes are dropped, what was saved before is sent afterwards', async () => {
      await Shipbook.start('app1', 'key1');
      expect(Shipbook.getSessionHeaders()).toEqual({ [SESSION_LINK_HEADER]: 'link' });
      const log = Shipbook.getLogger('test');
      log.e('in the refused upload');
      await settle();
      fetchSpy.mockImplementationOnce(async () => rejected(429, { [PAUSE_HEADER]: '3600', 'Retry-After': '3600' }));
      Shipbook.flush();
      await settle();
      expect(requestedPaths()).toEqual(['auth/loginSdk', 'sessions/uploadSavedData']);
      fetchSpy.mockClear();

      log.e('dropped');
      logManager.push(new Exception('Error', 'dropped crash', ''));
      Shipbook.screen('Home');
      Shipbook.registerUser('user1');
      Shipbook.logout();
      Shipbook.flush();
      await settle();
      const local = await connectionClient.request('sessions/uploadSavedData', [], HttpMethod.POST);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(local.ok).toBe(false);
      expect(local.status).toBe(429);
      expect(storedMessages()).toEqual(['in the refused upload']);
      expect(sessionManager.token).toBeUndefined();
      expect(Shipbook.getSessionHeaders()).toEqual({});

      now += HOUR;
      log.e('after the pause');
      await settle();

      expect(requestedPaths()).toEqual(['auth/loginSdk', 'sessions/uploadSavedData']);
      expect(uploadedMessages()).toEqual(['in the refused upload', 'after the pause']);
    });

    test('the first log after the pause ends logs in again, once, and is sent', async () => {
      fetchSpy.mockImplementationOnce(async () => rejected(429, { [PAUSE_HEADER]: '60' }));
      await Shipbook.start('app1', 'key1');
      const log = Shipbook.getLogger('test');

      now += 59 * 1000;
      log.e('dropped');
      await settle();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      now += 1000;
      log.e('first after the pause');
      await settle();
      log.e('second after the pause');
      await settle();
      Shipbook.flush();
      await settle();

      expect(requestedPaths().filter(path => path === 'auth/loginSdk')).toHaveLength(2);
      expect(uploadedMessages()).toEqual(['first after the pause', 'second after the pause']);
      expect(sessionManager.token).toBe('token');
    });
  });

  describe('busy: a 429 or 503 without x-shipbook-pause', () => {
    test.each([
      ['a 429 with Retry-After 120 backs off for 120 seconds', 429, { 'Retry-After': '120' }, 120],
      ['a 503 with Retry-After 120 backs off for 120 seconds', 503, { 'Retry-After': '120' }, 120],
      ['a 429 without Retry-After backs off for 300 seconds', 429, {}, 300],
      ['a 503 without Retry-After backs off for 300 seconds', 503, {}, 300],
      ['a 503 with a Retry-After that is not a number backs off for 300 seconds', 503, { 'Retry-After': 'soon' }, 300],
      ['a 429 with Retry-After 0 backs off for 300 seconds', 429, { 'Retry-After': '0' }, 300],
      ['a 429 with Retry-After 99999 backs off for 3600 seconds', 429, { 'Retry-After': '99999' }, 3600],
      ['a 429 with an unusable x-shipbook-pause backs off for its Retry-After', 429, { [PAUSE_HEADER]: '0', 'Retry-After': '120' }, 120]
    ])('%s, keeps logs and stores nothing', async (_name, status, headers, seconds) => {
      fetchSpy.mockImplementationOnce(async () => rejected(status, headers));

      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();
      const log = Shipbook.getLogger('test');

      now += seconds * 1000 - 1;
      log.e('kept');
      await settle();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect([...storage.items.keys()].sort()).toEqual(['config', 'uuid']);

      now += 1;
      log.e('after the back-off');
      await settle();
      expect(requestedPaths()).toEqual(['auth/loginSdk', 'auth/loginSdk', 'sessions/uploadSavedData']);
      expect(uploadedMessages()).toEqual(['kept', 'after the back-off']);
    });

    test('is reported once in the inner log', async () => {
      const warn = jest.spyOn(InnerLog, 'w');
      fetchSpy.mockImplementation(async () => rejected(429));

      await Shipbook.start('app1', 'key1');
      Shipbook.getLogger('test').e('kept');
      Shipbook.logout();
      await settle();

      expect(warn.mock.calls).toEqual([['backing off until 2026-11-09T12:05:00.000Z: the server answered 429']]);
    });

    test('after a failed login: nothing is sent, logs and crashes are kept, and the first log afterwards logs in and sends them', async () => {
      fetchSpy.mockImplementationOnce(async () => rejected(503, { 'Retry-After': '120' }));
      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();
      const log = Shipbook.getLogger('test');

      log.e('kept');
      await settle();
      logManager.push(new Exception('KeptCrash', 'boom', ''));
      await settle();
      Shipbook.flush();
      expect(await Shipbook.start('app1', 'key2')).toBeUndefined();
      await settle();
      const local = await connectionClient.request('auth/loginSdk', {}, HttpMethod.POST);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(local.ok).toBe(false);
      expect(local.status).toBe(429);
      expect(storedMessages()).toEqual(['kept', 'KeptCrash']);
      expect(await storage.getItem('pause')).toBeNull();

      now += 120 * 1000;
      log.e('after the back-off');
      await settle();
      log.e('later');
      await settle();
      Shipbook.flush();
      await settle();

      expect(requestedPaths().filter(path => path === 'auth/loginSdk')).toHaveLength(2);
      expect(uploadedMessages()).toEqual(['kept', 'KeptCrash', 'after the back-off', 'later']);
    });

    test('with a live session: the token stays, logs are kept, and uploads carry on afterwards without a new login', async () => {
      await Shipbook.start('app1', 'key1');
      const log = Shipbook.getLogger('test');
      log.e('in the upload answered 503');
      await settle();
      fetchSpy.mockImplementationOnce(async () => rejected(503));
      Shipbook.flush();
      await settle();
      expect(requestedPaths()).toEqual(['auth/loginSdk', 'sessions/uploadSavedData']);
      fetchSpy.mockClear();

      log.e('kept');
      await settle();
      Shipbook.flush();
      await settle();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(storedMessages()).toEqual(['in the upload answered 503', 'kept']);
      expect(sessionManager.token).toBe('token');
      expect(Shipbook.getSessionHeaders()).toEqual({ [SESSION_LINK_HEADER]: 'link' });
      expect(await storage.getItem('pause')).toBeNull();

      now += 300 * 1000;
      log.e('after the back-off');
      await settle();
      Shipbook.flush();
      await settle();

      expect(requestedPaths()).toEqual(['sessions/uploadSavedData']);
      expect(uploadedMessages()).toEqual(['in the upload answered 503', 'kept', 'after the back-off']);
    });

    test('an upload answered 500 neither backs off nor keeps its batch, as before', async () => {
      await Shipbook.start('app1', 'key1');
      const log = Shipbook.getLogger('test');
      log.e('in the upload answered 500');
      await settle();
      fetchSpy.mockImplementationOnce(async () => rejected(500, { 'Retry-After': '120' }));
      Shipbook.flush();
      await settle();

      log.e('next');
      await settle();
      Shipbook.flush();
      await settle();

      expect(requestedPaths()).toEqual(['auth/loginSdk', 'sessions/uploadSavedData', 'sessions/uploadSavedData']);
      expect(uploadedMessages()).toEqual(['in the upload answered 500', 'next']);
      expect(await storage.arraySize('session_data')).toBe(0);
    });

    test('logout during a back-off logs in once it ends', async () => {
      await Shipbook.start('app1', 'key1');
      fetchSpy.mockImplementationOnce(async () => rejected(429, { 'Retry-After': '60' }));
      Shipbook.logout();
      await settle();
      Shipbook.logout();
      await settle();
      expect(requestedPaths()).toEqual(['auth/loginSdk', 'auth/loginSdk']);

      now += 60 * 1000;
      Shipbook.getLogger('test').e('after the back-off');
      await settle();

      expect(requestedPaths()).toEqual(['auth/loginSdk', 'auth/loginSdk', 'auth/loginSdk', 'sessions/uploadSavedData']);
      expect(sessionManager.token).toBe('token');
    });
  });

  describe('a login that was rejected', () => {
    test.each([
      ['a busy 429', 429, {}, 'backing off until 2026-11-09T12:05:00.000Z: the server answered 429'],
      ['a refused 401', 401, { [PAUSE_HEADER]: '120' }, 'paused until 2026-11-09T12:02:00.000Z: the server answered 401 with x-shipbook-pause 120']
    ])('by %s reports the signal and does not blame the app key', async (_name, status, headers, warning) => {
      const warn = jest.spyOn(InnerLog, 'w');
      const error = jest.spyOn(InnerLog, 'e');
      fetchSpy.mockImplementation(async () => rejected(status, headers));

      await Shipbook.start('app1', 'key1');

      expect(warn.mock.calls).toEqual([[warning]]);
      expect(error).not.toHaveBeenCalledWith(expect.stringContaining('check appId/appKey'));
    });

    test('by a 401 with neither signal still says to check the app id and key', async () => {
      const warn = jest.spyOn(InnerLog, 'w');
      const error = jest.spyOn(InnerLog, 'e');
      fetchSpy.mockImplementation(async () => rejected(401, { 'Retry-After': '120' }));

      await Shipbook.start('app1', 'key1');

      expect(warn).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('loginSdk rejected with 401 — check appId/appKey. Will not retry.'));
    });
  });

  describe('logout', () => {
    test('starts a new session, but not while paused', async () => {
      await Shipbook.start('app1', 'key1');
      Shipbook.logout();
      await settle();
      expect(requestedPaths()).toEqual(['auth/loginSdk', 'auth/loginSdk']);

      fetchSpy.mockImplementation(async () => rejected(429, { [PAUSE_HEADER]: '3600' }));
      Shipbook.logout();
      await settle();
      Shipbook.logout();
      await settle();

      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('a stored pause', () => {
    test('that is still valid starts the SDK paused, until its time passes', async () => {
      const warn = jest.spyOn(InnerLog, 'w');
      const pause = { appId: 'app1', sdkVersion, until: NOW + HOUR };
      await storage.setObj('pause', pause);

      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();
      const log = Shipbook.getLogger('test');
      log.e('dropped');
      await settle();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await storage.arraySize('session_data')).toBe(0);
      expect(await storage.getObj('pause')).toEqual(pause);
      expect(warn.mock.calls).toEqual([
        ['paused until 2026-11-09T13:00:00.000Z (from an earlier run); nothing will be sent']
      ]);

      now += HOUR;
      log.e('after the pause');
      await settle();

      expect(requestedPaths()).toEqual(['auth/loginSdk', 'sessions/uploadSavedData']);
      expect(uploadedMessages()).toEqual(['after the pause']);
    });

    test('that ends exactly 30 days ahead is still valid', async () => {
      await storage.setObj('pause', { appId: 'app1', sdkVersion, until: NOW + MAX_PAUSE });

      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await storage.getItem('pause')).not.toBeNull();
    });

    test.each([
      ['for another app', JSON.stringify({ appId: 'app2', sdkVersion, until: NOW + HOUR })],
      ['of another SDK version', JSON.stringify({ appId: 'app1', sdkVersion: 'core:0.0.1/client:0.0.1/browser:0.0.1', until: NOW + HOUR })],
      ['whose time already passed', JSON.stringify({ appId: 'app1', sdkVersion, until: NOW })],
      ['that ends more than 30 days ahead', JSON.stringify({ appId: 'app1', sdkVersion, until: NOW + MAX_PAUSE + 1 })],
      ['that is not a pause record', 'true']
    ])('%s is removed and start logs in', async (_name, stored) => {
      await storage.setItem('pause', stored);

      expect(await Shipbook.start('app1', 'key1')).toBe(SESSION_URL);

      expect(await storage.getItem('pause')).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('that is corrupt is removed and start logs in', async () => {
      await storage.setItem('pause', '�� not json');
      storage.corruptKeys.add('pause');

      expect(await Shipbook.start('app1', 'key1')).toBe(SESSION_URL);

      expect(await storage.getItem('pause')).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('start called again', () => {
    test('with the same credentials does not log in again and resolves to the same session URL', async () => {
      const first = Shipbook.start('app1', 'key1');
      const whileLoggingIn = Shipbook.start('app1', 'key1');

      expect(await first).toBe(SESSION_URL);
      expect(await whileLoggingIn).toBe(SESSION_URL);
      expect(await Shipbook.start('app1', 'key1')).toBe(SESSION_URL);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('with the same credentials does not retry a login that failed', async () => {
      fetchSpy.mockImplementationOnce(async () => rejected(500));

      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();
      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('with another app key or app id logs in again', async () => {
      fetchSpy
        .mockImplementationOnce(async () => loginOk('url1'))
        .mockImplementationOnce(async () => loginOk('url2'))
        .mockImplementationOnce(async () => loginOk('url3'));

      expect(await Shipbook.start('app1', 'key1')).toBe('url1');
      expect(await Shipbook.start('app1', 'key2')).toBe('url2');
      expect(await Shipbook.start('app2', 'key2')).toBe('url3');

      expect(requestedPaths()).toEqual(['auth/loginSdk', 'auth/loginSdk', 'auth/loginSdk']);
      expect(headersOf(2).get(APP_ID_HEADER)).toBe('app2');
    });

    test('while paused sends nothing', async () => {
      fetchSpy.mockImplementation(async () => rejected(429, { [PAUSE_HEADER]: '3600' }));
      await Shipbook.start('app1', 'key1');

      expect(await Shipbook.start('app1', 'key1')).toBeUndefined();
      expect(await Shipbook.start('app1', 'key2')).toBeUndefined();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('after a start that failed before logging in tries again', async () => {
      storage.corruptKeys.add('config');
      jest.spyOn(storage, 'removeItem').mockRejectedValueOnce(new Error('storage is broken'));
      await expect(Shipbook.start('app1', 'key1')).rejects.toThrow('storage is broken');
      expect(fetchSpy).not.toHaveBeenCalled();

      expect(await Shipbook.start('app1', 'key1')).toBe(SESSION_URL);
    });
  });
});
