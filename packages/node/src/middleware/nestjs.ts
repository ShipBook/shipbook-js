import type { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import type { User, RequestContext } from '@shipbook/core';
import { logManager, SESSION_LINK_HEADER } from '@shipbook/core';
import { requestContext } from '../context/request-context';
import { trackRequest } from './request-events';

export interface NestExtractors {
  user?: (ctx: ExecutionContext) => User | undefined;
  session?: (ctx: ExecutionContext) => string | undefined;
  trace?: (ctx: ExecutionContext) => string | undefined;
}

export function createNestInterceptor(extractors: NestExtractors = {}) {
  class ShipbookInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const req = context.switchToHttp().getRequest();
      const res = context.switchToHttp().getResponse();
      // Nest runs on Express or Fastify: a Fastify request has no path (url carries the query string), and its reply wraps the Node response in raw.
      const path: string = req.path ?? req.url?.split('?')[0];

      const user = extractors.user?.(context) || (req.user ? {
        userId: req.user.id || req.user.userId,
        userName: req.user.name || req.user.userName,
        email: req.user.email
      } : undefined);

      const callerSessionLink: string | undefined = req.headers[SESSION_LINK_HEADER];
      const ctx: RequestContext = {
        // A linked request joins its caller's session, so every server session has exactly one caller.
        sessionId: callerSessionLink || extractors.session?.(context) || req.sessionID || randomUUID(),
        traceId: extractors.trace?.(context) || req.headers['x-request-id'],
        requestId: randomUUID(),
        callerSessionLink,
        user,
        metadata: {
          method: req.method,
          path,
          ip: req.ip
        },
        startTime: new Date(),
        isBackground: false
      };

      // Without this, sessions whose logs all fall below flushSeverity never reach the server.
      logManager.ensureSession(ctx);

      // Use Observable constructor to wrap the async context
      const { Observable: RxObservable } = require('rxjs');
      return new RxObservable((subscriber: any) => {
        requestContext.enter(ctx, () => {
          trackRequest(ctx, res.raw ?? res, req.method, () => req.route?.path ?? req.routeOptions?.url ?? path, () => req.body);
          next.handle().subscribe(subscriber);
        });
      });
    }
  }

  return new ShipbookInterceptor();
}
