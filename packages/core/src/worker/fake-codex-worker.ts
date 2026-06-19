/**
 * @fileoverview Deterministic in-process CodeFleet worker for engine tests.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { TaskBrief } from '../task-brief.js'
import type { Worker, WorkerContext } from '../worker.js'
import {
  synthesizeFailureResult,
  type WorkerResult,
  type WorkerRunRecord,
} from '../worker-result.js'

/**
 * One file written by a fake worker run.
 */
export interface FakeCodexFile {
  readonly path: string
  readonly content: string
}

/**
 * Programmable outcome for a fake worker run.
 */
export interface FakeCodexResponse {
  readonly files?: readonly FakeCodexFile[]
  readonly result?: Partial<WorkerResult>
  readonly stdout?: string
  readonly exitCode?: number
  readonly delayMs?: number
}

/**
 * Supplies the deterministic behavior for one fake worker run.
 */
export type FakeCodexHandler = (
  brief: TaskBrief,
  ctx: WorkerContext,
) => FakeCodexResponse | Promise<FakeCodexResponse>

/**
 * Executes programmable worker behavior without starting an external process.
 */
export class FakeCodexWorker implements Worker {
  readonly kind = 'fake-codex' as const

  constructor(private readonly handler: FakeCodexHandler = () => ({})) {}

  async run(brief: TaskBrief, ctx: WorkerContext): Promise<WorkerRunRecord> {
    const startedAt = Date.now()
    let response: FakeCodexResponse | undefined

    try {
      const configuredResponse = await this.handler(brief, ctx)
      response = configuredResponse
      const workspaceRoot = resolve(ctx.workspaceDir)

      for (const file of configuredResponse.files ?? []) {
        const destination = resolve(workspaceRoot, file.path)
        const pathFromRoot = relative(workspaceRoot, destination)
        if (pathFromRoot === '..' || pathFromRoot.startsWith('../') || isAbsolute(pathFromRoot)) {
          throw new Error(`Fake worker file escapes workspace: ${file.path}`)
        }
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, file.content, 'utf8')
      }

      if (configuredResponse.delayMs !== undefined && configuredResponse.delayMs > 0) {
        await new Promise(resolveDelay => setTimeout(resolveDelay, configuredResponse.delayMs))
      }

      const configured = configuredResponse.result
      const result: WorkerResult = {
        taskId: ctx.taskId,
        status: configured?.status ?? 'success',
        summary: configured?.summary ?? 'Fake worker completed successfully',
        diffNotes: configured?.diffNotes ?? '',
        risks: configured?.risks ?? [],
        testsRun: configured?.testsRun ?? [],
        failures: configured?.failures ?? [],
        nextRecommendations: configured?.nextRecommendations ?? [],
      }

      return {
        taskId: ctx.taskId,
        worker: this.kind,
        result,
        changedFiles: [],
        diff: '',
        exitCode: configuredResponse.exitCode ?? 0,
        durationMs: Date.now() - startedAt,
        stdout: configuredResponse.stdout ?? '',
        stderr: '',
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return {
        taskId: ctx.taskId,
        worker: this.kind,
        result: synthesizeFailureResult(ctx.taskId, reason),
        changedFiles: [],
        diff: '',
        exitCode: response?.exitCode ?? 1,
        durationMs: Date.now() - startedAt,
        stdout: response?.stdout ?? '',
        stderr: reason,
        parseError: reason,
      }
    }
  }
}
