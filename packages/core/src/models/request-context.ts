import type User from './user';

/**
 * Context for a request or background job.
 * Captured by middleware (HTTP) or runInContext (background).
 */
export interface RequestContext {
  sessionId: string;       // express-session ID, job ID, or generated UUID
  traceId?: string;        // Optional - only for HTTP requests (x-request-id)
  user?: User;             // Full user object (userId, userName, email, etc.)
  metadata: Record<string, unknown>;  // method, path, ip, etc.
  startTime: Date;
}
