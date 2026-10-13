import type { ExecutionContext, CallHandler } from '@nestjs/common';
import type { RequestContext } from '@shipbook/core';
import { logManager } from '@shipbook/core';
import { createNestInterceptor } from '../src/middleware/nestjs';

function contextFor(req: object) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
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

  it('falls back to the extractor without the header', () => {
    const ctx = interceptedContext({ headers: {} }, { session: () => 'custom-session' });
    expect(ctx.sessionId).toBe('custom-session');
    expect(ctx.callerSessionLink).toBeUndefined();
  });
});
