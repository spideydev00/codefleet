/**
 * @fileoverview Type-only foundation for CodeFleet run reports.
 */

import type { PlannedTask } from './tasks-schema.js'
import type { WorkerRunRecord } from './worker-result.js'

/**
 * Final execution state of a planned task.
 */
export type TaskOutcome = 'succeeded' | 'failed' | 'skipped'

/**
 * Final integration state of a task change.
 */
export type MergeOutcome =
  | 'merged'
  | 'conflict-resolved'
  | 'merge-aborted'
  | 'not-merged'

/**
 * Report entry for one planned task.
 */
export interface TaskReportEntry {
  taskId: string
  title: string
  outcome: TaskOutcome
  record?: WorkerRunRecord
  skippedReason?: string
}

/**
 * Report entry for one task integration attempt.
 */
export interface MergeReportEntry {
  taskId: string
  outcome: MergeOutcome
  conflictFiles?: string[]
  resolutionRationale?: string
  note?: string
}

/**
 * Complete English-language report model for a CodeFleet run.
 */
export interface CodeFleetReport {
  runId: string
  userPrompt: string
  plan: PlannedTask[]
  tasks: TaskReportEntry[]
  merges: MergeReportEntry[]
  totals: {
    tasks: number
    succeeded: number
    failed: number
    skipped: number
    merged: number
    conflictsResolved: number
    durationMs: number
  }
  status: 'success' | 'partial' | 'failed'
}
