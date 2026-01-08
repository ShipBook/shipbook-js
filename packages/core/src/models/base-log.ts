export enum LogType {
  Message = 'message',
  Exception = 'exception',
  AppEvent = 'appEvent',
  ScreenEvent = 'screenEvent'
}

export default class BaseLog {
  static count = 0;
  
  time: Date;
  orderId: number;
  type: LogType;

  constructor(type: LogType) {
    this.type = type;
    this.time = new Date();
    this.orderId = ++BaseLog.count;
  }
}
