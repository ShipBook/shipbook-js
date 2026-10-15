import BaseEvent from './base-event';
import { LogType } from './base-log';

export enum RequestEventPhase {
  Start = 'start',
  End = 'end'
}

export interface RequestEventDetails {
  method: string;
  route: string;
  startTime?: Date;
  startOrderId?: number;
  status?: number;
  duration?: number;
}

// Two write-once events per backend request; the server turns them into one request record, so the end repeats everything.
export default class RequestEvent extends BaseEvent {
  event: RequestEventPhase;
  method: string;
  route: string;
  startTime?: Date;
  startOrderId?: number;
  status?: number;
  duration?: number;

  constructor(event: RequestEventPhase, details: RequestEventDetails) {
    super(LogType.RequestEvent);
    this.event = event;
    this.method = details.method;
    this.route = details.route;
    this.startTime = details.startTime;
    this.startOrderId = details.startOrderId;
    this.status = details.status;
    this.duration = details.duration;
  }
}
