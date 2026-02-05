import { NodeAppender } from '../src/appender/node-appender';
import { requestContext } from '../src/context/request-context';
import { storage } from '../src/adapters/storage';
import { Message, Severity, connectionClient } from '@shipbook/core';
import * as authModule from '../src/auth/auth-manager';

let logCounter = 0;
const createLog = () => new Message(`test message ${logCounter++}`, Severity.Info, 'TestTag');

describe('NodeAppender', () => {
  let appender: NodeAppender;
  let mockRequest: jest.SpyInstance;
  let mockGetToken: jest.SpyInstance;

  beforeEach(() => {
    logCounter = 0;
    storage.setMemoryOnly(true);
    storage.clear();

    mockRequest = jest.spyOn(connectionClient, 'request')
      .mockResolvedValue({ ok: true, status: 200, text: async () => 'success' } as Response);
    mockGetToken = jest.spyOn(authModule.authManager, 'getToken')
      .mockReturnValue('test-token');

    appender = new NodeAppender();
  });

  afterEach(() => {
    appender.destructor();
    mockRequest.mockRestore();
    mockGetToken.mockRestore();
  });

  describe('push()', () => {
    it('should create background session when no context', async () => {
      const log = createLog();
      await appender.push(log);

      // Background session uses a UUID (not date-based)
      const sessionList = await storage.getObj<string[]>('session_list');
      expect(sessionList).toBeDefined();
      expect(sessionList!.length).toBe(1);
      // Session ID should be a UUID format
      expect(sessionList![0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should use sessionId from context', async () => {
      const log = createLog();

      await requestContext.run({ sessionId: 'test-session' }, async () => {
        await appender.push(log);
      });

      const meta = await storage.getObj('session_meta_test-session');
      expect(meta).toMatchObject({ sessionId: 'test-session' });
    });

    it('should attach traceId from context to log', async () => {
      const log = createLog();

      await requestContext.run(
        { sessionId: 'trace-test-session', traceId: 'trace-123' },
        async () => {
          await appender.push(log);
        }
      );

      const logs = await storage.popAllArrayObj('session_trace-test-session') as Array<{ type: string; data: any }>;
      expect(logs.length).toBe(1);
      expect(logs[0].data.traceId).toBe('trace-123');
    });

    it('should group multiple logs by session', async () => {
      const log1 = createLog();
      const log2 = createLog();

      await requestContext.run({ sessionId: 'group-test-session' }, async () => {
        await appender.push(log1);
        await appender.push(log2);
      });

      const size = await storage.arraySize('session_group-test-session');
      expect(size).toBe(2);
    });
  });

  describe('flush()', () => {
    it('should send logs to server', async () => {
      const log = createLog();
      await appender.push(log);

      appender.flush();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRequest).toHaveBeenCalledWith(
        'sessions/ingest',
        expect.objectContaining({
          sessions: expect.arrayContaining([
            expect.objectContaining({
              logs: expect.any(Array)
            })
          ])
        }),
        'POST'
      );
    });

    it('should not send when no token', async () => {
      mockGetToken.mockReturnValue(undefined);

      const log = createLog();
      await appender.push(log);

      appender.flush();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  describe('destructor()', () => {
    it('should flush logs on destructor', async () => {
      const log = createLog();
      await appender.push(log);

      appender.destructor();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRequest).toHaveBeenCalled();
    });
  });
});
