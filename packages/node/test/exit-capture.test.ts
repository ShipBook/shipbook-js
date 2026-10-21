import { logManager, Exception, BaseLog } from '@shipbook/core';
import type { ExceptionCallback } from '@shipbook/core';
import { Shipbook } from '../src/index';
import { authManager } from '../src/auth/auth-manager';
import { exceptionHandler } from '../src/adapters';
import { SBCloudAppender } from '../src/appender/sbcloud-appender';

const settle = () => new Promise(resolve => setImmediate(resolve));

describe('exit capture', () => {
  let onException: ExceptionCallback;
  let pushed: BaseLog[];
  let listeners: Record<string, number>;
  let exit: jest.SpyInstance;
  let kill: jest.SpyInstance;
  let flush: jest.SpyInstance;

  beforeEach(async () => {
    pushed = [];
    listeners = {};
    jest.spyOn(authManager, 'login').mockResolvedValue(undefined);
    jest.spyOn(exceptionHandler, 'isActive').mockReturnValue(false);
    jest.spyOn(exceptionHandler, 'start').mockImplementation(callback => { onException = callback; });
    jest.spyOn(exceptionHandler, 'stop').mockImplementation(() => {});
    jest.spyOn(logManager, 'push').mockImplementation(log => { pushed.push(log); });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'listenerCount').mockImplementation(event => listeners[event as string] ?? 1);
    exit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    flush = jest.spyOn(SBCloudAppender.prototype, 'flush').mockResolvedValue();
    await Shipbook.start('app', 'key');
  });

  afterEach(async () => {
    await Shipbook.shutdown();
    jest.restoreAllMocks();
    jest.useRealTimers();
    delete process.env.NODE_OPTIONS;
  });

  const signalListener = (signal: string) => process.listeners(signal as NodeJS.Signals).at(-1) as () => void;

  it('captures an uncaught exception, sends it, then exits as Node would', async () => {
    onException('TypeError', 'boom', 'TypeError: boom\n    at x', true);
    await settle();

    expect(pushed[0]).toBeInstanceOf(Exception);
    expect(pushed[0]).toMatchObject({ name: 'TypeError', reason: 'boom' });
    expect(flush).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("leaves the exit to the app's own uncaughtException handler", async () => {
    listeners.uncaughtException = 2;
    onException('TypeError', 'boom', undefined, true);
    await settle();

    expect(pushed).toHaveLength(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it('exits on an unhandled rejection by default, and keeps running with --unhandled-rejections=warn', async () => {
    process.env.NODE_OPTIONS = '--unhandled-rejections=warn';
    onException('Error', 'rejected', undefined, false);
    await settle();
    expect(exit).not.toHaveBeenCalled();

    delete process.env.NODE_OPTIONS;
    onException('Error', 'rejected', undefined, false);
    await settle();
    expect(pushed).toHaveLength(2);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits without waiting more than 2s when the send hangs', async () => {
    jest.useFakeTimers();
    flush.mockReturnValue(new Promise(() => {}));
    onException('TypeError', 'boom', undefined, true);

    await jest.advanceTimersByTimeAsync(1999);
    expect(exit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
    flush.mockResolvedValue(undefined); // so shutdown() in afterEach doesn't wait on the hung send
  });

  it('on SIGTERM sends the queue, then lets the signal terminate the process', async () => {
    const onSigterm = signalListener('SIGTERM');
    onSigterm();
    await settle();

    expect(flush).toHaveBeenCalled();
    expect(process.listeners('SIGTERM')).not.toContain(onSigterm);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it("on SIGTERM only sends the queue when the app handles the signal itself", async () => {
    listeners.SIGTERM = 2;
    signalListener('SIGTERM')();
    await settle();

    expect(flush).toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
  });
});
