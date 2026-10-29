import type { ExecutionContext, CallHandler } from '@nestjs/common';
import type { RequestContext } from '@shipbook/core';
import { logManager, RequestEvent, RequestEventPhase, RequestKind, RequestOutcome } from '@shipbook/core';
import { requestContext } from '../src/context/request-context';
import { createNestInterceptor } from '../src/middleware/nestjs';

function mockResponse() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    statusCode: 200,
    on: (event: string, cb: () => void) => { (listeners[event] ||= []).push(cb); },
    trigger: (event: string) => listeners[event]?.forEach(cb => cb())
  };
}

function contextFor(req: object, res = mockResponse()) {
  return { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as unknown as ExecutionContext;
}

const next = { handle: () => ({ subscribe: () => undefined }) } as unknown as CallHandler;

describe('Nest Interceptor', () => {
  let ensureSpy: jest.SpyInstance;

  beforeEach(() => {
    ensureSpy = jest.spyOn(logManager, 'startRequest').mockImplementation(() => {});
  });

  afterEach(() => {
    ensureSpy.mockRestore();
  });

  function interceptedContext(req: object, extractors = {}) {
    createNestInterceptor(extractors).intercept(contextFor(req), next);
    return ensureSpy.mock.calls[0][0] as RequestContext;
  }

  it('uses the caller link as the session id ahead of extractors', () => {
    const ctx = interceptedContext(
      { headers: { 'x-shipbook-session': '1:app-1:sess-abc' }, sessionID: 'express-session' },
      { session: () => 'custom-session' }
    );
    expect(ctx.sessionId).toBe('1:app-1:sess-abc');
    expect(ctx.callerSessionLink).toBe('1:app-1:sess-abc');
  });

  it('emits start and end request events with one requestId', () => {
    const pushed: { event: RequestEvent; requestId?: string }[] = [];
    const pushSpy = jest.spyOn(logManager, 'push').mockImplementation((log) => {
      pushed.push({ event: log as RequestEvent, requestId: requestContext.get()?.requestId });
    });
    const res = mockResponse();
    res.statusCode = 500;
    createNestInterceptor().intercept(contextFor({ headers: {}, method: 'GET', path: '/api/rates' }, res), next)
      .subscribe(() => {});
    res.trigger('finish');
    pushSpy.mockRestore();

    expect(pushed.map(p => p.event)).toMatchObject([
      { event: RequestEventPhase.Start, method: 'GET', route: '/api/rates' },
      { event: RequestEventPhase.End, kind: RequestKind.Http, method: 'GET', route: '/api/rates', status: 500, outcome: RequestOutcome.Error }
    ]);
    expect(pushed[0].requestId).toBeDefined();
    expect(pushed[1].requestId).toBe(pushed[0].requestId);
  });

  // Fastify's reply has no on(); the Node response is reply.raw. Its request has no path, but url and routeOptions.url.
  it('tracks requests when Nest runs on Fastify', () => {
    const pushed: RequestEvent[] = [];
    const pushSpy = jest.spyOn(logManager, 'push').mockImplementation((log) => { pushed.push(log as RequestEvent); });
    const raw = mockResponse();
    raw.statusCode = 404;
    const reply = { raw, statusCode: 404, sent: false };
    const request = { headers: {}, method: 'GET', url: '/api/orders/8812?expand=items', routeOptions: { url: '/api/orders/:id' }, ip: '10.0.0.1' };

    expect(() => createNestInterceptor().intercept(contextFor(request, reply as unknown as ReturnType<typeof mockResponse>), next).subscribe(() => {}))
      .not.toThrow();
    raw.trigger('finish');
    pushSpy.mockRestore();

    expect(pushed).toMatchObject([
      { event: RequestEventPhase.Start, method: 'GET', route: '/api/orders/:id' },
      { event: RequestEventPhase.End, route: '/api/orders/:id', status: 404 }
    ]);
    expect(ensureSpy.mock.calls[0][0].attributes).toBeUndefined();
    expect(pushed[0]).toMatchObject({ path: '/api/orders/8812', ip: '10.0.0.1' });
    expect(pushed[1]).toMatchObject({ event: RequestEventPhase.End, path: '/api/orders/8812', ip: '10.0.0.1' });
  });

  it('falls back to the extractor without the header', () => {
    const ctx = interceptedContext({ headers: {} }, { session: () => 'custom-session' });
    expect(ctx.sessionId).toBe('custom-session');
    expect(ctx.callerSessionLink).toBeUndefined();
  });
});
