import { CONFIG_CHANGE, eventEmitter } from './utils/event-emitter';
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
      this.severity = logManager.getSeverity(tag);
      this.callStackSeverity = logManager.getCallStackSeverity(tag);
    });
  }

  private static stringifyArg(arg: unknown): string {
    if (arg === undefined) return 'undefined';
    if (arg === null) return 'null';
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }

  private static formatMessage(msg: string, args: unknown[]): string {
    if (args.length === 0) return msg;
    const formattedArgs = args.map(Log.stringifyArg).join(' ');
    return `${msg} ${formattedArgs}`;
  }

  private static extractError(args: unknown[]): { args: unknown[], error?: Error } {
    if (args.length > 0 && args[args.length - 1] instanceof Error) {
      return { args: args.slice(0, -1), error: args[args.length - 1] as Error };
    }
    return { args, error: undefined };
  }

  // Static methods for logging without a tag
  static e(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    Log.message(Log.formatMessage(msg, restArgs), Severity.Error, error);
  }

  static w(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    Log.message(Log.formatMessage(msg, restArgs), Severity.Warning, error);
  }

  static i(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    Log.message(Log.formatMessage(msg, restArgs), Severity.Info, error);
  }

  static d(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    Log.message(Log.formatMessage(msg, restArgs), Severity.Debug, error);
  }

  static v(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    Log.message(Log.formatMessage(msg, restArgs), Severity.Verbose, error);
  }

  static message(
    msg: string,
    severity: Severity,
    error?: Error,
    tag?: string
  ): void {
    // Create message first - it derives the tag from stack trace if not provided
    const message = new Message(msg, severity, tag, error);

    if (SeverityUtil.value(severity) > SeverityUtil.value(logManager.getSeverity(message.tag))) {
      return;
    }

    // Clear stackTrace if severity doesn't require it
    if (SeverityUtil.value(severity) > SeverityUtil.value(logManager.getCallStackSeverity(message.tag))) {
      message.stackTrace = undefined;
    }

    logManager.push(message);
  }

  // Instance methods
  e(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    this.message(Log.formatMessage(msg, restArgs), Severity.Error, error);
  }

  w(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    this.message(Log.formatMessage(msg, restArgs), Severity.Warning, error);
  }

  i(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    this.message(Log.formatMessage(msg, restArgs), Severity.Info, error);
  }

  d(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    this.message(Log.formatMessage(msg, restArgs), Severity.Debug, error);
  }

  v(msg: string, ...args: unknown[]): void {
    const { args: restArgs, error } = Log.extractError(args);
    this.message(Log.formatMessage(msg, restArgs), Severity.Verbose, error);
  }

  message(
    msg: string,
    severity: Severity,
    e?: Error
  ): void {
    if (SeverityUtil.value(severity) > SeverityUtil.value(this.severity)) {
      return;
    }

    const message = new Message(msg, severity, this.tag, e);

    // Clear stackTrace if severity doesn't require it
    if (SeverityUtil.value(severity) > SeverityUtil.value(this.callStackSeverity)) {
      message.stackTrace = undefined;
    }

    logManager.push(message);
  }
}
