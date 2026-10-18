import BaseEvent from './base-event';
import { LogType } from './base-log';

export enum RequestEventPhase {
  Start = 'start',
  End = 'end'
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

  constructor(event: RequestEventPhase, method: string, route: string,
    startTime?: Date, startOrderId?: number, status?: number, duration?: number) {
    super(LogType.RequestEvent);
    this.event = event;
    this.method = method;
    this.route = route;
    this.startTime = startTime;
    this.startOrderId = startOrderId;
    this.status = status;
    this.duration = duration;
  }
}
