import { logManager, Exception, BaseLog } from '@shipbook/core';
import type { ExceptionCallback } from '@shipbook/core';
import { Shipbook } from '../src/index';
import { authManager } from '../src/auth/auth-manager';
import { exceptionHandler, eventManager } from '../src/adapters';

const settle = () => new Promise(resolve => setImmediate(resolve));
const lastListener = (event: string) => process.listeners(event as NodeJS.Signals).at(-1) as (...args: unknown[]) => void;

let listeners: Record<string, number>;
let exit: jest.SpyInstance;
let kill: jest.SpyInstance;

beforeEach(() => {
  listeners = {};
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // Jest has its own process listeners, so the counts the adapters see are set per test.
  jest.spyOn(process, 'listenerCount').mockImplementation(event => listeners[event as string] ?? 1);
  exit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
});

afterEach(() => {
  exceptionHandler.stop();
  eventManager.destroy();
  jest.restoreAllMocks();
  jest.useRealTimers();
  delete process.env.NODE_OPTIONS;
});

describe('NodeExceptionHandler', () => {
  let callback: jest.Mock<ReturnType<ExceptionCallback>, Parameters<ExceptionCallback>>;

  beforeEach(() => {
    callback = jest.fn().mockResolvedValue(undefined);
    exceptionHandler.start(callback);
  });

  it("captures an uncaught exception, waits for the callback's work, then exits as Node would", async () => {
    let finishUpload!: () => void;
    callback.mockReturnValue(new Promise<void>(resolve => { finishUpload = resolve; }));
    lastListener('uncaughtException')(new TypeError('boom'));
    await settle();

    expect(callback).toHaveBeenCalledWith('TypeError', 'boom', expect.stringContaining('TypeError: boom'), true);
    expect(exit).not.toHaveBeenCalled();
    finishUpload();
    await settle();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("leaves the exit to the app's own uncaughtException listener", async () => {
    listeners.uncaughtException = 2;
    lastListener('uncaughtException')(new Error('boom'));
    await settle();

    expect(callback).toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('exits on an unhandled rejection by default, and keeps running with --unhandled-rejections=warn', async () => {
    process.env.NODE_OPTIONS = '--unhandled-rejections=warn';
    lastListener('unhandledRejection')(new Error('rejected'));
    await settle();
    expect(callback).toHaveBeenLastCalledWith('Error', 'rejected', expect.any(String), false);
    expect(exit).not.toHaveBeenCalled();

    delete process.env.NODE_OPTIONS;
    lastListener('unhandledRejection')('plain reason');
    await settle();
    expect(callback).toHaveBeenLastCalledWith('UnhandledRejection', 'plain reason', undefined, true);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits after at most 2s when the work hangs', async () => {
    jest.useFakeTimers();
    callback.mockReturnValue(new Promise(() => {}));
    lastListener('uncaughtException')(new Error('boom'));

    await jest.advanceTimersByTimeAsync(1999);
    expect(exit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('NodeEventManager', () => {
  it('listens to the exit signals only while something is subscribed', () => {
    const before = process.listeners('SIGTERM').length;
    const unsubscribe = eventManager.onBackground(() => {});
    expect(process.listeners('SIGTERM').length).toBe(before + 1);

    unsubscribe();
    expect(process.listeners('SIGTERM').length).toBe(before);
  });

  it('on SIGTERM runs the callbacks, then lets the signal terminate the process', async () => {
    const callback = jest.fn().mockResolvedValue(undefined);
    eventManager.onBackground(callback);
    const onSigterm = lastListener('SIGTERM');
    onSigterm();
    await settle();

    expect(callback).toHaveBeenCalled();
    expect(process.listeners('SIGTERM')).not.toContain(onSigterm);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('on SIGTERM only runs the callbacks when the app handles the signal itself', async () => {
    listeners.SIGTERM = 2;
    const callback = jest.fn();
    eventManager.onBackground(callback);
    lastListener('SIGTERM')();
    await settle();

    expect(callback).toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
  });
});

describe('Shipbook.start', () => {
  let pushed: BaseLog[];
  let flush: jest.SpyInstance;

  beforeEach(async () => {
    pushed = [];
    jest.spyOn(authManager, 'login').mockResolvedValue(undefined);
    jest.spyOn(logManager, 'push').mockImplementation(log => { pushed.push(log); });
    flush = jest.spyOn(logManager, 'flush').mockResolvedValue(undefined);
    await Shipbook.start('app', 'key');
  });

  afterEach(() => Shipbook.shutdown());

  it('pushes a caught exception and flushes it before the process ends', async () => {
    listeners.uncaughtException = 2;
    lastListener('uncaughtException')(new TypeError('boom'));
    await settle();

    expect(pushed[0]).toBeInstanceOf(Exception);
    expect(pushed[0]).toMatchObject({ name: 'TypeError', reason: 'boom' });
    expect(flush).toHaveBeenCalled();
  });

  it('flushes on SIGTERM, and stops listening after shutdown', async () => {
    listeners.SIGTERM = 2;
    lastListener('SIGTERM')();
    await settle();
    expect(flush).toHaveBeenCalled();

    const before = process.listeners('SIGTERM').length;
    await Shipbook.shutdown();
    expect(process.listeners('SIGTERM').length).toBe(before - 1);
  });
});
