import type { IEventManager, AppState } from '@shipbook/core';

/**
 * Browser event manager adapter using Page Visibility API
 */
class BrowserEventManager implements IEventManager {
  private backgroundCallbacks: Array<() => void> = [];
  private foregroundCallbacks: Array<() => void> = [];
  private stateChangeCallbacks: Array<(state: AppState) => void> = [];
  private visibilityHandler?: () => void;
  private beforeUnloadHandler?: () => void;

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    // Visibility change handler
    this.visibilityHandler = () => {
      const isVisible = document.visibilityState === 'visible';
      const state: AppState = isVisible ? 'active' : 'background';
      
      this.stateChangeCallbacks.forEach(cb => cb(state));

      if (isVisible) {
        this.foregroundCallbacks.forEach(cb => cb());
      } else {
        this.backgroundCallbacks.forEach(cb => cb());
      }
    };

    // Before unload handler (treat as background)
    this.beforeUnloadHandler = () => {
      this.backgroundCallbacks.forEach(cb => cb());
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
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
    return document.visibilityState === 'visible' ? 'active' : 'background';
  }

  getOrientation(): string {
    if (typeof screen !== 'undefined' && screen.orientation) {
      return screen.orientation.type.includes('portrait') ? 'portrait' : 'landscape';
    }
    return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
  }

  destroy(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    
    this.backgroundCallbacks = [];
    this.foregroundCallbacks = [];
    this.stateChangeCallbacks = [];
  }
}

export const eventManager = new BrowserEventManager();
