import type { IExceptionHandler, ExceptionCallback } from '@shipbook/core';

// React Native's ErrorUtils is a global
declare const ErrorUtils: {
  getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
};

/**
 * React Native exception handler adapter
 */
class ReactNativeExceptionHandler implements IExceptionHandler {
  private active = false;
  private originalHandler?: (error: Error, isFatal?: boolean) => void;
  private callback?: ExceptionCallback;

  start(onException: ExceptionCallback): void {
    if (this.active) return;

    this.callback = onException;
    this.originalHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      if (this.callback) {
        this.callback(
          error.name,
          error.message,
          error.stack,
          isFatal
        );
      }

      // Call original handler
      if (this.originalHandler) {
        this.originalHandler(error, isFatal);
      }
    });

    this.active = true;
  }

  stop(): void {
    if (!this.active) return;

    if (this.originalHandler) {
      ErrorUtils.setGlobalHandler(this.originalHandler);
    }

    this.active = false;
    this.callback = undefined;
    this.originalHandler = undefined;
  }

  isActive(): boolean {
    return this.active;
  }
}

export const exceptionHandler = new ReactNativeExceptionHandler();
