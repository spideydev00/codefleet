/**
 * @fileoverview Public options and internal state for Forge plan execution.
 */

import type { CheckRunner } from './checks.js'
import type { ConflictResolver } from '../merge/conflict-resolver.js'
import type { MergeReportEntry, TaskReportEntry } from '../report-types.js'
import type { Worker } from '../worker.js'

/**
 * Configuration for one deterministic plan execution.
 */
export interface RunPlanOptions {
  repoRoot: string
  userPrompt: string
  worker: Worker
  runId?: string
  baseRef?: string
  maxParallel?: number
  resolver?: ConflictResolver
  checks?: CheckRunner
  committer?: { name: string; email: string }
  keepWorkspaces?: boolean
  taskTimeoutMs?: number
  abortSignal?: AbortSignal
}

/**
 * Mutable scheduler state for one task.
 */
export interface EngineTaskState {
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
  task?: TaskReportEntry
  merge?: MergeReportEntry
}
