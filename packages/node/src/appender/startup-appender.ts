import type { BaseAppender, BaseLog, RequestContext } from '@shipbook/core';
import { requestContext } from '../context/request-context';

// Without a log it's a session start (ensureSession).
export interface HeldStartupEntry {
  ctx: RequestContext;
  log?: BaseLog;
}

export interface StartupAppenderDeps {
  hold: (entry: HeldStartupEntry) => void;
}

/**
 * Stands in for the cloud appender until the first server config: it holds what would go to the cloud,
 * with the request context it was logged in, so that config filters it instead of a guessed default.
 */
export class StartupAppender implements BaseAppender {
  name: string;
  private static _deps: StartupAppenderDeps;

  static setDeps(deps: StartupAppenderDeps): void {
    StartupAppender._deps = deps;
  }

  constructor(name: string) {
    this.name = name;
  }

  push(log: BaseLog): void {
    StartupAppender._deps.hold({ ctx: requestContext.get() ?? requestContext.background, log });
  }

  ensureSession(ctx: RequestContext): void {
    StartupAppender._deps.hold({ ctx });
  }

  update(): void {}
  flush(): void {}
  destructor(): void {}
}
