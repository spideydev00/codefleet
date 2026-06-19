/**
 * @fileoverview Deterministic DAG scheduler and integration engine.
 */

import { randomUUID } from 'node:crypto'
import { withGuaranteedCleanup } from '../cleanup/cleanup.js'
import { Integrator } from '../merge/integrator.js'
import type {
  CodeFleetReport,
  MergeReportEntry,
  TaskReportEntry,
} from '../report-types.js'
import { parseTaskBrief } from '../task-brief.js'
import {
  parseTasksPlan,
  type PlannedTask,
  type TasksPlan,
} from '../tasks-schema.js'
import {
  synthesizeFailureResult,
  type WorkerRunRecord,
} from '../worker-result.js'
import { runGit } from '../worktree/git.js'
import { WorktreeManager } from '../worktree/worktree-manager.js'
import type { Workspace } from '../worktree/workspace.js'
import { Semaphore } from './concurrency.js'
import type { EngineTaskState, RunPlanOptions } from './types.js'

const DEFAULT_MAX_PARALLEL = 4
const DEFAULT_COMMITTER = {
  name: 'CodeFleet',
  email: 'codefleet@local',
}

function merged(entry: MergeReportEntry | undefined): boolean {
  return entry?.outcome === 'merged' || entry?.outcome === 'conflict-resolved'
}

function failureRecord(
  taskId: string,
  worker: WorkerRunRecord['worker'],
  reason: string,
  previous?: WorkerRunRecord,
): WorkerRunRecord {
  return {
    taskId,
    worker,
    result: synthesizeFailureResult(taskId, reason),
    changedFiles: previous?.changedFiles ?? [],
    diff: previous?.diff ?? '',
    exitCode: previous?.exitCode ?? null,
    durationMs: previous?.durationMs ?? 0,
    stdout: previous?.stdout ?? '',
    stderr: [previous?.stderr, reason].filter(Boolean).join('\n'),
    parseError: reason,
  }
}

/**
 * Executes and integrates a validated task DAG.
 */
export async function runPlan(
  plan: TasksPlan,
  options: RunPlanOptions,
): Promise<CodeFleetReport> {
  const validated = parseTasksPlan(plan)
  const startedAt = Date.now()
  const runId = options.runId ?? randomUUID()
  const maxParallel = options.maxParallel ?? DEFAULT_MAX_PARALLEL
  const committer = options.committer ?? DEFAULT_COMMITTER
  const manager = new WorktreeManager({
    repoRoot: options.repoRoot,
    runId,
    baseRef: options.baseRef,
  })
  const integrator = new Integrator({
    repoRoot: options.repoRoot,
    runId,
    baseRef: options.baseRef,
    resolver: options.resolver,
    checks: options.checks,
    committer,
  })
  const states = new Map<string, EngineTaskState>(
    validated.tasks.map(task => [task.id, { status: 'pending' }]),
  )
  const workers = new Semaphore(maxParallel)
  const merges = new Semaphore(1)
  const running = new Map<string, Promise<void>>()

  const cleanup = {
    async cleanupAll(): Promise<void> {
      await integrator.cleanup()
      await manager.cleanupAll()
    },
  }

  return await withGuaranteedCleanup(cleanup, async () => {
    await integrator.init()

    const execute = async (task: PlannedTask): Promise<void> => {
      const state = states.get(task.id)
      if (!state) return
      state.status = 'running'
      let workspace: Workspace | undefined
      let record: WorkerRunRecord | undefined

      try {
        await workers.run(async () => {
          const fromRef = await integrator.tip()
          workspace = await manager.create(task.id, fromRef)
          const brief = parseTaskBrief({
            id: task.id,
            title: task.title,
            description: task.description,
            fileScope: task.fileScope,
            dependsOn: task.dependsOn,
            acceptance: [],
          })

          try {
            record = await options.worker.run(brief, {
              workspaceDir: workspace.dir,
              runId,
              taskId: task.id,
              abortSignal: options.abortSignal,
              timeoutMs: options.taskTimeoutMs,
            })
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            record = failureRecord(task.id, options.worker.kind, reason)
          }

          if (record.result.status === 'failure') return

          const changedFiles = await manager.changedFiles(workspace)
          const diff = await manager.diff(workspace)
          record = { ...record, changedFiles, diff }
          if (changedFiles.length === 0) return

          await runGit(workspace.dir, ['add', '-A', '--', '.'])
          await runGit(workspace.dir, [
            '-c',
            `user.name=${committer.name}`,
            '-c',
            `user.email=${committer.email}`,
            'commit',
            '-m',
            `CodeFleet task ${task.id}`,
          ])
        })

        if (!record) throw new Error('Worker returned no execution record')

        if (record.result.status === 'failure') {
          state.status = 'failed'
          state.task = {
            taskId: task.id,
            title: task.title,
            outcome: 'failed',
            record,
          }
          state.merge = { taskId: task.id, outcome: 'not-merged' }
          return
        }

        state.task = {
          taskId: task.id,
          title: task.title,
          outcome: 'succeeded',
          record,
        }

        if (record.changedFiles.length === 0) {
          state.merge = {
            taskId: task.id,
            outcome: 'merged',
            note: 'no file changes',
          }
          state.status = 'succeeded'
          return
        }

        if (!workspace?.branch) throw new Error('Task workspace has no Git branch')
        const taskBranch = workspace.branch
        state.merge = await merges.run(
          async () => await integrator.merge(taskBranch, task.id),
        )
        state.status = 'succeeded'
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        state.status = 'failed'
        state.task = {
          taskId: task.id,
          title: task.title,
          outcome: 'failed',
          record: failureRecord(task.id, options.worker.kind, reason, record),
        }
        state.merge = { taskId: task.id, outcome: 'not-merged', note: reason }
      } finally {
        if (workspace && !options.keepWorkspaces) {
          await manager.cleanup(workspace)
        }
      }
    }

    while ([...states.values()].some(state => (
      state.status === 'pending' || state.status === 'running'
    ))) {
      for (const task of validated.tasks) {
        const state = states.get(task.id)
        if (state?.status !== 'pending') continue

        const blocker = task.dependsOn.find(dependency => {
          const dependencyState = states.get(dependency)
          return dependencyState?.status === 'failed'
            || dependencyState?.status === 'skipped'
            || (
              dependencyState?.status === 'succeeded'
              && !merged(dependencyState.merge)
            )
        })
        if (!blocker) continue

        state.status = 'skipped'
        state.task = {
          taskId: task.id,
          title: task.title,
          outcome: 'skipped',
          skippedReason: `Blocked by dependency "${blocker}"`,
        }
        state.merge = {
          taskId: task.id,
          outcome: 'not-merged',
          note: `Blocked by dependency "${blocker}"`,
        }
      }

      if (options.abortSignal?.aborted) {
        for (const task of validated.tasks) {
          const state = states.get(task.id)
          if (state?.status !== 'pending') continue
          state.status = 'skipped'
          state.task = {
            taskId: task.id,
            title: task.title,
            outcome: 'skipped',
            skippedReason: 'Run aborted before task execution',
          }
          state.merge = {
            taskId: task.id,
            outcome: 'not-merged',
            note: 'Run aborted before task execution',
          }
        }
      }

      for (const task of validated.tasks) {
        const state = states.get(task.id)
        if (state?.status !== 'pending') continue
        if (!task.dependsOn.every(dependency => {
          const dependencyState = states.get(dependency)
          return dependencyState?.status === 'succeeded'
            && merged(dependencyState.merge)
        })) continue

        const promise = execute(task).finally(() => {
          running.delete(task.id)
        })
        running.set(task.id, promise)
      }

      if (running.size > 0) {
        await Promise.race(running.values())
        continue
      }

      const unresolved = validated.tasks.filter(
        task => states.get(task.id)?.status === 'pending',
      )
      for (const task of unresolved) {
        const state = states.get(task.id)
        if (!state) continue
        state.status = 'skipped'
        state.task = {
          taskId: task.id,
          title: task.title,
          outcome: 'skipped',
          skippedReason: 'Dependencies did not reach an integratable state',
        }
        state.merge = {
          taskId: task.id,
          outcome: 'not-merged',
          note: 'Dependencies did not reach an integratable state',
        }
      }
    }

    const taskEntries = validated.tasks.map(task => {
      const entry = states.get(task.id)?.task
      if (!entry) throw new Error(`Task "${task.id}" has no final report entry`)
      return entry
    })
    const mergeEntries = validated.tasks.map(task => {
      const entry = states.get(task.id)?.merge
      if (!entry) throw new Error(`Task "${task.id}" has no final merge entry`)
      return entry
    })
    const succeeded = taskEntries.filter(task => task.outcome === 'succeeded').length
    const failed = taskEntries.filter(task => task.outcome === 'failed').length
    const skipped = taskEntries.filter(task => task.outcome === 'skipped').length
    const mergedCount = mergeEntries.filter(entry => merged(entry)).length
    const conflictsResolved = mergeEntries.filter(
      entry => entry.outcome === 'conflict-resolved',
    ).length
    const allIntegrated = taskEntries.every((task, index) => (
      task.outcome === 'succeeded' && merged(mergeEntries[index])
    ))
    const status: CodeFleetReport['status'] = allIntegrated
      ? 'success'
      : mergedCount === 0 && skipped === 0
        ? 'failed'
        : 'partial'

    return {
      runId,
      userPrompt: options.userPrompt,
      plan: validated.tasks,
      tasks: taskEntries,
      merges: mergeEntries,
      totals: {
        tasks: taskEntries.length,
        succeeded,
        failed,
        skipped,
        merged: mergedCount,
        conflictsResolved,
        durationMs: Date.now() - startedAt,
      },
      status,
    }
  }, { keep: options.keepWorkspaces })
}
