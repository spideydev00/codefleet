/**
 * @fileoverview Guaranteed best-effort teardown for CodeFleet resources.
 */

/**
 * Minimal resource contract accepted by guaranteed cleanup.
 */
export interface Cleanable {
  cleanupAll(): Promise<void>
}

/**
 * Debug options for guaranteed cleanup.
 */
export interface GuaranteedCleanupOptions {
  /** Preserves resources when explicitly enabled for debugging. */
  keep?: boolean
}

/**
 * Runs an async operation and guarantees best-effort cleanup afterward.
 *
 * Cleanup failures are swallowed so they never replace the operation result
 * or mask the operation's original error.
 */
export async function withGuaranteedCleanup<T>(
  target: Cleanable,
  fn: () => Promise<T>,
  options?: GuaranteedCleanupOptions,
): Promise<T> {
  try {
    return await fn()
  } finally {
    if (!options?.keep) {
      try {
        await target.cleanupAll()
      } catch {
        // Cleanup is a safety net and must never alter the operation outcome.
      }
    }
  }
}
