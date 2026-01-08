import * as stackTraceParser from 'stacktrace-parser';

/**
 * Normalized stack frame format sent to server
 */
export interface StackFrame {
  file: string;
  lineNumber: number;
  column?: number;
  methodName?: string;
}

/**
 * Normalized stack trace with both parsed frames and raw string
 */
export interface NormalizedStackTrace {
  frames: StackFrame[];
  raw: string;
}

/**
 * Parse and normalize a stack trace string from any JavaScript engine
 * (V8, Hermes, JavaScriptCore, SpiderMonkey)
 * 
 * @param rawStack - Raw stack trace string from Error.stack
 * @returns Normalized stack trace object
 */
export function normalizeStackTrace(rawStack: string): NormalizedStackTrace {
  const parsed = stackTraceParser.parse(rawStack);
  
  return {
    frames: parsed.map(frame => ({
      file: frame.file ?? 'unknown',
      lineNumber: frame.lineNumber ?? 0,
      column: frame.column ?? undefined,
      methodName: frame.methodName ?? undefined
    })),
    raw: rawStack
  };
}

/**
 * Extract file name from a full file path
 */
export function extractFileName(filePath: string): string {
  if (!filePath) return 'unknown';
  
  const lastSlash = Math.max(
    filePath.lastIndexOf('/'),
    filePath.lastIndexOf('\\')
  );
  
  return lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;
}

/**
 * Extract module/tag name from a file path (without extension)
 */
export function extractModuleName(filePath: string): string {
  const fileName = extractFileName(filePath);
  const lastDot = fileName.lastIndexOf('.');
  
  return lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
}
