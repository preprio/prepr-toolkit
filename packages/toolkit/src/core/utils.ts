import type { PreprEventType } from './types';

export interface PreprEventData {
  readonly segment?: string;
  readonly variant?: string;
  readonly editMode?: boolean;
  readonly [key: string]: string | boolean | number | undefined;
}

/** Fans a Prepr event out to the current window and, if framed, the parent. */
export function sendPreprEvent(
  event: PreprEventType,
  data?: PreprEventData
): void {
  if (typeof window !== 'undefined') {
    const message = {
      name: 'prepr_preview_bar',
      event,
      ...data,
    };

    window.dispatchEvent(
      new CustomEvent('prepr_preview_bar', { detail: message })
    );

    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  }
}

export type DebugArg = string | number | boolean | null | undefined | object;

interface DebugOptions {
  enabled?: boolean;
  prefix?: string;
}

class DebugLogger {
  private options: DebugOptions;

  constructor(options: DebugOptions) {
    this.options = {
      prefix: '[Prepr]',
      ...options,
    };
  }

  // A local `enabled` wins; otherwise defer to the global logger so scoped
  // loggers created before initDebugLogger() still pick up the setting.
  private isEnabled(): boolean {
    if (this.options.enabled !== undefined) {
      return this.options.enabled;
    }

    return globalDebugLogger?.options?.enabled ?? false;
  }

  log(message: string, ...args: DebugArg[]): void {
    if (!this.isEnabled()) return;

    const prefix = this.options.prefix;
    console.log(`${prefix} ${message}`, ...args);
  }

  warn(message: string, ...args: DebugArg[]): void {
    if (!this.isEnabled()) return;

    const prefix = this.options.prefix;
    console.warn(`${prefix} ${message}`, ...args);
  }

  error(message: string, ...args: DebugArg[]): void {
    if (!this.isEnabled()) return;

    const prefix = this.options.prefix;
    console.error(`${prefix} ${message}`, ...args);
  }
}

let globalDebugLogger: DebugLogger | null = null;

export function initDebugLogger(enabled: boolean = false): void {
  globalDebugLogger = new DebugLogger({ enabled });
}

export function createScopedLogger(scopeName: string): DebugLogger {
  // No local `enabled`, so it reads the global state on every call.
  return new DebugLogger({
    prefix: `[Prepr][${scopeName}]`,
  });
}

export interface ThrottledFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel(): void;
}

/** Leading-edge throttle; trailing call is scheduled for the remaining delay. */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ThrottledFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecTime = 0;

  const throttledFunc = ((...args: Parameters<T>) => {
    const currentTime = Date.now();
    const timeSinceLastExec = currentTime - lastExecTime;

    if (timeSinceLastExec >= delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        func(...args);
        lastExecTime = Date.now();
        timeoutId = null;
      }, delay - timeSinceLastExec);
    }
  }) as ThrottledFunction<T>;

  throttledFunc.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttledFunc;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ThrottledFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debouncedFunc = ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  }) as ThrottledFunction<T>;

  debouncedFunc.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debouncedFunc;
}

// TTL cache over querySelectorAll, for hot paths that re-query the same nodes.
export function createElementCache<T extends Element = Element>(
  query: string,
  ttl: number = 1000
) {
  let cache: NodeListOf<T> | null = null;
  let lastCacheTime = 0;
  return () => {
    const now = Date.now();
    if (!cache || now - lastCacheTime > ttl) {
      cache = document.querySelectorAll<T>(query);
      lastCacheTime = now;
    }
    return cache;
  };
}
