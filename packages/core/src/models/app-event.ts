import BaseEvent from './base-event';
import { LogType } from './base-log';

export default class AppEvent extends BaseEvent {
  event: string;
  state: string;
  orientation: string;

  constructor(event: string, state: string, orientation: string) {
    super(LogType.AppEvent);
    this.event = event;
    this.state = state;
    this.orientation = orientation;
  }
}
