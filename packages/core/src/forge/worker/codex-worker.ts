/**
 * @fileoverview Codex CLI implementation of the Forge worker contract.
 */

import type { TaskBrief } from '../task-brief.js'
import type { Worker, WorkerContext } from '../worker.js'
import {
  parseWorkerResult,
  synthesizeFailureResult,
  type WorkerRunRecord,
} from '../worker-result.js'
import { buildWorkerPrompt } from './prompt.js'
import { runProcess } from './process.js'

const HEALTHCHECK_TIMEOUT_MS = 3_000

/**
 * Configures Codex CLI invocation.
 */
export interface CodexWorkerOptions {
  readonly command?: string
  readonly baseArgs?: string[]
  readonly env?: NodeJS.ProcessEnv
  readonly passPromptVia?: 'arg' | 'stdin'
}

/**
 * Executes task briefs through `codex exec`.
 */
export class CodexWorker implements Worker {
  readonly kind = 'codex' as const

  private readonly command: string
  private readonly baseArgs: string[]
  private readonly env?: NodeJS.ProcessEnv
  private readonly passPromptVia: 'arg' | 'stdin'

  constructor(options: CodexWorkerOptions = {}) {
    this.command = options.command ?? 'codex'
    this.baseArgs = options.baseArgs ?? ['exec']
    this.env = options.env
    this.passPromptVia = options.passPromptVia ?? 'arg'
  }

  async run(brief: TaskBrief, ctx: WorkerContext): Promise<WorkerRunRecord> {
    try {
      const prompt = buildWorkerPrompt(brief)
      const processResult = await runProcess({
        command: this.command,
        args: this.passPromptVia === 'arg' ? [...this.baseArgs, prompt] : this.baseArgs,
        cwd: ctx.workspaceDir,
        env: this.env ? { ...process.env, ...this.env } : undefined,
        input: this.passPromptVia === 'stdin' ? prompt : undefined,
        timeoutMs: ctx.timeoutMs,
        abortSignal: ctx.abortSignal,
      })

      let parsed = parseWorkerResult(ctx.taskId, processResult.stdout)
      const processFailure = processResult.timedOut
        ? `Process timed out after ${ctx.timeoutMs}ms`
        : ctx.abortSignal?.aborted
          ? 'Process aborted'
          : processResult.exitCode === null
            ? processResult.stderr.trim() || 'Process failed to start'
            : undefined

      if (processFailure) {
        parsed = {
          result: synthesizeFailureResult(ctx.taskId, processFailure),
          parseError: processFailure,
        }
      }

      return {
        taskId: ctx.taskId,
        worker: this.kind,
        result: parsed.result,
        changedFiles: [],
        diff: '',
        exitCode: processResult.exitCode,
        durationMs: processResult.durationMs,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        parseError: parsed.parseError,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return {
        taskId: ctx.taskId,
        worker: this.kind,
        result: synthesizeFailureResult(ctx.taskId, reason),
        changedFiles: [],
        diff: '',
        exitCode: null,
        durationMs: 0,
        stdout: '',
        stderr: reason,
        parseError: reason,
      }
    }
  }

  async healthcheck(): Promise<boolean> {
    const result = await runProcess({
      command: this.command,
      args: ['--version'],
      cwd: process.cwd(),
      env: this.env ? { ...process.env, ...this.env } : undefined,
      timeoutMs: HEALTHCHECK_TIMEOUT_MS,
    })
    return result.exitCode === 0 && !result.timedOut
  }
}
