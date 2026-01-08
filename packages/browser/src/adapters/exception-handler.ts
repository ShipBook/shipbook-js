import type { IExceptionHandler, ExceptionCallback } from '@shipbook/core';

/**
 * Browser exception handler adapter using window.onerror and unhandledrejection
 */
class BrowserExceptionHandler implements IExceptionHandler {
  private active = false;
  private callback?: ExceptionCallback;
  private errorHandler?: OnErrorEventHandler;
  private rejectionHandler?: (event: PromiseRejectionEvent) => void;

  start(onException: ExceptionCallback): void {
    if (this.active) return;

    this.callback = onException;

    // Handle uncaught errors
    this.errorHandler = (
      message: string | Event,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error
    ) => {
      if (this.callback) {
        const name = error?.name || 'Error';
        const msg = error?.message || (typeof message === 'string' ? message : 'Unknown error');
        const stack = error?.stack || `at ${source}:${lineno}:${colno}`;
        
        this.callback(name, msg, stack, false);
      }
      
      // Return false to allow the error to propagate
      return false;
    };

    // Handle unhandled promise rejections
    this.rejectionHandler = (event: PromiseRejectionEvent) => {
      if (this.callback) {
        const reason = event.reason;
        let name = 'UnhandledRejection';
        let message = 'Unhandled Promise Rejection';
        let stack: string | undefined;

        if (reason instanceof Error) {
          name = reason.name;
          message = reason.message;
          stack = reason.stack;
        } else if (typeof reason === 'string') {
          message = reason;
        } else if (reason !== undefined) {
          message = String(reason);
        }

        this.callback(name, message, stack, false);
      }
    };

    window.onerror = this.errorHandler;
    window.addEventListener('unhandledrejection', this.rejectionHandler);

    this.active = true;
  }

  stop(): void {
    if (!this.active) return;

    if (this.errorHandler) {
      window.onerror = null;
    }

    if (this.rejectionHandler) {
      window.removeEventListener('unhandledrejection', this.rejectionHandler);
    }

    this.active = false;
    this.callback = undefined;
    this.errorHandler = undefined;
    this.rejectionHandler = undefined;
  }

  isActive(): boolean {
    return this.active;
  }
}

export const exceptionHandler = new BrowserExceptionHandler();
