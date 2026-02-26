import { SBCloudAppender } from '../src/appender/sbcloud-appender';
import { requestContext } from '../src/context/request-context';
import { storage } from '../src/adapters/storage';
import { Message, Severity, connectionClient, HttpMethod } from '@shipbook/core';

const tick = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

describe('SBCloudAppender', () => {
  let appender: SBCloudAppender;
  let requestSpy: jest.SpyInstance;

  beforeEach(() => {
    storage.setMemoryOnly(true);
    storage.clear();

    SBCloudAppender.setDeps({
      appVersion: '1.0.0',
      getToken: () => 'test-token',
    });

    requestSpy = jest.spyOn(connectionClient, 'request').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    } as unknown as Response);

    appender = new SBCloudAppender('test-appender');
  });

  afterEach(async () => {
    appender.destructor();
    await tick();
    jest.restoreAllMocks();
  });

  describe('push() - background session', () => {
    it('should use a UUID sessionId when no requestContext', async () => {
      await appender.push(new Message('bg log', Severity.Info, 'Tag'));
      appender.flush();
      await tick();

      const payload = requestSpy.mock.calls[0][1] as { sessions: any[] };
      expect(payload.sessions).toHaveLength(1);
      expect(payload.sessions[0].sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should set isBackground: true and metadata type "background"', async () => {
      await appender.push(new Message('bg log', Severity.Info, 'Tag'));
      appender.flush();
      await tick();

      const session = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions[0];
      expect(session.isBackground).toBe(true);
      expect(session.metadata).toEqual({ type: 'background' });
    });

    it('should persist log to storage', async () => {
      await appender.push(new Message('persist test', Severity.Info, 'Tag'));

      const sessionList = await storage.getObj<string[]>('session_list');
      expect(sessionList).toBeDefined();
      expect(sessionList!.length).toBe(1);
    });
  });

  describe('push() - HTTP session', () => {
    it('should use sessionId from requestContext', async () => {
      await requestContext.run({ sessionId: 'http-session-1' }, async () => {
        await appender.push(new Message('http log', Severity.Info, 'Tag'));
      });
      appender.flush();
      await tick();

      const session = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions[0];
      expect(session.sessionId).toBe('http-session-1');
      expect(session.isBackground).toBe(false);
    });

    it('should attach traceId to the log', async () => {
      await requestContext.run({ sessionId: 'trace-session', traceId: 'trace-abc' }, async () => {
        await appender.push(new Message('traced log', Severity.Info, 'Tag'));
      });
      appender.flush();
      await tick();

      const session = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions[0];
      expect(session.logs[0].traceId).toBe('trace-abc');
    });

    it('should attach user info from context', async () => {
      const user = { userId: 'u1', userName: 'TestUser' };
      await requestContext.run({ sessionId: 'user-session', user }, async () => {
        await appender.push(new Message('user log', Severity.Info, 'Tag'));
      });
      appender.flush();
      await tick();

      const session = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions[0];
      expect(session.userInfo).toMatchObject({ userId: 'u1', userName: 'TestUser' });
    });
  });

  describe('push() - session batching', () => {
    it('should group multiple logs into the same session', async () => {
      await requestContext.run({ sessionId: 'batch-session' }, async () => {
        await appender.push(new Message('log 1', Severity.Info, 'Tag'));
        await appender.push(new Message('log 2', Severity.Info, 'Tag'));
      });
      appender.flush();
      await tick();

      const session = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions[0];
      expect(session.logs).toHaveLength(2);
    });

    it('should create separate batches for different sessions', async () => {
      await requestContext.run({ sessionId: 'session-a' }, async () => {
        await appender.push(new Message('log a', Severity.Info, 'Tag'));
      });
      await requestContext.run({ sessionId: 'session-b' }, async () => {
        await appender.push(new Message('log b', Severity.Info, 'Tag'));
      });
      appender.flush();
      await tick();

      const sessions = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions;
      expect(sessions).toHaveLength(2);
      const ids = sessions.map((s: any) => s.sessionId).sort();
      expect(ids).toEqual(['session-a', 'session-b']);
    });
  });

  describe('flush() and send()', () => {
    it('should send payload to sessions/ingest via POST', async () => {
      await appender.push(new Message('send test', Severity.Info, 'Tag'));
      appender.flush();
      await tick();

      expect(requestSpy).toHaveBeenCalledWith(
        'sessions/ingest',
        expect.objectContaining({ sessions: expect.any(Array) }),
        HttpMethod.POST
      );
    });

    it('should include node identity fields', async () => {
      await appender.push(new Message('identity test', Severity.Info, 'Tag'));
      appender.flush();
      await tick();

      const session = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions[0];
      expect(session.platform).toBe('node');
      expect(session.deviceInfo).toEqual(expect.objectContaining({
        udid: expect.any(String),
        deviceName: expect.any(String),
      }));
      expect(session.os).toEqual(expect.objectContaining({
        name: expect.any(String),
        version: expect.any(String),
      }));
      expect(session.appInfo).toEqual({ version: '1.0.0' });
      expect(session.sdkInfo.version).toMatch(/^core:.+\/node:.+$/);
    });

    it('should clear batches after send (no duplicate sends)', async () => {
      await appender.push(new Message('once', Severity.Info, 'Tag'));
      appender.flush();
      await tick();

      appender.flush();
      await tick();

      expect(requestSpy).toHaveBeenCalledTimes(1);
    });

    it('should not call connectionClient when no token', async () => {
      SBCloudAppender.setDeps({ getToken: () => undefined });
      const noTokenAppender = new SBCloudAppender('no-token');

      await noTokenAppender.push(new Message('no token', Severity.Info, 'Tag'));
      noTokenAppender.flush();
      await tick();

      expect(requestSpy).not.toHaveBeenCalled();
      noTokenAppender.destructor();
    });

    it('should not call connectionClient when no batches', async () => {
      appender.flush();
      await tick();

      expect(requestSpy).not.toHaveBeenCalled();
    });
  });

  describe('destructor()', () => {
    it('should flush pending logs on destructor', async () => {
      await appender.push(new Message('destructor test', Severity.Info, 'Tag'));

      appender.destructor();
      await tick();

      expect(requestSpy).toHaveBeenCalledWith(
        'sessions/ingest',
        expect.objectContaining({
          sessions: expect.arrayContaining([
            expect.objectContaining({
              logs: expect.arrayContaining([
                expect.objectContaining({ message: 'destructor test' })
              ])
            })
          ])
        }),
        HttpMethod.POST
      );
    });
  });
});
