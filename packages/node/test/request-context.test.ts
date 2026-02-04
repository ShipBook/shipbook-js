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
    it('should create context for background jobs', () => {
      requestContext.runJob({ jobId: 'email-queue' }, () => {
        const retrieved = requestContext.get();
        expect(retrieved?.sessionId).toBe('job_email-queue');
        expect(retrieved?.traceId).toBeUndefined();
        expect(retrieved?.metadata?.type).toBe('background_job');
        expect(retrieved?.metadata?.jobId).toBe('email-queue');
      });
    });

    it('should support async functions', async () => {
      const result = await requestContext.runJob({ jobId: 'async-job' }, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return requestContext.get()?.sessionId;
      });

      expect(result).toBe('job_async-job');
    });

    it('should merge custom metadata', () => {
      requestContext.runJob(
        { jobId: 'test', metadata: { priority: 'high', queue: 'default' } },
        () => {
          const retrieved = requestContext.get();
          expect(retrieved?.metadata?.priority).toBe('high');
          expect(retrieved?.metadata?.queue).toBe('default');
          expect(retrieved?.metadata?.type).toBe('background_job');
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
