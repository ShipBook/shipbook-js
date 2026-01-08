import type { IExceptionHandler, ExceptionCallback } from '@shipbook/core';

/**
 * Node.js exception handler adapter using process events
 */
class NodeExceptionHandler implements IExceptionHandler {
  private active = false;
  private callback?: ExceptionCallback;
  private uncaughtHandler?: (error: Error) => void;
  private unhandledRejectionHandler?: (reason: unknown, promise: Promise<unknown>) => void;

  start(onException: ExceptionCallback): void {
    if (this.active) return;

    this.callback = onException;

    // Handle uncaught exceptions
    this.uncaughtHandler = (error: Error) => {
      if (this.callback) {
        this.callback(
          error.name,
          error.message,
          error.stack,
          true // Fatal
        );
      }
    };

    // Handle unhandled promise rejections
    this.unhandledRejectionHandler = (reason: unknown) => {
      if (this.callback) {
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

    process.on('uncaughtException', this.uncaughtHandler);
    process.on('unhandledRejection', this.unhandledRejectionHandler);

    this.active = true;
  }

  stop(): void {
    if (!this.active) return;

    if (this.uncaughtHandler) {
      process.removeListener('uncaughtException', this.uncaughtHandler);
    }

    if (this.unhandledRejectionHandler) {
      process.removeListener('unhandledRejection', this.unhandledRejectionHandler);
    }

    this.active = false;
    this.callback = undefined;
    this.uncaughtHandler = undefined;
    this.unhandledRejectionHandler = undefined;
  }

  isActive(): boolean {
    return this.active;
  }
}

export const exceptionHandler = new NodeExceptionHandler();
