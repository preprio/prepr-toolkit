const resets = new Set<() => void>();

/**
 * Registers how to drop a module's singleton state. The live preview keeps one
 * store and bridge per page; tests start every case from a clean page.
 */
export function onTestReset(reset: () => void): void {
  resets.add(reset);
}

/** Drops the state of every module that registered a reset. Tests only. */
export function resetForTests(): void {
  resets.forEach((reset) => reset());
}
