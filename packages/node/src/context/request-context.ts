import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { RequestContext } from '@shipbook/core';

export interface JobContextOptions {
  jobName: string;
  metadata?: Record<string, unknown>;
}

export class RequestContextManager {
  private asyncStorage = new AsyncLocalStorage<RequestContext>();

  // For HTTP requests (via middleware)
  run<T>(context: Partial<RequestContext>, fn: () => T): T {
    const fullContext: RequestContext = {
      sessionId: context.sessionId || randomUUID(),
      traceId: context.traceId,  // Only set if provided (from x-request-id header)
      user: context.user,
      metadata: context.metadata,
      startTime: new Date(),
      isBackground: false  // HTTP requests are not background jobs
    };
    return this.asyncStorage.run(fullContext, fn);
  }

  // For background jobs (manual) - no traceId since there's no HTTP request
  // Each job run gets a unique session ID
  runJob<T>(options: JobContextOptions, fn: () => T | Promise<T>): T | Promise<T> {
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
