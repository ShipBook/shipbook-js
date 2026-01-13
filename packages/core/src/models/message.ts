import * as stackTraceParser from 'stacktrace-parser';
import BaseLog, { LogType } from './base-log';
import { Severity } from './severity';
import { StackTraceElement } from './exception';

export default class Message extends BaseLog {
  static ignoreClasses = new Set<string>();

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
    rawStackTrace?: string,
    error?: Error,
    func?: string,
    file?: string,
    line?: number
  ) {
    super(LogType.Message);
    this.message = message;
    this.severity = severity;
    this.tag = '';
    this.function = func ?? '';
    this.fileName = file ?? '';
    this.lineNumber = line ?? 0;

    if (error) {
      this.exception = {
        name: error.name,
        reason: error.message
      };
    }

    if (!file) {
      this.parseStackTrace(rawStackTrace);
    } else {
      // If file info provided, still parse the stackTrace for the full trace
      if (rawStackTrace) {
        const stack = stackTraceParser.parse(rawStackTrace);
        this.stackTrace = stack.map(sf => new StackTraceElement(sf));
        if (this.exception) this.exception.stackTrace = this.stackTrace;
      }
      this.stackReceived = true;
    }

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

  private static isInternalFrame(file: string | undefined): boolean {
    if (!file) return false;
    // Skip frames from shipbook logging infrastructure
    // Matches: shipbook-js/packages/core (dev), @shipbook/core (npm), node_modules/@shipbook
    return file.includes('shipbook-js/packages/') ||
           file.includes('node_modules/@shipbook') ||
           file.includes('node_modules/shipbook') ||
           /@shipbook\/(core|browser|node|react-native)/.test(file);
  }

  private parseStackTrace(rawStackTrace?: string): void {
    const stackString = rawStackTrace ?? new Error().stack!;
    let stack = stackTraceParser.parse(stackString);
    
    // If no raw stack was provided, remove internal frames (constructor and calling methods)
    if (!rawStackTrace) {
      stack.splice(0, 3);
    }

    // Convert to StackTraceElement array
    this.stackTrace = stack.map(sf => new StackTraceElement(sf));

    // Find the first frame that isn't from internal logging files or ignored classes
    const frame = stack.find(f => 
      !Message.isInternalFrame(f.file ?? undefined) && 
      !Message.ignoreClasses.has(f.methodName ?? '')
    );
    
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
