import type { IExceptionHandler, ExceptionCallback } from '@shipbook/core';
import { untilDoneOrTimeout } from '../utils/before-exit';

/**
 * Node.js exception handler adapter using process events.
 * Listening to uncaughtException/unhandledRejection takes over Node's own reaction (print and exit),
 * so when no other listener is registered this adapter does it, after the callback's work (bounded).
 */
class NodeExceptionHandler implements IExceptionHandler {
  private active = false;
  private exiting = false;
  private callback?: ExceptionCallback;
  private uncaughtHandler?: (error: Error) => void;
  private unhandledRejectionHandler?: (reason: unknown, promise: Promise<unknown>) => void;

  start(onException: ExceptionCallback): void {
    if (this.active) return;

    this.callback = onException;

    this.uncaughtHandler = (error: Error) => {
      this.handle('uncaughtException', error.name, error.message, error.stack, true);
    };

    this.unhandledRejectionHandler = (reason: unknown) => {
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

      // Node's default for an unhandled rejection is to crash (--unhandled-rejections=throw); warn and none keep running.
      const rejectionMode = [...process.execArgv, ...(process.env.NODE_OPTIONS?.split(' ') ?? [])]
        .find(arg => arg.startsWith('--unhandled-rejections='))?.split('=')[1] ?? 'throw';
      this.handle('unhandledRejection', name, message, stack, ['throw', 'strict'].includes(rejectionMode));
    };

    process.on('uncaughtException', this.uncaughtHandler);
    process.on('unhandledRejection', this.unhandledRejectionHandler);

    this.active = true;
  }

  private handle(event: 'uncaughtException' | 'unhandledRejection', name: string, message: string, stack: string | undefined, isFatal: boolean): void {
    const work = this.callback?.(name, message, stack, isFatal);
    if (!isFatal || process.listenerCount(event) > 1 || this.exiting) return;
    this.exiting = true;
    // Node prints the error before exiting; listening took that over.
    console.error(stack ?? `${name}: ${message}`);
    untilDoneOrTimeout(work).finally(() => process.exit(1));
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
    this.exiting = false;
    this.callback = undefined;
    this.uncaughtHandler = undefined;
    this.unhandledRejectionHandler = undefined;
  }

  isActive(): boolean {
    return this.active;
  }
}

export const exceptionHandler = new NodeExceptionHandler();
