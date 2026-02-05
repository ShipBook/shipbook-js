export enum LogType {
  Message = 'message',
  Exception = 'exception',
  AppEvent = 'appEvent',
  ScreenEvent = 'screenEvent'
}

/**
 * Thread information (relevant for mobile SDKs, optional in JS).
 */
export interface ThreadInfo {
  queueLabel?: string;
  threadName: string;
  threadId: number;
}

export default class BaseLog {
  static count = 0;

  time: Date;
  orderId: number;
  type: LogType;
  traceId?: string;
  threadInfo?: ThreadInfo;

  constructor(type: LogType) {
    this.type = type;
    this.time = new Date();
    this.orderId = ++BaseLog.count;
  }
}
