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
import { getOrchestratorPreset } from '../providers/presets.js'
import { resolveEnv, type OrchestratorProvider } from '../providers/provider.js'
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
  readonly orchestrator?: string | OrchestratorProvider
  readonly inspect?: RepoInspectorOptions
}

/**
 * Inspects a repository and returns a validated Claude-generated task DAG.
 */
export async function planTasks(
  options: PlanTasksOptions,
): Promise<TasksPlan> {
  const snapshot = await inspectRepo(options.repoRoot, options.inspect)
  
  const provider = typeof options.orchestrator === 'string'
    ? getOrchestratorPreset(options.orchestrator)
    : options.orchestrator ?? getOrchestratorPreset('claude')
    
  const env = await resolveEnv(provider)
  const prompt = buildPlanningPrompt(options.userPrompt, snapshot)
  const result = await runClaude(
    prompt,
    {
      cwd: options.repoRoot,
      command: provider.command,
      baseArgs: provider.passPromptVia === 'arg' ? [...provider.baseArgs, prompt] : provider.baseArgs,
      env,
      
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
