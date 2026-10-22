import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { RequestContext } from '@shipbook/core';

export interface JobContextOptions {
  jobName: string;
  metadata?: Record<string, unknown>;
}

export class RequestContextManager {
  private asyncStorage = new AsyncLocalStorage<RequestContext>();

  // One background session per process lifecycle: where logs (and requests) outside any other context belong.
  readonly background: RequestContext = {
    sessionId: randomUUID(),
    startTime: new Date(),
    isBackground: true,
    metadata: { type: 'background' }
  };

  // Runs fn in exactly this context, e.g. to re-enter a request's context from an event fired outside it.
  enter<T>(context: RequestContext, fn: () => T): T {
    return this.asyncStorage.run(context, fn);
  }

  // For HTTP requests (via middleware)
  run<T>(context: Partial<RequestContext>, fn: () => T): T {
    const fullContext: RequestContext = {
      sessionId: context.sessionId || randomUUID(),
      traceId: context.traceId,  // Only set if provided (from x-request-id header)
      requestId: context.requestId,
      callerSessionLink: context.callerSessionLink,
      user: context.user,
      metadata: context.metadata,
      startTime: new Date(),
      isBackground: false  // HTTP requests are not background jobs
    };
    return this.asyncStorage.run(fullContext, fn);
  }

  // For background jobs (manual) - no traceId since there's no HTTP request
  // Each job run gets a unique session ID
  runJob<T>(options: JobContextOptions, fn: () => T): T {
    const context: RequestContext = {
      sessionId: randomUUID(),
      // No traceId - background jobs don't have HTTP requests
      metadata: options.metadata,
      startTime: new Date(),
      isBackground: true,
      jobName: options.jobName
    };
    return this.asyncStorage.run(context, fn);
  }

  get(): RequestContext | undefined {
    return this.asyncStorage.getStore();
  }
}

export const requestContext = new RequestContextManager();
