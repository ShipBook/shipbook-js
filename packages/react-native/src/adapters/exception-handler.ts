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

  private describeUnknown(error: unknown): string {
    if (error == null) return 'Unknown error';
    if (typeof error === 'object') {
      try { return JSON.stringify(error); } catch { /* circular ref */ }
    }
    return String(error);
  }

  start(onException: ExceptionCallback): void {
    if (this.active) return;

    this.callback = onException;
    this.originalHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      try {
        const isError = error instanceof Error;
        this.callback?.(
          isError ? error.name : 'Exception',
          isError ? error.message : this.describeUnknown(error),
          isError ? error.stack : '',
          isFatal
        );
      } finally {
        this.originalHandler?.(error, isFatal);
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
