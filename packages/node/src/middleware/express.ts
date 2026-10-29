import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import type { User, RequestContext, Attributes } from '@shipbook/core';
import { logManager, SESSION_LINK_HEADER, RequestEvent, RequestEventPhase, RequestKind } from '@shipbook/core';
import { requestContext } from '../context/request-context';
import { trackRequest, jsonRpcOperation } from './request-events';

export interface ExpressExtractors {
  user?: (req: Request) => User | undefined;
  session?: (req: Request) => string | undefined;
  trace?: (req: Request) => string | undefined;
  attributes?: (req: Request) => Attributes;  // The app's own facts about the request, stored on its start event
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
      startTime: new Date(),
      isBackground: false
    };

    logManager.startRequest(context);

    requestContext.enter(context, () => {
      const route = () => req.route ? req.baseUrl + req.route.path : req.path;
      trackRequest(context, res, new RequestEvent(RequestEventPhase.Start, RequestKind.Http, req.method, route(), jsonRpcOperation(req.body),
        req.path, req.ip, req.headers['user-agent'], merged.attributes?.(req)), route, () => req.body);
      next();
    });
  };
}
