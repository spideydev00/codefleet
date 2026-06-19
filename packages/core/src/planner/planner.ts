/**
 * @fileoverview Repository inspection and Claude-backed task planning.
 */

import {
  runClaude,
  type ClaudeCliOptions,
} from '../claude/claude-cli.js'
import { CodeFleetValidationError } from '../errors.js'
import {
  parseTasksPlan,
  type TasksPlan,
} from '../tasks-schema.js'
import { extractTrailingJson } from '../worker-result.js'
import { buildPlanningPrompt } from './prompt.js'
import {
  inspectRepo,
  type RepoInspectorOptions,
} from './repo-inspector.js'

/**
 * Options for producing one validated task plan.
 */
export interface PlanTasksOptions {
  readonly repoRoot: string
  readonly userPrompt: string
  readonly claude?: ClaudeCliOptions
  readonly inspect?: RepoInspectorOptions
}

/**
 * Inspects a repository and returns a validated Claude-generated task DAG.
 */
export async function planTasks(
  options: PlanTasksOptions,
): Promise<TasksPlan> {
  const snapshot = await inspectRepo(options.repoRoot, options.inspect)
  const result = await runClaude(
    buildPlanningPrompt(options.userPrompt, snapshot),
    {
      cwd: options.repoRoot,
      ...options.claude,
    },
  )

  if (
    result.exitCode !== 0
    || result.timedOut
    || options.claude?.abortSignal?.aborted
  ) {
    const detail = result.stderr.trim() || (
      result.timedOut ? 'Claude planning timed out' : 'Claude planning process failed'
    )
    throw new CodeFleetValidationError(`Unable to produce TasksPlan: ${detail}`)
  }

  const extracted = extractTrailingJson(result.stdout)
  if (extracted === undefined) {
    throw new CodeFleetValidationError(
      'Unable to produce TasksPlan: no JSON plan found in Claude output',
    )
  }

  try {
    return parseTasksPlan(extracted)
  } catch (error) {
    if (error instanceof CodeFleetValidationError) {
      throw new CodeFleetValidationError(
        `Unable to produce TasksPlan: ${error.message}`,
      )
    }
    throw error
  }
}
