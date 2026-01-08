/**
 * Event manager interface for app lifecycle events.
 * 
 * Implementations:
 * - React Native: AppState events
 * - Browser: visibilitychange, beforeunload
 * - Node.js: process.on('exit'), SIGINT, SIGTERM
 */
export interface IEventManager {
  /**
   * Subscribe to app entering background state
   * @param callback Function to call when app enters background
   * @returns Unsubscribe function
   */
  onBackground(callback: () => void): () => void;

  /**
   * Subscribe to app entering foreground state
   * @param callback Function to call when app enters foreground
   * @returns Unsubscribe function
   */
  onForeground(callback: () => void): () => void;

  /**
   * Subscribe to app state changes
   * @param callback Function to call with new state
   * @returns Unsubscribe function
   */
  onStateChange?(callback: (state: AppState) => void): () => void;

  /**
   * Get current app state
   */
  getCurrentState?(): AppState;

  /**
   * Get current orientation
   */
  getOrientation?(): string;

  /**
   * Clean up all subscriptions
   */
  destroy(): void;
}

/**
 * Application state enum
 */
export type AppState = 'active' | 'background' | 'inactive' | 'unknown';
