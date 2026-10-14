import type { ExecutionContext, CallHandler } from '@nestjs/common';
import type { RequestContext } from '@shipbook/core';
import { logManager, RequestEvent, RequestEventPhase } from '@shipbook/core';
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
    ensureSpy = jest.spyOn(logManager, 'ensureSession').mockImplementation(() => {});
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
      { event: RequestEventPhase.Start, method: 'GET', path: '/api/rates' },
      { event: RequestEventPhase.End, status: 500 }
    ]);
    expect(pushed[0].requestId).toBeDefined();
    expect(pushed[1].requestId).toBe(pushed[0].requestId);
  });

  it('falls back to the extractor without the header', () => {
    const ctx = interceptedContext({ headers: {} }, { session: () => 'custom-session' });
    expect(ctx.sessionId).toBe('custom-session');
    expect(ctx.callerSessionLink).toBeUndefined();
  });
});
