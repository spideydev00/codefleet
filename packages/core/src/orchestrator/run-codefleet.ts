/**
 * @fileoverview End-to-end CodeFleet planning, execution, and rendering.
 */

import {
  ClaudeConflictResolver,
} from '../claude/conflict-resolver.js'
import type { ClaudeCliOptions } from '../claude/claude-cli.js'
import type { CheckRunner } from '../engine/checks.js'
import { runPlan } from '../engine/engine.js'
import type { ConflictResolver } from '../merge/conflict-resolver.js'
import {
  planTasks,
  type PlanTasksOptions,
} from '../planner/planner.js'
import type { CodeFleetReport } from '../report-types.js'
import { renderReport } from '../report/render.js'
import type { TasksPlan } from '../tasks-schema.js'
import type { Worker } from '../worker.js'
import {
  CodexWorker,
  type CodexWorkerOptions,
} from '../worker/codex-worker.js'

/**
 * Options for one complete CodeFleet run.
 */
export interface RunCodeFleetOptions {
  repoRoot: string
  userPrompt: string
  baseRef?: string
  maxParallel?: number
  keepWorkspaces?: boolean
  taskTimeoutMs?: number
  abortSignal?: AbortSignal
  committer?: { name: string; email: string }
  claude?: ClaudeCliOptions
  codex?: CodexWorkerOptions
  inspect?: PlanTasksOptions['inspect']
  checks?: CheckRunner
  planTasksFn?: (options: PlanTasksOptions) => Promise<TasksPlan>
  worker?: Worker
  resolver?: ConflictResolver
}

/**
 * Plans, executes, integrates, and renders one repository request.
 */
export async function runCodeFleet(
  options: RunCodeFleetOptions,
): Promise<{ report: CodeFleetReport; rendered: string }> {
  const createPlan = options.planTasksFn ?? planTasks
  const plan = await createPlan({
    repoRoot: options.repoRoot,
    userPrompt: options.userPrompt,
    claude: options.claude,
    inspect: options.inspect,
  })
  const worker = options.worker ?? new CodexWorker(options.codex)
  const resolver = options.resolver ?? new ClaudeConflictResolver(options.claude)
  const report = await runPlan(plan, {
    repoRoot: options.repoRoot,
    userPrompt: options.userPrompt,
    worker,
    resolver,
    checks: options.checks,
    baseRef: options.baseRef,
    maxParallel: options.maxParallel,
    keepWorkspaces: options.keepWorkspaces,
    taskTimeoutMs: options.taskTimeoutMs,
    abortSignal: options.abortSignal,
    committer: options.committer,
  })

  return { report, rendered: renderReport(report) }
}
