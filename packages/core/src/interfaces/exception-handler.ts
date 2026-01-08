/**
 * Exception handler interface for global error capture.
 * 
 * Implementations:
 * - React Native: ErrorUtils global handler
 * - Browser: window.onerror, unhandledrejection
 * - Node.js: process.on('uncaughtException', 'unhandledRejection')
 */
export interface IExceptionHandler {
  /**
   * Start capturing global exceptions
   * @param onException Callback invoked when an exception is caught
   */
  start(onException: ExceptionCallback): void;

  /**
   * Stop capturing global exceptions
   */
  stop(): void;

  /**
   * Check if exception handler is currently active
   */
  isActive(): boolean;
}

/**
 * Callback type for exception handling
 */
export type ExceptionCallback = (
  name: string,
  message: string,
  stack?: string,
  isFatal?: boolean
) => void;
