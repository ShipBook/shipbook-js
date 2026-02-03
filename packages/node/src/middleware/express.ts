import type { Request, Response, NextFunction } from 'express';
import type { User } from '@shipbook/core';
import { requestContext } from '../context/request-context';

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
    const context = {
      sessionId: merged.session?.(req),
      traceId: merged.trace?.(req),
      user: merged.user?.(req),
      metadata: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        ...merged.metadata?.(req)
      }
    };

    requestContext.run(context, () => next());
  };
}
