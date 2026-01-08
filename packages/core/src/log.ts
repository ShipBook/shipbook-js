import { CONFIG_CHANGE, eventEmitter } from './utils/event-emitter';
import InnerLog from './utils/inner-log';
import logManager from './log-manager';
import Message from './models/message';
import { Severity, SeverityUtil } from './models/severity';

export default class Log {
  private tag: string;
  private severity: Severity;
  private callStackSeverity: Severity;

  constructor(tag: string) {
    this.tag = tag;
    this.severity = logManager.getSeverity(tag);
    this.callStackSeverity = logManager.getCallStackSeverity(tag);
    
    eventEmitter.addListener(CONFIG_CHANGE, () => {
      InnerLog.i('config changed');
      this.severity = logManager.getSeverity(tag);
      this.callStackSeverity = logManager.getCallStackSeverity(tag);
    });
  }

  // Static methods for logging without a tag
  static e(msg: string, e?: Error): void {
    Log.message(msg, Severity.Error, e);
  }

  static w(msg: string, e?: Error): void {
    Log.message(msg, Severity.Warning, e);
  }

  static i(msg: string, e?: Error): void {
    Log.message(msg, Severity.Info, e);
  }

  static d(msg: string, e?: Error): void {
    Log.message(msg, Severity.Debug, e);
  }

  static v(msg: string, e?: Error): void {
    Log.message(msg, Severity.Verbose, e);
  }

  static message(
    msg: string,
    severity: Severity,
    error?: Error,
    tag?: string,
    func?: string,
    file?: string,
    line?: number
  ): void {
    let message: Message;
    
    if (!tag) {
      message = new Message(msg, severity, undefined, undefined, error, func, file, line);
      if (!message.tag) return;

      if (SeverityUtil.value(severity) > SeverityUtil.value(logManager.getSeverity(message.tag))) {
        return;
      }
      const stackTrace = SeverityUtil.value(severity) <= SeverityUtil.value(logManager.getCallStackSeverity(message.tag))
        ? new Error().stack
        : undefined;
      message.stackTrace = stackTrace;
    } else {
      if (SeverityUtil.value(severity) > SeverityUtil.value(logManager.getSeverity(tag))) {
        return;
      }
      const stackTrace = SeverityUtil.value(severity) <= SeverityUtil.value(logManager.getCallStackSeverity(tag))
        ? new Error().stack
        : undefined;
      message = new Message(msg, severity, tag, stackTrace, error, func, file, line);
    }
    
    logManager.push(message);
  }

  // Instance methods
  e(msg: string, e?: Error): void {
    this.message(msg, Severity.Error, e);
  }

  w(msg: string, e?: Error): void {
    this.message(msg, Severity.Warning, e);
  }

  i(msg: string, e?: Error): void {
    this.message(msg, Severity.Info, e);
  }

  d(msg: string, e?: Error): void {
    this.message(msg, Severity.Debug, e);
  }

  v(msg: string, e?: Error): void {
    this.message(msg, Severity.Verbose, e);
  }

  message(
    msg: string,
    severity: Severity,
    e?: Error,
    func?: string,
    file?: string,
    line?: number
  ): void {
    if (SeverityUtil.value(severity) > SeverityUtil.value(this.severity)) {
      return;
    }
    
    const stackTrace = SeverityUtil.value(severity) <= SeverityUtil.value(this.callStackSeverity)
      ? new Error().stack
      : undefined;
    
    const message = new Message(msg, severity, this.tag, stackTrace, e, func, file, line);
    logManager.push(message);
  }
}
