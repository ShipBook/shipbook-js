import { createExpressMiddleware, ExpressExtractors } from '../src/middleware/express';
import { requestContext } from '../src/context/request-context';
import { logManager, RequestEvent, RequestEventPhase, RequestKind, RequestOutcome } from '@shipbook/core';
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
  __trigger: (event: string) => void;
}

// Mock response — captures the 'close' listener so tests can fire it explicitly.
const createMockResponse = (): MockResponse => {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    on: (event: string, cb: () => void) => {
      (listeners[event] ||= []).push(cb);
      return res;
    },
    __triggerClose: () => listeners['close']?.forEach(cb => cb()),
    __trigger: (event: string) => listeners[event]?.forEach(cb => cb())
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

    it('puts the request\'s path, ip and user agent on its start event, not on the session', (done) => {
      const pushed: RequestEvent[] = [];
      const pushSpy = jest.spyOn(logManager, 'push').mockImplementation((log) => { pushed.push(log as RequestEvent); });
      const middleware = createExpressMiddleware();
      const req = createMockRequest({
        method: 'POST',
        path: '/api/users'
      });
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx).toBeDefined();
        expect(ctx?.attributes).toBeUndefined();
        expect(pushed[0]).toMatchObject({ event: RequestEventPhase.Start, path: '/api/users', ip: '127.0.0.1', userAgent: 'Mozilla/5.0' });
        expect(pushed[0].attributes).toBeUndefined();
        pushSpy.mockRestore();
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

    it('should pass the x-shipbook-session header through raw', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest({
        headers: { 'x-shipbook-session': '1:app-1:sess-abc' }
      });
      const res = createMockResponse();

      middleware(req, res, () => {
        const ctx = requestContext.get();
        expect(ctx?.callerSessionLink).toBe('1:app-1:sess-abc');
        done();
      });
    });

    it('should leave callerSessionLink unset without the header', (done) => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest({ headers: {} });
      const res = createMockResponse();

      middleware(req, res, () => {
        expect(requestContext.get()?.callerSessionLink).toBeUndefined();
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

    it('should use the caller link as the session id ahead of a custom extractor', (done) => {
      const middleware = createExpressMiddleware({ session: () => 'custom-session-id' });
      const req = createMockRequest({ headers: { 'x-shipbook-session': '1:app-1:sess-abc' } });
      const res = createMockResponse();

      middleware(req, res, () => {
        expect(requestContext.get()?.sessionId).toBe('1:app-1:sess-abc');
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

    it('puts the attributes extractor\'s fields on the start event', (done) => {
      const pushed: RequestEvent[] = [];
      const pushSpy = jest.spyOn(logManager, 'push').mockImplementation((log) => { pushed.push(log as RequestEvent); });
      const middleware = createExpressMiddleware({
        attributes: (req) => ({
          customField: 'custom-value',
          requestSize: 1234
        })
      });

      const req = createMockRequest();
      const res = createMockResponse();

      middleware(req, res, () => {
        expect(pushed[0]).toMatchObject({ path: '/api/test', ip: '127.0.0.1', attributes: { customField: 'custom-value', requestSize: 1234 } });
        pushSpy.mockRestore();
        done();
      });
    });
  });

  describe('empty session stub registration', () => {
    let ensureSpy: jest.SpyInstance;

    beforeEach(() => {
      ensureSpy = jest.spyOn(logManager, 'startRequest').mockImplementation(() => {});
    });

    afterEach(() => {
      ensureSpy.mockRestore();
    });

    it('calls logManager.startRequest at middleware start, before next()', () => {
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
      expect(ctxArg.attributes).toBeUndefined();
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

    it('is safe when no appender implements startRequest (logManager just no-ops)', () => {
      // Stop spying and let the real logManager run. ConsoleAppender (the default) doesn't
      // implement startRequest, so the forEach optional-chains to a no-op — must not throw.
      ensureSpy.mockRestore();
      const middleware = createExpressMiddleware();
      const req = createMockRequest();
      const res = createMockResponse();

      expect(() => middleware(req, res, () => { /* noop */ })).not.toThrow();
    });
  });

  describe('request events', () => {
    let pushSpy: jest.SpyInstance;
    let pushed: { event: RequestEvent; requestId?: string; sessionId?: string }[];

    beforeEach(() => {
      pushed = [];
      jest.spyOn(logManager, 'startRequest').mockImplementation(() => {});
      pushSpy = jest.spyOn(logManager, 'push').mockImplementation((log) => {
        const ctx = requestContext.get();
        pushed.push({ event: log as RequestEvent, requestId: ctx?.requestId, sessionId: ctx?.sessionId });
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('emits a start event with method and path inside the request context', () => {
      const middleware = createExpressMiddleware();
      middleware(createMockRequest({ method: 'POST', path: '/api/checkout' }), createMockResponse(), () => {});

      expect(pushSpy).toHaveBeenCalledTimes(1);
      const [start] = pushed;
      expect(start.event).toBeInstanceOf(RequestEvent);
      expect(start.event).toMatchObject({ type: 'requestEvent', event: RequestEventPhase.Start, method: 'POST', route: '/api/checkout' });
      expect(start.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('emits an end event with status and duration on finish, in the same request', () => {
      const middleware = createExpressMiddleware();
      const res = createMockResponse();
      (res as { statusCode: number }).statusCode = 402;
      middleware(createMockRequest(), res, () => {});

      res.__trigger('finish');

      expect(pushed).toHaveLength(2);
      const [start, end] = pushed;
      expect(end.event).toMatchObject({ event: RequestEventPhase.End, kind: RequestKind.Http, method: 'GET', route: '/api/test', status: 402, outcome: RequestOutcome.Ok });
      expect(end.event.startTime).toBeInstanceOf(Date);
      expect(end.event.startOrderId).toBe(start.event.orderId);
      expect(end.event.duration).toBeGreaterThanOrEqual(0);
      expect(end.requestId).toBe(start.requestId);
      expect(end.sessionId).toBe(start.sessionId);
    });

    it('reports the route template once routing resolved it', () => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest({ path: '/api/orders/8812' });
      const res = createMockResponse();
      middleware(req, res, () => {});
      Object.assign(req, { baseUrl: '/api', route: { path: '/orders/:id' } });

      res.__trigger('finish');

      expect(pushed[0].event.route).toBe('/api/orders/8812');
      expect(pushed[1].event.route).toBe('/api/orders/:id');
    });

    it('labels an MCP call with its method and tool, once the body is parsed', () => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest({ method: 'POST', path: '/mcp' });
      const res = createMockResponse();
      middleware(req, res, () => {});
      // body parsers usually run after the Shipbook middleware, so the start can't see it yet
      Object.assign(req, { body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get-logs', arguments: {} } } });

      res.__trigger('finish');

      expect(pushed[0].event.operation).toBeUndefined();
      expect(pushed[1].event).toMatchObject({ route: '/mcp', operation: 'tools/call get-logs' });
    });

    it('labels a JSON-RPC batch with every call, and leaves other bodies unlabelled', () => {
      const middleware = createExpressMiddleware();
      const batch = createMockRequest({ method: 'POST', path: '/mcp', body: [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'shipbook://apps' } }
      ] } as Partial<Request>);
      const plain = createMockRequest({ method: 'POST', path: '/api/checkout', body: { items: 3 } } as Partial<Request>);
      middleware(batch, createMockResponse(), () => {});
      middleware(plain, createMockResponse(), () => {});

      expect(pushed[0].event.operation).toBe('initialize, resources/read shipbook://apps');
      expect(pushed[1].event.operation).toBeUndefined();
    });

    it('mints a different requestId per request in the same session', () => {
      const middleware = createExpressMiddleware();
      const req = createMockRequest();
      (req as any).sessionID = 'shared-session';
      middleware(req, createMockResponse(), () => {});
      middleware(req, createMockResponse(), () => {});

      expect(pushed[0].sessionId).toBe(pushed[1].sessionId);
      expect(pushed[0].requestId).not.toBe(pushed[1].requestId);
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
