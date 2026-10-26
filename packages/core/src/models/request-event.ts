import BaseEvent from './base-event';
import { LogType } from './base-log';
import type { Attributes } from './attributes';

export enum RequestEventPhase {
  Start = 'start',
  End = 'end'
}

// The protocol a request came in on; each kind fills its own detail fields (http: method/route/status).
export enum RequestKind {
  Http = 'http',
  Rpc = 'rpc',
  Job = 'job'  // a background job's run
}

// Whether a request failed, the same for every kind; each kind maps its own result onto it.
export enum RequestOutcome {
  Ok = 'ok',
  Error = 'error'
}

// Two write-once events per backend request; the server turns them into one request record, so the end repeats everything.
export default class RequestEvent extends BaseEvent {
  event: RequestEventPhase;
  kind: RequestKind;
  method?: string;
  route?: string;
  operation?: string; // what a multiplexed endpoint was asked to do, e.g. an MCP 'tools/call get-logs'
  startTime?: Date;
  startOrderId?: number;
  status?: number;
  outcome?: RequestOutcome;
  duration?: number;
  errorCode?: number; // rpc: the JSON-RPC error code
  path?: string; // start only: the concrete path (route is the template)
  ip?: string; // start only
  userAgent?: string; // start only
  attributes?: Attributes; // start only: the app's own facts about the request (the middleware's extractor)

  constructor(event: RequestEventPhase, kind: RequestKind, method?: string, route?: string, operation?: string,
    startTime?: Date, startOrderId?: number, status?: number, outcome?: RequestOutcome, duration?: number, errorCode?: number) {
    super(LogType.RequestEvent);
    this.event = event;
    this.kind = kind;
    this.method = method;
    this.route = route;
    this.operation = operation;
    this.startTime = startTime;
    this.startOrderId = startOrderId;
    this.status = status;
    this.outcome = outcome;
    this.duration = duration;
    this.errorCode = errorCode;
  }
}
