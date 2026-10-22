import { logManager, RequestEvent, RequestEventPhase, RequestKind, RequestOutcome, BaseLog } from '@shipbook/core';
import { instrumentMcpTransport } from '../src/mcp/mcp-transport';
import { runInRequest } from '../src/middleware/request-events';
import { requestContext } from '../src/context/request-context';

// Shaped like @modelcontextprotocol/sdk 1.26's JSONRPCMessage and Transport (generic onmessage included), so this also checks assignability.
type JSONRPCMessage =
  | { jsonrpc: '2.0', id: string | number, method: string, params?: Record<string, unknown> }
  | { jsonrpc: '2.0', method: string, params?: Record<string, unknown> }
  | { jsonrpc: '2.0', id: string | number, result: Record<string, unknown> }
  | { jsonrpc: '2.0', id: string | number, error: { code: number, message: string, data?: unknown } };

class StdioServerTransport {
  sent: JSONRPCMessage[] = [];
  sessionId?: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: { authInfo?: unknown }) => void;
  async start() {}
  async close() {}
  async send(message: JSONRPCMessage, _options?: { relatedRequestId?: string | number }) { this.sent.push(message); }
  receive(message: JSONRPCMessage) { this.onmessage?.(message); }
}

describe('MCP transport', () => {
  let pushed: { log: BaseLog, requestId?: string, sessionId?: string }[];

  beforeEach(() => {
    pushed = [];
    jest.spyOn(logManager, 'startRequest').mockImplementation(() => {});
    jest.spyOn(logManager, 'push').mockImplementation((log) => {
      const ctx = requestContext.get();
      pushed.push({ log, requestId: ctx?.requestId, sessionId: ctx?.sessionId });
    });
  });

  afterEach(() => jest.restoreAllMocks());

  // The MCP Protocol installs its handler after the transport is wrapped, as server.connect() does.
  function connect() {
    const transport = instrumentMcpTransport(new StdioServerTransport());
    const handled: { requestId?: string }[] = [];
    transport.onmessage = (message) => {
      handled.push({ requestId: requestContext.get()?.requestId });
      if ('id' in message && 'method' in message) logManager.push(new RequestEvent(RequestEventPhase.Start, RequestKind.Rpc)); // a log the tool writes
    };
    return { transport, handled };
  }

  it('reads a tool call as a request of the connection, ended by its response', async () => {
    const { transport, handled } = connect();
    transport.receive({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get-logs' } });
    await transport.send({ jsonrpc: '2.0', id: 7, result: {} });

    const [start, toolLog, end] = pushed;
    expect(start.log).toMatchObject({ event: RequestEventPhase.Start, kind: RequestKind.Rpc, operation: 'tools/call get-logs' });
    expect(handled[0].requestId).toBe(start.requestId);
    expect(toolLog.requestId).toBe(start.requestId);
    expect(end.log).toMatchObject({ event: RequestEventPhase.End, kind: RequestKind.Rpc, outcome: RequestOutcome.Ok, startOrderId: start.log.orderId });
    expect(end.requestId).toBe(start.requestId);
    expect(transport.sent).toHaveLength(1);
  });

  it('ends a request answered with a JSON-RPC error as an error, keeping its code', async () => {
    const { transport } = connect();
    transport.receive({ jsonrpc: '2.0', id: 'a', method: 'tools/call', params: { name: 'get-logs' } });
    await transport.send({ jsonrpc: '2.0', id: 'a', error: { code: -32602, message: 'Invalid params' } });

    expect(pushed[pushed.length - 1].log).toMatchObject({ event: RequestEventPhase.End, outcome: RequestOutcome.Error, errorCode: -32602 });
  });

  it('keeps every request of one connection in one session, and notifications out of requests', async () => {
    const { transport, handled } = connect();
    transport.receive({ jsonrpc: '2.0', method: 'notifications/initialized' });
    transport.receive({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    transport.receive({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

    expect(handled[0].requestId).toBeUndefined();
    const starts = pushed.filter(p => (p.log as RequestEvent).operation === 'tools/list');
    expect(starts).toHaveLength(2);
    expect(starts[0].sessionId).toBe(starts[1].sessionId);
    expect(starts[0].requestId).not.toBe(starts[1].requestId);
  });
});

describe('runInRequest', () => {
  let pushed: { log: BaseLog, requestId?: string }[];

  beforeEach(() => {
    pushed = [];
    jest.spyOn(logManager, 'push').mockImplementation((log) => { pushed.push({ log, requestId: requestContext.get()?.requestId }); });
  });

  afterEach(() => jest.restoreAllMocks());

  it('runs the work as one request of the background session and ends ok', async () => {
    const result = await runInRequest(RequestKind.Rpc, 'process order', async () => requestContext.get());

    expect(result?.requestId).toBeDefined();
    expect(result?.sessionId).toBe(requestContext.background.sessionId);
    expect(pushed.map(p => (p.log as RequestEvent).event)).toEqual([RequestEventPhase.Start, RequestEventPhase.End]);
    expect(pushed[1].log).toMatchObject({ outcome: RequestOutcome.Ok, operation: 'process order' });
    expect(pushed[1].requestId).toBe(result?.requestId);
  });

  it('ends with an error and rethrows when the work fails', async () => {
    await expect(runInRequest(RequestKind.Rpc, 'process order', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(pushed[1].log).toMatchObject({ event: RequestEventPhase.End, outcome: RequestOutcome.Error });
  });
});
