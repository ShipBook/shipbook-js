interface QueueItem {
  action: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Auto-queue for sequential async operations
 * Ensures operations are executed one at a time in order
 */
export class AutoQueue {
  private _items: QueueItem[] = [];
  private _pendingPromise = false;

  enqueue<T>(action: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this._items.push({
        action,
        resolve: resolve as (value: unknown) => void,
        reject
      });
      this.dequeue();
    });
  }

  private async dequeue(): Promise<boolean> {
    if (this._pendingPromise) return false;

    const item = this._items.shift();

    if (!item) return false;

    try {
      this._pendingPromise = true;

      const payload = await item.action();

      this._pendingPromise = false;
      item.resolve(payload);
    } catch (e) {
      this._pendingPromise = false;
      item.reject(e);
    } finally {
      this.dequeue();
    }

    return true;
  }

  get size(): number {
    return this._items.length;
  }
}
