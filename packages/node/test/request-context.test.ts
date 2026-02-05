import { requestContext, RequestContextManager, JobContextOptions } from '../src/context/request-context';

describe('RequestContextManager', () => {
  describe('run()', () => {
    it('should store and retrieve context', () => {
      const context = {
        sessionId: 'test-session-123',
        traceId: 'trace-abc',
        user: { userId: 'user-1', userName: 'Test User' },
        metadata: { method: 'GET', path: '/api/test' }
      };

      requestContext.run(context, () => {
        const retrieved = requestContext.get();
        expect(retrieved).toBeDefined();
        expect(retrieved?.sessionId).toBe('test-session-123');
        expect(retrieved?.traceId).toBe('trace-abc');
        expect(retrieved?.user?.userId).toBe('user-1');
        expect(retrieved?.metadata?.method).toBe('GET');
        expect(retrieved?.startTime).toBeInstanceOf(Date);
      });
    });

    it('should generate sessionId when not provided', () => {
      requestContext.run({}, () => {
        const retrieved = requestContext.get();
        expect(retrieved?.sessionId).toBeDefined();
        expect(retrieved?.sessionId.length).toBeGreaterThan(0);
      });
    });

    it('should not set traceId when not provided', () => {
      requestContext.run({ sessionId: 'test' }, () => {
        const retrieved = requestContext.get();
        expect(retrieved?.traceId).toBeUndefined();
      });
    });

    it('should isolate context between calls', async () => {
      const results: string[] = [];

      await Promise.all([
        new Promise<void>(resolve => {
          requestContext.run({ sessionId: 'session-1' }, () => {
            setTimeout(() => {
              results.push(requestContext.get()?.sessionId || 'undefined');
              resolve();
            }, 10);
          });
        }),
        new Promise<void>(resolve => {
          requestContext.run({ sessionId: 'session-2' }, () => {
            setTimeout(() => {
              results.push(requestContext.get()?.sessionId || 'undefined');
              resolve();
            }, 5);
          });
        })
      ]);

      expect(results).toContain('session-1');
      expect(results).toContain('session-2');
    });
  });

  describe('runJob()', () => {
    it('should create context for background jobs with unique session ID', () => {
      requestContext.runJob({ jobName: 'email-queue' }, () => {
        const retrieved = requestContext.get();
        // Session ID should be a UUID
        expect(retrieved?.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(retrieved?.traceId).toBeUndefined();
        expect(retrieved?.isBackground).toBe(true);
        expect(retrieved?.jobName).toBe('email-queue');
      });
    });

    it('should support async functions', async () => {
      const result = await requestContext.runJob({ jobName: 'async-job' }, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return requestContext.get()?.sessionId;
      });

      // Session ID should be a UUID
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    });

    it('should pass custom metadata', () => {
      requestContext.runJob(
        { jobName: 'test', metadata: { priority: 'high', queue: 'default' } },
        () => {
          const retrieved = requestContext.get();
          expect(retrieved?.metadata?.priority).toBe('high');
          expect(retrieved?.metadata?.queue).toBe('default');
          expect(retrieved?.jobName).toBe('test');
        }
      );
    });
  });

  describe('get()', () => {
    it('should return undefined outside of context', () => {
      const context = requestContext.get();
      expect(context).toBeUndefined();
    });
  });
});
