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

  private static isInternalFrame(file: string | undefined, methodName?: string): boolean {
    if (!file) return false;
    // Skip frames from shipbook logging infrastructure
    // Matches: shipbook-js/packages/core (dev), @shipbook/core (npm), node_modules/@shipbook
    if (file.includes('shipbook-js/packages/') ||
        file.includes('node_modules/@shipbook') ||
        file.includes('node_modules/shipbook') ||
        /@shipbook\/(core|browser|node|react-native)/.test(file)) {
      return true;
    }
    // Skip frames with SDK method names (Log.e, Log.w, Log.i, Log.d, Log.v, message, etc.)
    if (methodName && /^Log\.(e|w|i|d|v)$|^message$/.test(methodName)) {
      return true;
    }
    // Skip bundle.js files that might contain bundled SDK code
    // When SDK is bundled, all SDK code is in bundle.js, so we need to skip SDK-related frames
    if (file.endsWith('bundle.js')) {
      // Skip if method name matches SDK patterns
      if (methodName && (
        /^Log\./.test(methodName) ||  // Log.e, Log.w, etc.
        /^message$/.test(methodName) ||  // message method
        /^Log$/.test(methodName) ||  // Log constructor
        /^Message$/.test(methodName) ||  // Message constructor
        /^parseStackTrace$/.test(methodName) ||  // Internal parsing
        /^getObj$/.test(methodName) ||  // Internal method
        /^push$/.test(methodName) ||  // logManager.push
        /^formatMessage$/.test(methodName) ||  // Internal formatting
        /^extractError$/.test(methodName) ||  // Internal error extraction
        /^stringifyArg$/.test(methodName)  // Internal stringification
      )) {
        return true;
      }
    }
    return false;
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

    // When bundled, SDK code is in bundle.js, so we need to skip more frames
    // Skip additional frames that match SDK patterns (Log.message, Log.e, etc.)
    if (!rawStackTrace) {
      let additionalFramesSkipped = 0;
      // Check the next few frames and skip them if they match SDK patterns
      for (let i = 0; i < Math.min(3, stack.length); i++) {
        const frame = stack[i];
        if (Message.isInternalFrame(frame.file ?? undefined, frame.methodName ?? undefined)) {
          additionalFramesSkipped++;
        } else {
          break; // Stop skipping once we find a non-SDK frame
        }
      }
      if (additionalFramesSkipped > 0) {
        stack = stack.slice(additionalFramesSkipped);
      }
    }

    // Find the first frame that isn't from internal logging files or ignored classes
    const frame = stack.find(f => 
      !Message.isInternalFrame(f.file ?? undefined, f.methodName ?? undefined) && 
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
