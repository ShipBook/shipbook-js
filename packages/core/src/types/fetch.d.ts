/**
 * Minimal fetch API type definitions for platform-agnostic core.
 * These types are available at runtime in all target platforms:
 * - Browser (native)
 * - Node.js 18+ (native)
 * - React Native (polyfilled)
 */

declare global {
  interface HeadersInit {
    [key: string]: string;
  }

  interface Headers {
    append(name: string, value: string): void;
    delete(name: string): void;
    get(name: string): string | null;
    has(name: string): boolean;
    set(name: string, value: string): void;
    forEach(callback: (value: string, name: string, parent: Headers) => void): void;
  }

  interface HeadersConstructor {
    new(init?: HeadersInit | Record<string, string>): Headers;
  }

  declare var Headers: HeadersConstructor;

  interface RequestInit {
    method?: string;
    headers?: Headers | Record<string, string>;
    body?: string | null;
    mode?: 'cors' | 'no-cors' | 'same-origin';
    credentials?: 'omit' | 'same-origin' | 'include';
    cache?: 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache' | 'only-if-cached';
    redirect?: 'follow' | 'error' | 'manual';
    signal?: AbortSignal;
  }

  interface Response {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    readonly headers: Headers;
    readonly url: string;
    json(): Promise<unknown>;
    text(): Promise<string>;
    blob(): Promise<Blob>;
    arrayBuffer(): Promise<ArrayBuffer>;
    clone(): Response;
  }

  interface Blob {
    readonly size: number;
    readonly type: string;
    slice(start?: number, end?: number, contentType?: string): Blob;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }

  interface AbortSignal {
    readonly aborted: boolean;
    onabort: ((this: AbortSignal, ev: Event) => void) | null;
  }

  function fetch(input: string, init?: RequestInit): Promise<Response>;
}

export {};
