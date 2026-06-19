/**
 * @fileoverview Value types for whole-file Git merge conflicts.
 */

/**
 * One conflicted file including Git conflict markers.
 */
export interface ConflictedFile {
  path: string
  markedContent: string
}

/**
 * Complete conflict context supplied to a resolver.
 */
export interface MergeConflict {
  taskId: string
  branch: string
  files: ConflictedFile[]
}
