import BaseLog, { LogType } from './base-log';

export default class BaseEvent extends BaseLog {
  constructor(type: LogType) {
    super(type);
  }
}
