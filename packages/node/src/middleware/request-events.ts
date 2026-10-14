import type { ServerResponse } from 'http';
import type { RequestContext } from '@shipbook/core';
import { logManager, RequestEvent, RequestEventPhase } from '@shipbook/core';
import { requestContext } from '../context/request-context';

// Call inside the request's context; 'finish' fires outside it, so the end event re-enters it.
export function trackRequest(ctx: RequestContext, res: ServerResponse, method: string, path: string) {
  logManager.push(new RequestEvent(RequestEventPhase.Start, { method, path }));
  res.on('finish', () => {
    const duration = Date.now() - ctx.startTime.getTime();
    requestContext.run(ctx, () => logManager.push(new RequestEvent(RequestEventPhase.End, { status: res.statusCode, duration })));
  });
}
