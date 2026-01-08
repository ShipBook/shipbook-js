/**
 * Internal logging utility for Shipbook SDK debug output
 */
class InnerLog {
  enabled = false;

  e(message?: unknown, ...optionalParams: unknown[]): void {
    if (!this.enabled) return;
    console.error('Shipbook: ' + message, ...optionalParams);
  }

  w(message?: unknown, ...optionalParams: unknown[]): void {
    if (!this.enabled) return;
    console.warn('Shipbook: ' + message, ...optionalParams);
  }

  i(message?: unknown, ...optionalParams: unknown[]): void {
    if (!this.enabled) return;
    console.info('Shipbook: ' + message, ...optionalParams);
  }

  d(message?: unknown, ...optionalParams: unknown[]): void {
    if (!this.enabled) return;
    console.debug('Shipbook: ' + message, ...optionalParams);
  }
}

export default new InnerLog();
