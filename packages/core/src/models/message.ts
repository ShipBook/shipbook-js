import * as stackTraceParser from 'stacktrace-parser';
import BaseLog, { LogType } from './base-log';
import { Severity } from './severity';
import { StackTraceElement } from './exception';

export default class Message extends BaseLog {
  static ignoreClasses = new Set<string>();
  static stackOffset = 0;

  severity: Severity;
  message: string;
  tag: string;
  stackTrace?: StackTraceElement[];
  exception?: { name: string; reason: string; stackTrace?: StackTraceElement[] };
  function: string;
  fileName: string;
  lineNumber: number;
  column?: number;

  private resolveList: ((message: Message) => void)[] = [];
  private stackReceived = false;

  constructor(
    message: string,
    severity: Severity,
    tag?: string,
    error?: Error
  ) {
    super(LogType.Message);
    this.message = message;
    this.severity = severity;
    this.tag = '';
    this.function = '';
    this.fileName = '';
    this.lineNumber = 0;

    if (error) {
      this.exception = {
        name: error.name,
        reason: error.message
      };
    }

    this.parseStackTrace();

    // Set tag: use provided tag, or derive from fileName
    this.tag = tag ?? this.deriveTagFromFileName();
  }

  private deriveTagFromFileName(): string {
    if (!this.fileName) return '';
    const lastDot = this.fileName.lastIndexOf('.');
    const lastSlash = Math.max(
      this.fileName.lastIndexOf('/'),
      this.fileName.lastIndexOf('\\')
    );
    const start = lastSlash + 1;
    const end = lastDot > start ? lastDot : this.fileName.length;
    return this.fileName.substring(start, end);
  }

  private parseStackTrace(): void {
    const stackString = new Error().stack!;
    let stack = stackTraceParser.parse(stackString);

    // Remove internal SDK frames:
    // 0: parseStackTrace, 1: Message constructor, 2: Log.message, 3: Log.e/w/i/d/v
    stack.splice(0, 4 + Message.stackOffset);

    // Convert to StackTraceElement array
    this.stackTrace = stack.map(sf => new StackTraceElement(sf));

    // Find the first frame that isn't from ignored classes
    const frame = stack.find(f => {
      const methodName = f.methodName;
      if (!methodName) return true;
      for (const cls of Message.ignoreClasses) {
        if (methodName === cls || methodName.startsWith(cls + '.')) return false;
      }
      return true;
    });
    
    if (frame) {
      this.function = frame.methodName ?? '';
      // Strip query parameters (e.g., Vite's cache-busting ?t=timestamp)
      let fileName = frame.file ?? '';
      const queryIndex = fileName.indexOf('?');
      if (queryIndex !== -1) fileName = fileName.substring(0, queryIndex);
      this.fileName = fileName;
      this.lineNumber = frame.lineNumber ?? 0;
      this.column = frame.column ?? undefined;
    }

    if (this.exception) this.exception.stackTrace = this.stackTrace;

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
