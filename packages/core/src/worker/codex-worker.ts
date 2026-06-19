/**
 * @fileoverview Codex CLI implementation of the CodeFleet worker contract.
 */

import type { TaskBrief } from '../task-brief.js'
import type { Worker, WorkerContext } from '../worker.js'
import {
  parseWorkerResult,
  synthesizeFailureResult,
  type WorkerRunRecord,
} from '../worker-result.js'
import { redactSensitiveText } from '../utils/redaction.js'
import { buildWorkerPrompt } from './prompt.js'
import { runProcess } from './process.js'
import { getWorkerPreset } from '../providers/presets.js'
import { resolveEnv, type WorkerProvider } from '../providers/provider.js'

const HEALTHCHECK_TIMEOUT_MS = 3_000

/**
 * Configures Codex CLI invocation.
 */
export interface CodexWorkerOptions {
  readonly command?: string
  readonly baseArgs?: string[]
  readonly env?: NodeJS.ProcessEnv
  readonly passPromptVia?: 'arg' | 'stdin'
  readonly provider?: string | WorkerProvider
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
  private readonly provider?: string | WorkerProvider

  constructor(options: CodexWorkerOptions = {}) {
    
    let command = options.command ?? 'codex'
    let baseArgs = options.baseArgs ?? ['exec']
    let passPromptVia = options.passPromptVia ?? 'arg'
    
    if (options.provider) {
      const provider = typeof options.provider === 'string'
        ? getWorkerPreset(options.provider)
        : options.provider
      command = provider.command
      baseArgs = provider.baseArgs
      passPromptVia = provider.passPromptVia
    } else if (!options.command && !options.baseArgs && !options.passPromptVia) {
      const provider = getWorkerPreset('codex')
      command = provider.command
      baseArgs = provider.baseArgs
      passPromptVia = provider.passPromptVia
    }

    this.command = command
    this.baseArgs = baseArgs
    this.env = options.env
    this.passPromptVia = passPromptVia
    this.provider = options.provider
  }

  async run(brief: TaskBrief, ctx: WorkerContext): Promise<WorkerRunRecord> {
    try {
      const prompt = buildWorkerPrompt(brief)
      const processResult = await runProcess({
        command: this.command,
        args: this.passPromptVia === 'arg' ? [...this.baseArgs, prompt] : this.baseArgs,
        cwd: ctx.workspaceDir,
        env: this.env ? { ...process.env, ...this.env } : (this.provider ? await resolveEnv(typeof this.provider === 'string' ? getWorkerPreset(this.provider) : this.provider) : undefined),
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
        stdout: redactSensitiveText(processResult.stdout),
        stderr: redactSensitiveText(processResult.stderr),
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
