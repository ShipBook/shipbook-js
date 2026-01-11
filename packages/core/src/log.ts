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
    // Create a temporary message to get the tag if not provided
    const tempTag = tag ?? Log.getTagFromStack();
    if (!tempTag) return;

    if (SeverityUtil.value(severity) > SeverityUtil.value(logManager.getSeverity(tempTag))) {
      return;
    }

    const stackTrace = SeverityUtil.value(severity) <= SeverityUtil.value(logManager.getCallStackSeverity(tempTag))
      ? new Error().stack
      : undefined;

    const message = new Message(msg, severity, tag, stackTrace, error, func, file, line);
    logManager.push(message);
  }

  /**
   * Extract tag from current stack trace
   */
  private static getTagFromStack(): string | undefined {
    const stack = new Error().stack;
    if (!stack) return undefined;

    // Parse stack and find the calling file
    const lines = stack.split('\n');
    // Skip first few lines (Error, getTagFromStack, message, static method, actual caller)
    for (let i = 4; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/at\s+(?:.+?\s+)?\(?(.+?):\d+:\d+\)?/);
      if (match && match[1]) {
        const fileName = match[1];
        const lastDot = fileName.lastIndexOf('.');
        const lastSlash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
        const start = lastSlash + 1;
        const end = lastDot > start ? lastDot : fileName.length;
        return fileName.substring(start, end);
      }
    }
    return '<unknown>';
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
