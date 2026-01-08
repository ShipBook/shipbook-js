/**
 * Storage interface for platform-specific key-value storage implementations.
 * 
 * Implementations:
 * - React Native: AsyncStorage
 * - Browser: localStorage
 * - Node.js: File system with memory fallback
 */
export interface IStorage {
  /**
   * Get a string value by key
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Set a string value by key
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Remove a value by key
   */
  removeItem(key: string): Promise<void>;

  /**
   * Get an object value by key (JSON parsed)
   */
  getObj<T = object>(key: string): Promise<T | undefined>;

  /**
   * Set an object value by key (JSON stringified)
   */
  setObj(key: string, value: object): Promise<void>;

  /**
   * Push one or more objects to an array stored at key
   */
  pushArrayObj(key: string, value: object | object[]): Promise<void>;

  /**
   * Pop and return all objects from an array stored at key
   * This also clears the array
   */
  popAllArrayObj(key: string): Promise<object[]>;

  /**
   * Get the size of an array stored at key
   */
  arraySize(key: string): Promise<number>;
}
