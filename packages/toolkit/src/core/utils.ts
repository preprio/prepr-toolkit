import { sharedState } from './shared-state';
import type { PreprEventType, ResolvedPreprFeatures } from './types';

export interface PreprEventData {
  readonly segment?: string;
  readonly variant?: string;
  readonly editMode?: boolean;
  /** Which toolkit features this site has enabled. Sent with `loaded`. */
  readonly features?: ResolvedPreprFeatures;
  readonly [key: string]:
    string | boolean | number | ResolvedPreprFeatures | undefined;
}

/** @internal Set by the iframe bridge once an editor origin is allowlisted. */
export function setTrustedParentOrigin(origin: string | null): void {
  sharedState().trustedParentOrigin = origin;
}

/** @internal The allowlisted editor origin, or `null` before the handshake. */
export function getTrustedParentOrigin(): string | null {
  return sharedState().trustedParentOrigin;
}

/**
 * Fans a Prepr event out to the current window and, if framed, the parent.
 *
 * Events are posted to the origin validated during the editor handshake.
 * Before the handshake completes there is no trusted parent, so only the
 * payload-free `loaded` ping may go out — it opts in explicitly via
 * `allowUntrustedTarget`. Everything else carries content data (segment /
 * variant / field-edit details, including internal CMS entry ids) and is
 * dropped rather than broadcast to an arbitrary framing page.
 */
export function sendPreprEvent(
  event: PreprEventType,
  data?: PreprEventData,
  options?: { allowUntrustedTarget?: boolean },
): void {
  if (typeof window !== 'undefined') {
    const message = {
      name: 'prepr_preview_bar',
      event,
      ...data,
    };

    window.dispatchEvent(
      new CustomEvent('prepr_preview_bar', { detail: message }),
    );

    // The same-window CustomEvent above always fires — in-page listeners are
    // not a cross-origin surface. Only the postMessage hop is gated.
    if (window.parent && window.parent !== window) {
      const trustedParentOrigin = getTrustedParentOrigin();
      if (trustedParentOrigin) {
        window.parent.postMessage(message, trustedParentOrigin);
      } else if (options?.allowUntrustedTarget) {
        window.parent.postMessage(message, '*');
      }
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

  // A local `enabled` wins; otherwise defer to the shared flag so scoped
  // loggers created before initDebugLogger() still pick up the setting.
  private isEnabled(): boolean {
    if (this.options.enabled !== undefined) {
      return this.options.enabled;
    }

    return sharedState().debugEnabled ?? false;
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
}

export function initDebugLogger(enabled: boolean = false): void {
  sharedState().debugEnabled = enabled;
}

export function createScopedLogger(scopeName: string): DebugLogger {
  // No local `enabled`, so it reads the global state on every call.
  return new DebugLogger({
    prefix: `[Prepr][${scopeName}]`,
  });
}
