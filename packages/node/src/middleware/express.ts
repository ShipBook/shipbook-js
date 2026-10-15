import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import type { User, RequestContext } from '@shipbook/core';
import { logManager, SESSION_LINK_HEADER } from '@shipbook/core';
import { requestContext } from '../context/request-context';
import { trackRequest } from './request-events';

export interface ExpressExtractors {
  user?: (req: Request) => User | undefined;
  session?: (req: Request) => string | undefined;
  trace?: (req: Request) => string | undefined;
  metadata?: (req: Request) => Record<string, unknown>;
}

const defaultExtractors: ExpressExtractors = {
  user: (req) => {
    const u = (req as any).user;
    if (!u) return undefined;
    return {
      userId: u.id || u.userId,
      userName: u.name || u.userName,
      email: u.email,
      phoneNumber: u.phoneNumber,
      additionalInfo: u.additionalInfo
    };
  },
  session: (req) => (req as any).sessionID || (req as any).session?.id,
  trace: (req) =>
    req.headers['traceparent'] as string ||
    req.headers['x-request-id'] as string ||
    req.headers['x-correlation-id'] as string
};

export function createExpressMiddleware(extractors: ExpressExtractors = {}) {
  const merged = { ...defaultExtractors, ...extractors };

  return function shipbookMiddleware(req: Request, res: Response, next: NextFunction) {
    const callerSessionLink = req.headers[SESSION_LINK_HEADER] as string | undefined;
    const context: RequestContext = {
      // A linked request joins its caller's session, so every server session has exactly one caller.
      sessionId: callerSessionLink || merged.session?.(req) || randomUUID(),
      traceId: merged.trace?.(req),
      requestId: randomUUID(),
      callerSessionLink,
      user: merged.user?.(req),
      metadata: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        ...merged.metadata?.(req)
      },
      startTime: new Date(),
      isBackground: false
    };

    // Without this, sessions whose logs all fall below flushSeverity never reach the server.
    logManager.ensureSession(context);

    requestContext.run(context, () => {
      trackRequest(context, res, req.method, () => req.route ? req.baseUrl + req.route.path : req.path);
      next();
    });
  };
}
