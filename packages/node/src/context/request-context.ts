import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { RequestContext } from '@shipbook/core';

export interface JobContextOptions {
  jobId: string;
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
      metadata: context.metadata || {},
      startTime: new Date()
    };
    return this.asyncStorage.run(fullContext, fn);
  }

  // For background jobs (manual) - no traceId since there's no HTTP request
  runJob<T>(options: JobContextOptions, fn: () => T | Promise<T>): T | Promise<T> {
    const context: RequestContext = {
      sessionId: `job_${options.jobId}`,
      // No traceId - background jobs don't have HTTP requests
      metadata: {
        type: 'background_job',
        jobId: options.jobId,
        ...options.metadata
      },
      startTime: new Date()
    };
    return this.asyncStorage.run(context, fn);
  }

  get(): RequestContext | undefined {
    return this.asyncStorage.getStore();
  }
}

export const requestContext = new RequestContextManager();
