import { logManager, RequestEvent, RequestEventPhase, RequestKind, RequestOutcome, BaseLog, RequestContext } from '@shipbook/core';
import { Shipbook } from '../src';
import { requestContext } from '../src/context/request-context';

// A job run is a request of kind Job: counted at its start, with start and end events in the job's session.
describe('runInContext()', () => {
  let started: RequestContext[];
  let pushed: { event: RequestEvent, ctx?: RequestContext }[];

  beforeEach(() => {
    started = [];
    pushed = [];
    jest.spyOn(logManager, 'startRequest').mockImplementation(ctx => { started.push(ctx); });
    jest.spyOn(logManager, 'push').mockImplementation((log: BaseLog) => {
      pushed.push({ event: log as RequestEvent, ctx: requestContext.get() });
    });
  });

  it('runs fn as one request of the job session and counts it', async () => {
    const result = await Shipbook.runInContext({ jobName: 'send-emails' }, async () => {
      const ctx = requestContext.get()!;
      expect(ctx.jobName).toBe('send-emails');
      expect(ctx.isBackground).toBe(true);
      expect(ctx.requestId).toBeDefined();
      return 42;
    });

    expect(result).toBe(42);
    expect(started).toHaveLength(1);
    expect(started[0].jobName).toBe('send-emails');
    expect(started[0].requestId).toBeDefined();

    expect(pushed.map(p => [p.event.event, p.event.kind, p.event.operation, p.event.outcome]))
      .toEqual([[RequestEventPhase.Start, RequestKind.Job, 'send-emails', undefined], [RequestEventPhase.End, RequestKind.Job, 'send-emails', RequestOutcome.Ok]]);
    expect(pushed.every(p => p.ctx?.requestId === started[0].requestId)).toBe(true);
  });

  it('ends the run as an error and rethrows when fn throws', async () => {
    await expect(Shipbook.runInContext({ jobName: 'nightly' }, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(pushed.map(p => p.event.outcome)).toEqual([undefined, RequestOutcome.Error]);
  });

  it('gives each run its own session', async () => {
    await Shipbook.runInContext({ jobName: 'nightly' }, async () => {});
    await Shipbook.runInContext({ jobName: 'nightly' }, async () => {});
    expect(new Set(started.map(ctx => ctx.sessionId)).size).toBe(2);
  });
});
