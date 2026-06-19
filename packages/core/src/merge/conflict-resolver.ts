/**
 * @fileoverview Injectable merge-conflict resolution port.
 */

import type { ConflictResolution } from '../resolution-schema.js'
import type { MergeConflict } from './conflict.js'

/**
 * Resolves a complete set of conflicted files.
 */
export interface ConflictResolver {
  resolve(conflict: MergeConflict): Promise<ConflictResolution | undefined>
}

/**
 * Declines every conflict for deterministic fail-safe behavior.
 */
export class NoopConflictResolver implements ConflictResolver {
  async resolve(
    _conflict: MergeConflict,
  ): Promise<ConflictResolution | undefined> {
    return undefined
  }
}
