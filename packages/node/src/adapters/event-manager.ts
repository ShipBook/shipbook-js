import type { IEventManager, AppState } from '@shipbook/core';

/**
 * Node.js event manager adapter using process events
 */
class NodeEventManager implements IEventManager {
  private backgroundCallbacks: Array<() => void> = [];
  private foregroundCallbacks: Array<() => void> = [];
  private stateChangeCallbacks: Array<(state: AppState) => void> = [];
  private exitHandler?: () => void;
  private sigintHandler?: () => void;
  private sigtermHandler?: () => void;

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    // Handle process exit (treat as background/shutdown)
    this.exitHandler = () => {
      this.stateChangeCallbacks.forEach(cb => cb('background'));
      this.backgroundCallbacks.forEach(cb => cb());
    };

    // Handle SIGINT (Ctrl+C)
    this.sigintHandler = () => {
      this.stateChangeCallbacks.forEach(cb => cb('background'));
      this.backgroundCallbacks.forEach(cb => cb());
    };

    // Handle SIGTERM
    this.sigtermHandler = () => {
      this.stateChangeCallbacks.forEach(cb => cb('background'));
      this.backgroundCallbacks.forEach(cb => cb());
    };

    process.on('exit', this.exitHandler);
    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);

    // Handle beforeExit for graceful shutdown
    process.on('beforeExit', () => {
      this.backgroundCallbacks.forEach(cb => cb());
    });
  }

  onBackground(callback: () => void): () => void {
    this.backgroundCallbacks.push(callback);
    return () => {
      const index = this.backgroundCallbacks.indexOf(callback);
      if (index > -1) {
        this.backgroundCallbacks.splice(index, 1);
      }
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
    if (this.exitHandler) {
      process.removeListener('exit', this.exitHandler);
    }
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
    }
    if (this.sigtermHandler) {
      process.removeListener('SIGTERM', this.sigtermHandler);
    }

    this.backgroundCallbacks = [];
    this.foregroundCallbacks = [];
    this.stateChangeCallbacks = [];
  }
}

export const eventManager = new NodeEventManager();
