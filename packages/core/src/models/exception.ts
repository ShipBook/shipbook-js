import * as stackTraceParser from 'stacktrace-parser';
import BaseLog, { LogType } from './base-log';

export class StackTraceElement {
  methodName: string;
  fileName: string;
  lineNumber: number;
  column: number;
  arguments?: string[];

  constructor(stackFrame: stackTraceParser.StackFrame) {
    this.methodName = stackFrame.methodName ?? '<unknown>';
    this.fileName = stackFrame.file ?? '<unknown>';
    this.lineNumber = stackFrame.lineNumber ?? 0;
    this.column = stackFrame.column ?? 0;
  }
}

/**
 * Type for optional symbolication function that can be provided by platform adapters
 */
export type SymbolicateFunction = (
  stack: stackTraceParser.StackFrame[]
) => Promise<{ stack: stackTraceParser.StackFrame[] }>;

export default class Exception extends BaseLog {
  /**
   * Platform-specific symbolication function
   * Set by platform adapters (e.g., React Native's symbolicateStackTrace)
   */
  static symbolicateStackTrace?: SymbolicateFunction;

  name: string;
  reason: string;
  stack: string;
  callStackSymbols?: string[];
  stackTrace?: StackTraceElement[];

  constructor(name: string, reason: string, stack: string) {
    super(LogType.Exception);
    this.name = name;
    this.reason = reason;
    this.stack = stack;
  }

  async getObj(): Promise<Exception> {
    if (this.stackTrace) return this;

    const stack = stackTraceParser.parse(this.stack);
    let symbolicatedStack: stackTraceParser.StackFrame[] = stack;

    // Try platform-specific symbolication if available
    if (Exception.symbolicateStackTrace) {
      try {
        const symbolicated = await Exception.symbolicateStackTrace(stack);
        if (symbolicated && symbolicated.stack) {
          symbolicatedStack = symbolicated.stack;
        }
      } catch {
        // Symbolication failed, use raw stack
      }
    }

    this.stackTrace = symbolicatedStack.map(sf => new StackTraceElement(sf));
    return this;
  }
}
