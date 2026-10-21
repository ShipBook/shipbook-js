import { SBCloudAppender } from '../src/appender/sbcloud-appender';
import { requestContext } from '../src/context/request-context';
import * as fs from 'fs';
import { Message, Exception, RequestEvent, RequestEventPhase, RequestKind, Severity, connectionClient, HttpMethod } from '@shipbook/core';

const tick = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

describe('SBCloudAppender', () => {
  let appender: SBCloudAppender;
  let requestSpy: jest.SpyInstance;

  beforeEach(() => {
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

    it('keeps the cloud queue in memory, nothing on disk', async () => {
      await appender.push(new Message('memory test', Severity.Info, 'Tag'));
      appender.flush();
      await tick();

      expect(fs.readdirSync(process.env.SHIPBOOK_STORAGE_PATH!)).toEqual(['machine_udid.json']);
      const session = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions[0];
      expect(session.logs.map((l: any) => l.message)).toEqual(['memory test']);
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

    it('should attach requestId to the log', async () => {
      await requestContext.run({ sessionId: 'request-session', requestId: 'req-abc' }, async () => {
        await appender.push(new Message('request log', Severity.Info, 'Tag'));
      });
      appender.flush();
      await tick();

      const session = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions[0];
      expect(session.logs[0].requestId).toBe('req-abc');
      expect(session.logs[0].requestTime).toBeDefined();
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

    it('empties the queue at maxLogSize while it cannot upload, then keeps saving', async () => {
      let token: string | undefined;
      SBCloudAppender.setDeps({ getToken: () => token });
      const offline = new SBCloudAppender('offline');
      offline.update({ appenders: [], loggers: [], maxLogSize: 4 });
      for (const message of ['1', '2', '3', '4']) await offline.push(new Message(message, Severity.Info, 'Tag'));

      token = 'test-token';
      offline.flush();
      await tick();

      const sessions = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions;
      expect(sessions[0].logs.map((l: any) => l.message)).toEqual(['4']);
      offline.destructor();
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

    it('sends a burst of errors in one upload, when the timer fires', async () => {
      appender.update({ appenders: [], loggers: [], maxTime: 0.05 });
      for (let i = 0; i < 5; i++) await appender.push(new Message('error ' + i, Severity.Error, 'Tag'));
      await appender.push(new Exception('TypeError', 'boom', 'at x'));
      expect(requestSpy).not.toHaveBeenCalled();

      await tick(100);

      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect((requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions[0].logs).toHaveLength(6);
    });

    it('sends before the timer once the saved records reach maxBatchSize', async () => {
      appender.update({ appenders: [], loggers: [], maxBatchSize: 3 });
      await appender.push(new Message('1', Severity.Info, 'Tag'));
      await tick();
      expect(requestSpy).not.toHaveBeenCalled();

      await appender.push(new Message('2', Severity.Info, 'Tag'));
      await tick();

      expect(requestSpy).toHaveBeenCalledTimes(1);
      const sessions = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions;
      expect(sessions[0].logs.map((l: any) => l.message)).toEqual(['1', '2']);
    });

    it('should not call connectionClient when no batches', async () => {
      appender.flush();
      await tick();

      expect(requestSpy).not.toHaveBeenCalled();
    });
  });

  describe('flushQueue (as on mobile)', () => {
    const sentLogs = () => requestSpy.mock.calls.flatMap(call => (call[1] as { sessions: any[] }).sessions.flatMap(s => s.logs));

    beforeEach(() => appender.update({ appenders: [], loggers: [], flushSeverity: 'Warning', flushSize: 2 }));

    it('holds logs below flushSeverity, so a quiet request uploads only its session', async () => {
      await requestContext.run({ sessionId: 'quiet' }, async () => {
        await appender.push(new Message('info', Severity.Info, 'Tag'));
      });
      appender.flush();
      await tick();

      const sessions = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions;
      expect(sessions.map(s => s.sessionId)).toEqual(['quiet']);
      expect(sessions[0].logs).toEqual([]);
    });

    it('saves the held logs as context of a log at flushSeverity, keeping the last flushSize of them', async () => {
      await requestContext.run({ sessionId: 'failing' }, async () => {
        for (const message of ['1', '2', '3']) await appender.push(new Message(message, Severity.Info, 'Tag'));
        await appender.push(new Message('warning', Severity.Warning, 'Tag'));
      });
      appender.flush();
      await tick();

      expect(sentLogs().map(l => l.message)).toEqual(['2', '3', 'warning']);
    });

    it("keeps each request's flushQueue apart", async () => {
      await requestContext.run({ sessionId: 'a' }, async () => {
        await appender.push(new Message('a info', Severity.Info, 'Tag'));
      });
      await requestContext.run({ sessionId: 'b' }, async () => {
        await appender.push(new Message('b error', Severity.Error, 'Tag'));
      });
      appender.flush();
      await tick();

      expect(sentLogs().map(l => l.message)).toEqual(['b error']);
    });

    it("uploads a request's start and end only when the request logs something at flushSeverity", async () => {
      const ctx = { sessionId: 'request', requestId: 'req-1', startTime: new Date(), isBackground: false };
      const start = new RequestEvent(RequestEventPhase.Start, RequestKind.Http, 'GET', '/orders');
      await requestContext.enter(ctx, async () => {
        await appender.push(start);
        await appender.push(new Message('error', Severity.Error, 'Tag'));
        await appender.push(new RequestEvent(RequestEventPhase.End, RequestKind.Http, 'GET', '/orders', undefined, ctx.startTime, start.orderId, 500));
      });
      const quiet = { sessionId: 'quiet-request', requestId: 'req-2', startTime: new Date(), isBackground: false };
      await requestContext.enter(quiet, async () => {
        await appender.push(new RequestEvent(RequestEventPhase.Start, RequestKind.Http, 'GET', '/health'));
        await appender.push(new RequestEvent(RequestEventPhase.End, RequestKind.Http, 'GET', '/health'));
      });
      appender.flush();
      await tick();

      expect(sentLogs().map(l => l.event ?? l.message)).toEqual([RequestEventPhase.Start, 'error', RequestEventPhase.End]);
    });

  });

  describe('ensureSession()', () => {
    it('creates an empty-log session stub when called without prior push', async () => {
      await appender.ensureSession({
        sessionId: 'stub-session',
        startTime: new Date(),
        isBackground: false,
        metadata: { method: 'GET', path: '/health' }
      });
      appender.flush();
      await tick();

      const sessions = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('stub-session');
      expect(sessions[0].logs).toEqual([]);
      expect(sessions[0].isBackground).toBe(false);
      expect(sessions[0].metadata).toMatchObject({ method: 'GET', path: '/health' });
    });

    it('is a no-op when a batch already exists for the sessionId (preserves existing logs)', async () => {
      await requestContext.run({ sessionId: 'with-logs' }, async () => {
        await appender.push(new Message('real log', Severity.Info, 'Tag'));
      });

      await appender.ensureSession({
        sessionId: 'with-logs',
        startTime: new Date(),
        isBackground: false
      });

      appender.flush();
      await tick();

      const sessions = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].logs).toHaveLength(1);
      expect(sessions[0].logs[0].message).toBe('real log');
    });

    it('stamps the raw callerSessionLink from the context onto the session', async () => {
      await appender.ensureSession({
        sessionId: 'linked-session',
        startTime: new Date(),
        isBackground: false,
        callerSessionLink: '1:client-app:client-sess'
      });
      appender.flush();
      await tick();

      const sessions = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions;
      expect(sessions[0].callerSessionLink).toBe('1:client-app:client-sess');
    });

    it('attaches stub alongside other sessions with logs in the same ingest', async () => {
      // Use Info (below default flushSeverity) so the push doesn't trigger an immediate
      // flush; otherwise the has-log session would ship before ensureSession() runs.
      await requestContext.run({ sessionId: 'has-log' }, async () => {
        await appender.push(new Message('log', Severity.Info, 'Tag'));
      });
      await appender.ensureSession({
        sessionId: 'empty-stub',
        startTime: new Date(),
        isBackground: false
      });

      appender.flush();
      await tick();

      const sessions = (requestSpy.mock.calls[0][1] as { sessions: any[] }).sessions;
      const ids = sessions.map((s: any) => s.sessionId).sort();
      expect(ids).toEqual(['empty-stub', 'has-log']);
      const stub = sessions.find((s: any) => s.sessionId === 'empty-stub');
      expect(stub.logs).toEqual([]);
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
