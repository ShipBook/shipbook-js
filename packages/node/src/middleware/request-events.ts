import type { ServerResponse } from 'http';
import type { RequestContext } from '@shipbook/core';
import { logManager, RequestEvent, RequestEventPhase } from '@shipbook/core';
import { requestContext } from '../context/request-context';

// Call inside the request's context; 'finish' fires outside it (re-entered for the end), and routing may only resolve the route template by then.
export function trackRequest(ctx: RequestContext, res: ServerResponse, method: string, route: () => string) {
  const start = new RequestEvent(RequestEventPhase.Start, { method, route: route() });
  logManager.push(start);
  res.on('finish', () => {
    const duration = Date.now() - ctx.startTime.getTime();
    requestContext.run(ctx, () => logManager.push(new RequestEvent(RequestEventPhase.End,
      { method, route: route(), startTime: ctx.startTime, startOrderId: start.orderId, status: res.statusCode, duration })));
  });
}
