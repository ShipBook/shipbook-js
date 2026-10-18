import type { ServerResponse } from 'http';
import type { RequestContext } from '@shipbook/core';
import { logManager, RequestEvent, RequestEventPhase } from '@shipbook/core';
import { requestContext } from '../context/request-context';

// MCP (any JSON-RPC) multiplexes every call on one endpoint; the method and its tool/prompt/resource tell the calls apart.
function jsonRpcOperation(body: unknown) {
  const calls = (Array.isArray(body) ? body : [body]) as { jsonrpc?: string, method?: unknown, params?: { name?: unknown, uri?: unknown } }[];
  const operations = calls.filter(call => call?.jsonrpc === '2.0' && typeof call.method === 'string').map(call => {
    const target = call.params?.name ?? call.params?.uri;
    return typeof target === 'string' ? `${call.method} ${target}` : call.method as string;
  });
  return operations.length ? operations.join(', ') : undefined;
}

// Call inside the request's context; 'finish' fires outside it (re-entered for the end), and routing and body parsing may only be done by then.
export function trackRequest(ctx: RequestContext, res: ServerResponse, method: string, route: () => string, body: () => unknown) {
  const start = new RequestEvent(RequestEventPhase.Start, method, route(), jsonRpcOperation(body()));
  logManager.push(start);
  res.on('finish', () => {
    const duration = Date.now() - ctx.startTime.getTime();
    requestContext.run(ctx, () => logManager.push(new RequestEvent(RequestEventPhase.End, method, route(), jsonRpcOperation(body()),
      ctx.startTime, start.orderId, res.statusCode, duration)));
  });
}
