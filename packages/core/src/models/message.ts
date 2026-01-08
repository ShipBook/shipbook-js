import * as stackTraceParser from 'stacktrace-parser';
import BaseLog, { LogType } from './base-log';
import { Severity } from './severity';

export default class Message extends BaseLog {
  static ignoreClasses = new Set<string>();

  severity: Severity;
  message: string;
  tag?: string;
  stackTrace?: string;
  error?: Error;
  function?: string;
  fileName?: string;
  lineNumber?: number;
  column?: number;

  private resolveList: ((message: Message) => void)[] = [];
  private stackReceived = false;

  constructor(
    message: string,
    severity: Severity,
    tag?: string,
    stackTrace?: string,
    error?: Error,
    func?: string,
    file?: string,
    line?: number
  ) {
    super(LogType.Message);
    this.message = message;
    this.severity = severity;
    this.tag = tag;
    this.stackTrace = stackTrace;
    this.error = error;
    this.function = func;
    this.fileName = file;
    this.lineNumber = line;

    if (!file) {
      this.parseStackTrace();
    } else {
      this.stackReceived = true;
    }
  }

  private parseStackTrace(): void {
    const stackString = new Error().stack!;
    let stack = stackTraceParser.parse(stackString);
    // Remove internal frames (constructor and calling methods)
    stack.splice(0, 3);

    // Find the first frame that isn't from ignored classes
    const frame = stack.find(f => !Message.ignoreClasses.has(f.methodName ?? ''));
    
    if (frame) {
      this.function = frame.methodName ?? undefined;
      this.fileName = frame.file ?? undefined;
      this.lineNumber = frame.lineNumber ?? undefined;
      this.column = frame.column ?? undefined;
    }

    // If no tag provided, derive from filename
    if (!this.tag) {
      if (this.fileName) {
        const lastDot = this.fileName.lastIndexOf('.');
        const lastSlash = Math.max(
          this.fileName.lastIndexOf('/'),
          this.fileName.lastIndexOf('\\')
        );
        const start = lastSlash + 1;
        const end = lastDot > start ? lastDot : this.fileName.length;
        this.tag = this.fileName.substring(start, end);
      } else {
        this.tag = '<unknown>';
      }
    }

    this.stackReceived = true;
    this.resolveList.forEach(resolve => resolve(this));
    this.resolveList = [];
  }

  async getObj(): Promise<Message> {
    if (!this.stackReceived) {
      const promise = new Promise<Message>((resolve) => {
        this.resolveList.push(resolve);
      });
      return promise;
    }
    return this;
  }
}
