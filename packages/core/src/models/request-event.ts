import BaseEvent from './base-event';
import { LogType } from './base-log';

export enum RequestEventPhase {
  Start = 'start',
  End = 'end'
}

export interface RequestEventDetails {
  method?: string;
  path?: string;
  status?: number;
  duration?: number;
}

// Two write-once events per backend request (start, end); the server groups them with the request's logs by requestId.
export default class RequestEvent extends BaseEvent {
  event: RequestEventPhase;
  method?: string;
  path?: string;
  status?: number;
  duration?: number;

  constructor(event: RequestEventPhase, details: RequestEventDetails) {
    super(LogType.RequestEvent);
    this.event = event;
    this.method = details.method;
    this.path = details.path;
    this.status = details.status;
    this.duration = details.duration;
  }
}
