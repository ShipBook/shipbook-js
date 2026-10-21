import type { IEventManager, AppState } from '@shipbook/core';
import { untilDoneOrTimeout } from './before-exit';

const EXIT_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/**
 * Node.js event manager adapter using process events.
 * "Background" is the process about to end: a termination signal or an empty event loop.
 * Listening to a signal replaces Node's default termination, so listeners exist only while someone subscribed,
 * and the signal is re-raised after the callbacks unless the app listens to it too.
 */
class NodeEventManager implements IEventManager {
  private backgroundCallbacks: Array<() => void | Promise<void>> = [];
  private foregroundCallbacks: Array<() => void> = [];
  private stateChangeCallbacks: Array<(state: AppState) => void> = [];
  private signalHandlers = new Map<NodeJS.Signals, () => void>();
  private beforeExitHandler = () => { this.runBackground(); };

  private runBackground(): Promise<void[]> {
    this.stateChangeCallbacks.forEach(cb => cb('background'));
    return Promise.all(this.backgroundCallbacks.map(async cb => cb()));
  }

  private listen(): void {
    if (this.signalHandlers.size) return;
    for (const signal of EXIT_SIGNALS) {
      const handler = () => {
        const work = this.runBackground();
        if (process.listenerCount(signal) > 1) return;
        untilDoneOrTimeout(work).finally(() => {
          this.unlisten();
          process.kill(process.pid, signal);
        });
      };
      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
    process.on('beforeExit', this.beforeExitHandler);
  }

  private unlisten(): void {
    this.signalHandlers.forEach((handler, signal) => process.removeListener(signal, handler));
    this.signalHandlers.clear();
    process.removeListener('beforeExit', this.beforeExitHandler);
  }

  onBackground(callback: () => void | Promise<void>): () => void {
    this.backgroundCallbacks.push(callback);
    this.listen();
    return () => {
      const index = this.backgroundCallbacks.indexOf(callback);
      if (index > -1) {
        this.backgroundCallbacks.splice(index, 1);
      }
      if (!this.backgroundCallbacks.length) this.unlisten();
    };
  }

  onForeground(callback: () => void): () => void {
    // Node.js doesn't really have a "foreground" concept
    this.foregroundCallbacks.push(callback);
    return () => {
      const index = this.foregroundCallbacks.indexOf(callback);
      if (index > -1) {
        this.foregroundCallbacks.splice(index, 1);
      }
    };
  }

  onStateChange(callback: (state: AppState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  getCurrentState(): AppState {
    // Node.js is always "active" while running
    return 'active';
  }

  getOrientation(): string {
    // Not applicable for Node.js
    return 'unknown';
  }

  destroy(): void {
    this.unlisten();
    this.backgroundCallbacks = [];
    this.foregroundCallbacks = [];
    this.stateChangeCallbacks = [];
  }
}

export const eventManager = new NodeEventManager();
