import type { ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import type { RequestContext } from '@shipbook/core';
import { logManager, RequestEvent, RequestEventPhase, RequestKind, RequestOutcome } from '@shipbook/core';
import { requestContext } from '../context/request-context';

// MCP (any JSON-RPC) multiplexes every call on one endpoint; the method and its tool/prompt/resource tell the calls apart.
export function jsonRpcOperation(body: unknown) {
  const calls = (Array.isArray(body) ? body : [body]) as { jsonrpc?: string, method?: unknown, params?: { name?: unknown, uri?: unknown } }[];
  const operations = calls.filter(call => call?.jsonrpc === '2.0' && typeof call.method === 'string').map(call => {
    const target = call.params?.name ?? call.params?.uri;
    return typeof target === 'string' ? `${call.method} ${target}` : call.method as string;
  });
  return operations.length ? operations.join(', ') : undefined;
}

// Call inside the request's context with its start; 'finish' fires outside it (re-entered for the end), and routing and body parsing may only be done by then.
export function trackRequest(ctx: RequestContext, res: ServerResponse, start: RequestEvent, route: () => string, body: () => unknown) {
  logManager.push(start);
  res.on('finish', () => {
    // As for an HTTP server span: a 4xx is the client's mistake, only a 5xx failed the request.
    const outcome = res.statusCode >= 500 ? RequestOutcome.Error : RequestOutcome.Ok;
    requestContext.enter(ctx, () => logManager.push(endOf(start, ctx, route(), jsonRpcOperation(body()), res.statusCode, outcome)));
  });
}

// The end repeats the start's facts, with the route and operation as they are known once the request is done.
function endOf(start: RequestEvent, ctx: RequestContext, route: string | undefined, operation: string | undefined, status: number | undefined,
  outcome: RequestOutcome, errorCode?: number) {
  return new RequestEvent(RequestEventPhase.End, start.kind, start.method, route, operation, start.path, start.ip, start.userAgent, start.attributes,
    ctx.startTime, start.orderId, status, outcome, Date.now() - ctx.startTime.getTime(), errorCode);
}

// A request without HTTP (an MCP call over stdio, a queue message) inside the given session; end() writes how it finished.
export function openRequest(session: RequestContext, kind: RequestKind, operation?: string) {
  const ctx: RequestContext = { ...session, requestId: randomUUID(), startTime: new Date() };
  logManager.startRequest(ctx);
  const start = requestContext.enter(ctx, () => {
    const event = new RequestEvent(RequestEventPhase.Start, kind, undefined, undefined, operation);
    logManager.push(event);
    return event;
  });
  const end = (outcome: RequestOutcome, errorCode?: number) =>
    requestContext.enter(ctx, () => logManager.push(endOf(start, ctx, undefined, operation, undefined, outcome, errorCode)));
  return { ctx, end };
}

// Runs fn as one request of the current session (the process's background session outside any), ending with how fn settles.
export async function runInRequest<T>(kind: RequestKind, operation: string, fn: () => T | Promise<T>): Promise<T> {
  const { ctx, end } = openRequest(requestContext.get() ?? requestContext.background, kind, operation);
  try {
    const result = await requestContext.enter(ctx, fn);
    end(RequestOutcome.Ok);
    return result;
  } catch (error) {
    end(RequestOutcome.Error);
    throw error;
  }
}
