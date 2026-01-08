import BaseEvent from './base-event';
import { LogType } from './base-log';

export default class ScreenEvent extends BaseEvent {
  name: string;

  constructor(name: string) {
    super(LogType.ScreenEvent);
    this.name = name;
  }
}
