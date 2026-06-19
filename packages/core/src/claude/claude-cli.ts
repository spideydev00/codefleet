/**
 * @fileoverview Non-shell wrapper for one-shot Claude CLI prompts.
 */

import {
  runProcess,
  type ProcessResult,
} from '../worker/process.js'

/**
 * Options for invoking `claude -p`.
 */
export interface ClaudeCliOptions {
  readonly command?: string
  readonly baseArgs?: string[]
  readonly env?: NodeJS.ProcessEnv
  readonly passPromptVia?: 'arg' | 'stdin'
  readonly timeoutMs?: number
  readonly abortSignal?: AbortSignal
  readonly cwd?: string
}

/**
 * Runs one Claude prompt without throwing.
 */
export async function runClaude(
  prompt: string,
  options: ClaudeCliOptions = {},
): Promise<ProcessResult> {
  try {
    const baseArgs = options.baseArgs ?? ['-p']
    const passPromptVia = options.passPromptVia ?? 'stdin'
    return await runProcess({
      command: options.command ?? 'claude',
      args: passPromptVia === 'arg' ? [...baseArgs, prompt] : baseArgs,
      cwd: options.cwd ?? process.cwd(),
      env: options.env ? { ...process.env, ...options.env } : undefined,
      input: passPromptVia === 'stdin' ? prompt : undefined,
      timeoutMs: options.timeoutMs,
      abortSignal: options.abortSignal,
    })
  } catch (error) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: null,
      timedOut: false,
      durationMs: 0,
    }
  }
}
