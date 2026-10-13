import { createExpressMiddleware, ExpressExtractors } from '../src/middleware/express';
import { requestContext } from '../src/context/request-context';
import { logManager } from '@shipbook/core';
import type { Request, Response, NextFunction } from 'express';

// Mock request factory
const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  method: 'GET',
  path: '/api/test',
  ip: '127.0.0.1',
  headers: {
    'user-agent': 'Mozilla/5.0',
    'x-request-id': 'trace-123'
  },
  ...overrides
} as Request);

interface MockResponse extends Response {
  __triggerClose?: () => void;
}

// Mock response — captures the 'close' listener so tests can fire it explicitly.
const createMockResponse = (): MockResponse => {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    on: (event: string, cb: () => void) => {
      (listeners[event] ||= []).push(cb);
      return res;
    },
    __triggerClose: () => listeners['close']?.forEach(cb => cb())
  } as unknown as MockResponse;
  return res;
};

describe('Express Middleware', () => {
  describe('createExpressMiddleware()', () => {
    it('should create middleware function', () => {
      const middleware = createExpressMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('should call next()', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest();
      const res = createMockResponse();

      middleware(req, res, () => {
        done();
      });
    });

    it('should set context with request metadata', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest({
        method: 'POST',
        path: '/api/users'
      });
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx).toBeDefined();
        expect(ctx?.metadata?.method).toBe('POST');
        expect(ctx?.metadata?.path).toBe('/api/users');
        expect(ctx?.metadata?.ip).toBe('127.0.0.1');
        expect(ctx?.metadata?.userAgent).toBe('Mozilla/5.0');
        done();
      });
    });

    it('should extract traceId from x-request-id header', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest({
        headers: { 'x-request-id': 'my-trace-id' }
      });
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.traceId).toBe('my-trace-id');
        done();
      });
    });

    it('should extract traceId from traceparent header', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest({
        headers: { traceparent: '00-trace-01-span-01' }
      });
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.traceId).toBe('00-trace-01-span-01');
        done();
      });
    });

    it('should extract callerSession from x-shipbook-session header', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest({
        headers: { 'x-shipbook-session': '1:app-1:sess-abc' }
      });
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.callerSession).toEqual({ appId: 'app-1', sessionId: 'sess-abc' });
        done();
      });
    });

    it('should ignore a malformed x-shipbook-session header', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest({
        headers: { 'x-shipbook-session': 'no-separator' }
      });
      const res = createMockResponse();

      middleware(req, res, () => {
        expect(requestContext.get()?.callerSession).toBeUndefined();
        done();
      });
    });

    it('should extract sessionId from express-session', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest();
      (req as any).sessionID = 'session-abc-123';
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.sessionId).toBe('session-abc-123');
        done();
      });
    });

    it('should extract user from req.user', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest();
      (req as any).user = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com'
      };
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.user?.userId).toBe('user-123');
        expect(ctx?.user?.userName).toBe('John Doe');
        expect(ctx?.user?.email).toBe('john@example.com');
        done();
      });
    });

    it('should support userId field in user object', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest();
      (req as any).user = {
        userId: 'user-456',
        userName: 'Jane Doe'
      };
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.user?.userId).toBe('user-456');
        expect(ctx?.user?.userName).toBe('Jane Doe');
        done();
      });
    });
  });

  describe('custom extractors', () => {
    it('should use custom session extractor', (done) => {
      const middleware = createExpressMiddleware({
        session: (req) => (req as any).customSession
      });

      const req = createMockRequest();
      (req as any).customSession = 'custom-session-id';
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.sessionId).toBe('custom-session-id');
        done();
      });
    });

    it('should use custom user extractor', (done) => {
      const middleware = createExpressMiddleware({
        user: (req) => ({
          userId: 'extracted-user',
          userName: 'Custom Name'
        })
      });

      const req = createMockRequest();
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.user?.userId).toBe('extracted-user');
        expect(ctx?.user?.userName).toBe('Custom Name');
        done();
      });
    });

    it('should use custom trace extractor', (done) => {
      const middleware = createExpressMiddleware({
        trace: (req) => req.headers['custom-trace'] as string
      });

      const req = createMockRequest({
        headers: { 'custom-trace': 'custom-trace-value' }
      });
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.traceId).toBe('custom-trace-value');
        done();
      });
    });

    it('should use custom metadata extractor', (done) => {
      const middleware = createExpressMiddleware({
        metadata: (req) => ({
          customField: 'custom-value',
          requestSize: 1234
        })
      });

      const req = createMockRequest();
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.metadata?.customField).toBe('custom-value');
        expect(ctx?.metadata?.requestSize).toBe(1234);
        // Should still have default metadata
        expect(ctx?.metadata?.method).toBe('GET');
        done();
      });
    });
  });

  describe('empty session stub registration', () => {
    let ensureSpy: jest.SpyInstance;

    beforeEach(() => {
      ensureSpy = jest.spyOn(logManager, 'ensureSession').mockImplementation(() => {});
    });

    afterEach(() => {
      ensureSpy.mockRestore();
    });

    it('calls logManager.ensureSession at middleware start, before next()', () => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest();
      (req as any).sessionID = 'stub-session-1';
      const res = createMockResponse();

      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      expect(ensureSpy).toHaveBeenCalledTimes(1);
      expect(nextCalled).toBe(true);
      const ctxArg = ensureSpy.mock.calls[0][0];
      expect(ctxArg.sessionId).toBe('stub-session-1');
      expect(ctxArg.isBackground).toBe(false);
      expect(ctxArg.metadata.method).toBe('GET');
    });

    it('falls back to a generated UUID sessionId when none is extracted', () => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest();  // No sessionID set
      const res = createMockResponse();

      middleware(req, res, () => { /* noop */ });

      const ctxArg = ensureSpy.mock.calls[0][0];
      expect(ctxArg.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('is safe when no appender implements ensureSession (logManager just no-ops)', () => {
      // Stop spying and let the real logManager run. ConsoleAppender (the default) doesn't
      // implement ensureSession, so the forEach optional-chains to a no-op — must not throw.
      ensureSpy.mockRestore();
      const middleware = createExpressMiddleware();
      const req = createMockRequest();
      const res = createMockResponse();

      expect(() => middleware(req, res, () => { /* noop */ })).not.toThrow();
    });
  });

  describe('context isolation', () => {
    it('should not leak context between requests', async () => {
      const middleware = createExpressMiddleware();
      const results: (string | undefined)[] = [];

      await Promise.all([
        new Promise<void>((resolve) => {
          const req = createMockRequest();
          (req as any).sessionID = 'request-1';
          middleware(req, createMockResponse(), () => {
            setTimeout(() => {
              results.push(requestContext.get()?.sessionId);
              resolve();
            }, 10);
          });
        }),
        new Promise<void>((resolve) => {
          const req = createMockRequest();
          (req as any).sessionID = 'request-2';
          middleware(req, createMockResponse(), () => {
            setTimeout(() => {
              results.push(requestContext.get()?.sessionId);
              resolve();
            }, 5);
          });
        })
      ]);

      expect(results).toContain('request-1');
      expect(results).toContain('request-2');
    });
  });
});
