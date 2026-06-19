/**
 * @fileoverview Foundation contract for CodeFleet workers.
 */

import type { TaskBrief } from './task-brief.js'
import type { WorkerKind } from './worker-kind.js'
import type { WorkerRunRecord } from './worker-result.js'

/**
 * Runner-owned context supplied for one worker execution.
 */
export interface WorkerContext {
  /** Absolute path to the isolated workspace. */
  readonly workspaceDir: string
  readonly runId: string
  readonly taskId: string
  readonly abortSignal?: AbortSignal
  readonly timeoutMs?: number
}

/**
 * Executes task briefs in prepared workspaces.
 */
export interface Worker {
  readonly kind: WorkerKind

  /**
   * Executes one brief and returns the full execution record.
   *
   * Implementations must not throw. All failures are encoded in the returned
   * {@link WorkerRunRecord}.
   */
  run(brief: TaskBrief, ctx: WorkerContext): Promise<WorkerRunRecord>

  /** Checks whether the worker is available for execution. */
  healthcheck?(): Promise<boolean>
}
