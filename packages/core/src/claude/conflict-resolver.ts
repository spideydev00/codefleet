/**
 * @fileoverview Claude CLI implementation of merge-conflict resolution.
 */

import type {
  ConflictResolver,
} from '../merge/conflict-resolver.js'
import type { MergeConflict } from '../merge/conflict.js'
import {
  parseConflictResolution,
  type ConflictResolution,
} from '../resolution-schema.js'
import {
  runClaude,
  type ClaudeCliOptions,
} from './claude-cli.js'
import { getOrchestratorPreset } from '../providers/presets.js'
import { resolveEnv, type OrchestratorProvider } from '../providers/provider.js'

function buildConflictPrompt(conflict: MergeConflict): string {
  const files = conflict.files
    .map(file => [
      `Path: ${file.path}`,
      '```text',
      file.markedContent,
      '```',
    ].join('\n'))
    .join('\n\n')

  return [
    'Resolve the following Git merge conflict using the complete marked file contents.',
    `Task ID: ${conflict.taskId}`,
    `Branch: ${conflict.branch}`,
    '',
    files,
    '',
    'Return only one fenced ```json block matching this ConflictResolution shape:',
    '```json',
    JSON.stringify({
      files: [{ path: 'conflicted/path', resolvedContent: 'complete resolved file content' }],
      rationale: 'Brief explanation of the resolution',
      unresolved: [],
    }, null, 2),
    '```',
    'Every fully resolved conflicted path must appear once in files.',
    'Put any path you cannot safely resolve in unresolved.',
  ].join('\n')
}

/**
 * Resolves whole-file conflicts through `claude -p`.
 */
export class ClaudeConflictResolver implements ConflictResolver {
  constructor(
    private readonly options: ClaudeCliOptions = {},
    private readonly provider: OrchestratorProvider = getOrchestratorPreset('claude')
  ) {}

  async resolve(
    conflict: MergeConflict,
  ): Promise<ConflictResolution | undefined> {
    try {
      const prompt = buildConflictPrompt(conflict)
      const env = await resolveEnv(this.provider)
      const result = await runClaude(
        prompt,
        {
          command: this.provider.command,
          baseArgs: this.provider.passPromptVia === 'arg' ? [...this.provider.baseArgs, prompt] : this.provider.baseArgs,
          env: env ? { ...process.env, ...env } : undefined,
          
          ...this.options,
        }
      )
      if (
        result.exitCode !== 0
        || result.timedOut
        || this.options.abortSignal?.aborted
      ) {
        return undefined
      }
      return parseConflictResolution(result.stdout).resolution
    } catch {
      return undefined
    }
  }
}
