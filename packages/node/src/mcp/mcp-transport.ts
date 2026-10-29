import { randomUUID } from 'crypto';
import type { RequestContext } from '@shipbook/core';
import { RequestKind, RequestOutcome } from '@shipbook/core';
import { requestContext } from '../context/request-context';
import { jsonRpcOperation, openRequest } from '../middleware/request-events';

type JsonRpcId = string | number;

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method?: string;
  error?: { code: number };
}

type OnMessage = (message: JsonRpcMessage, extra?: unknown) => void;

// The MCP SDK Transport members this needs (@modelcontextprotocol/sdk 1.26); onmessage is intercepted by property, so it stays out to keep the SDK's generic onmessage assignable.
export interface McpTransport {
  send(message: JsonRpcMessage, options?: unknown): Promise<void>;
  sessionId?: string;
}

// Instruments an MCP transport in place: each incoming JSON-RPC request becomes a request of this connection's session, ended by its response.
export function instrumentMcpTransport<T extends McpTransport>(transport: T): T {
  const session: RequestContext = {
    sessionId: transport.sessionId ?? randomUUID(),
    startTime: new Date(),
    isBackground: false
  };
  const pending = new Map<JsonRpcId, (outcome: RequestOutcome, errorCode?: number) => void>();

  // The MCP Protocol installs onmessage after this; the transport then calls whatever is installed, so wrap at install time.
  let onmessage: OnMessage | undefined;
  Object.defineProperty(transport, 'onmessage', {
    configurable: true,
    get: () => onmessage && ((message: JsonRpcMessage, extra?: unknown) => {
      // Responses to the server's own requests, and notifications (no id), aren't requests made to it.
      if (message.method === undefined || message.id === undefined) return onmessage!(message, extra);
      const { ctx, end } = openRequest(session, RequestKind.Rpc, jsonRpcOperation(message));
      pending.set(message.id, end);
      requestContext.enter(ctx, () => onmessage!(message, extra));
    }),
    set: (handler: OnMessage | undefined) => { onmessage = handler; }
  });

  const send = transport.send.bind(transport);
  transport.send = (message, options) => {
    const end = message.method === undefined && message.id !== undefined ? pending.get(message.id) : undefined;
    if (end) {
      pending.delete(message.id!);
      end(message.error ? RequestOutcome.Error : RequestOutcome.Ok, message.error?.code);
    }
    return send(message, options);
  };
  return transport;
}
