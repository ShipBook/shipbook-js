// How long the process waits for last uploads before it ends, as Sentry's default shutdownTimeout.
export const BEFORE_EXIT_TIMEOUT = 2000;

export function untilDoneOrTimeout(work: void | Promise<unknown>): Promise<unknown> {
  const timeout = new Promise(resolve => setTimeout(resolve, BEFORE_EXIT_TIMEOUT));
  return Promise.race([Promise.resolve(work).catch(() => undefined), timeout]);
}
