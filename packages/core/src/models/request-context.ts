import type User from './user';
import type { Attributes } from './attributes';

/**
 * Context for a request or background job.
 * Captured by middleware (HTTP) or runInContext (background).
 */
export interface RequestContext {
  sessionId: string;       // express-session ID, job ID, or generated UUID
  traceId?: string;        // Optional - only for HTTP requests (x-request-id)
  requestId?: string;      // Minted per HTTP request; groups the request's logs and its start/end events
  callerSessionLink?: string;  // Raw x-shipbook-session header; parsed by the server
  user?: User;             // Full user object (userId, userName, email, etc.)
  attributes?: Attributes;  // The app's own facts about a job's session; a request's go on its start event
  startTime: Date;
  isBackground?: boolean;  // True for background jobs, false for HTTP requests
  jobName?: string;        // Name of the background job (for filtering/searching)
}
