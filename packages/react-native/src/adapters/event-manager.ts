import { AppState, AppStateStatus, NativeEventSubscription, Dimensions } from 'react-native';
import type { IEventManager, AppState as CoreAppState } from '@shipbook/core';

/**
 * React Native event manager adapter
 */
class ReactNativeEventManager implements IEventManager {
  private backgroundCallbacks: Array<() => void> = [];
  private foregroundCallbacks: Array<() => void> = [];
  private stateChangeCallbacks: Array<(state: CoreAppState) => void> = [];
  private subscription?: NativeEventSubscription;
  private lastState: AppStateStatus = AppState.currentState;

  constructor() {
    this.setupListener();
  }

  private setupListener(): void {
    if (this.subscription) return;

    const handler = (nextState: AppStateStatus) => {
      const prevState = this.lastState;
      this.lastState = nextState;

      // Notify state change callbacks
      const coreState = this.mapToCoreState(nextState);
      this.stateChangeCallbacks.forEach(cb => cb(coreState));

      // Handle background transition
      if (prevState === 'active' && nextState !== 'active') {
        this.backgroundCallbacks.forEach(cb => cb());
      }

      // Handle foreground transition
      if (prevState !== 'active' && nextState === 'active') {
        this.foregroundCallbacks.forEach(cb => cb());
      }
    };

    this.subscription = AppState.addEventListener('change', handler);
  }

  private mapToCoreState(state: AppStateStatus): CoreAppState {
    switch (state) {
      case 'active':
        return 'active';
      case 'background':
        return 'background';
      case 'inactive':
        return 'inactive';
      default:
        return 'unknown';
    }
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

  onStateChange(callback: (state: CoreAppState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  getCurrentState(): CoreAppState {
    return this.mapToCoreState(AppState.currentState);
  }

  getOrientation(): string {
    const dim = Dimensions.get('screen');
    return dim.height >= dim.width ? 'portrait' : 'landscape';
  }

  destroy(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = undefined;
    }
    this.backgroundCallbacks = [];
    this.foregroundCallbacks = [];
    this.stateChangeCallbacks = [];
  }
}

export const eventManager = new ReactNativeEventManager();
