/**
 * @fileoverview Isolated workspace types for CodeFleet task execution.
 */

/**
 * Storage mechanism backing an isolated task workspace.
 */
export type WorkspaceMode = 'worktree' | 'directory'

/**
 * Isolated working directory allocated to one task.
 */
export interface Workspace {
  readonly taskId: string
  /** Absolute path to the isolated working directory. */
  readonly dir: string
  readonly mode: WorkspaceMode
  /** Task branch in worktree mode. */
  readonly branch?: string
  /** Concrete comparison base in worktree mode. */
  readonly baseCommit?: string
}
