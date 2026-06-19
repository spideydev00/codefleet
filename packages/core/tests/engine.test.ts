/**
 * @fileoverview End-to-end tests for deterministic DAG execution and cleanup.
 */

import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CheckRunner } from '../src/engine/checks.js'
import { runPlan } from '../src/engine/engine.js'
import type { ConflictResolver } from '../src/merge/conflict-resolver.js'
import type { TasksPlan } from '../src/tasks-schema.js'
import { FakeCodexWorker } from '../src/worker/fake-codex-worker.js'
import { runGit } from '../src/worktree/git.js'

let testRoot: string
let repoRoot: string

function plan(
  tasks: Array<{
    id: string
    dependsOn?: string[]
    description?: string
  }>,
): TasksPlan {
  return {
    tasks: tasks.map(task => ({
      id: task.id,
      title: `Task ${task.id}`,
      description: task.description ?? `Implement ${task.id}.`,
      fileScope: [],
      dependsOn: task.dependsOn ?? [],
    })),
  }
}

async function cleanupPreserved(): Promise<void> {
  try {
    const worktrees = await runGit(repoRoot, ['worktree', 'list', '--porcelain'])
    const paths = worktrees.stdout
      .split('\n')
      .filter(line => line.startsWith('worktree '))
      .map(line => line.slice(9))
      .filter(path => path !== repoRoot)
    for (const path of paths) {
      try {
        await runGit(repoRoot, ['worktree', 'remove', '--force', path])
      } catch {
        // Test teardown continues through stale worktrees.
      }
    }
    await runGit(repoRoot, ['worktree', 'prune'])
    const branches = await runGit(repoRoot, [
      'for-each-ref',
      '--format=%(refname:short)',
      'refs/heads/codefleet/',
    ])
    for (const branch of branches.stdout.trim().split('\n').filter(Boolean)) {
      await runGit(repoRoot, ['branch', '-D', '--', branch])
    }
  } catch {
    // The temporary repository may already be gone.
  }
}

async function expectCodeFleetClean(runId: string): Promise<void> {
  const worktrees = await runGit(repoRoot, ['worktree', 'list', '--porcelain'])
  expect(worktrees.stdout.match(/^worktree /gm) ?? []).toHaveLength(1)
  const branches = await runGit(repoRoot, ['branch', '--list', `codefleet/${runId}/*`])
  expect(branches.stdout.trim()).toBe('')
}

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'codefleet-engine-test-'))
  repoRoot = join(testRoot, 'repo')
  await mkdir(repoRoot)
  await runGit(repoRoot, ['init', '-b', 'main'])
  await runGit(repoRoot, ['config', 'user.name', 'CodeFleet Test'])
  await runGit(repoRoot, ['config', 'user.email', 'codefleet@example.invalid'])
  await writeFile(join(repoRoot, 'shared.txt'), 'base\n')
  await runGit(repoRoot, ['add', 'shared.txt'])
  await runGit(repoRoot, ['commit', '-m', 'Initial commit'])
})

afterEach(async () => {
  await cleanupPreserved()
  await rm(testRoot, { recursive: true, force: true })
})

describe('runPlan', () => {
  it('runs independent tasks, integrates both changes, and fully cleans up', async () => {
    const runId = 'independent'
    let finalFilesPresent = false
    const checks: CheckRunner = {
      async run(cwd) {
        try {
          await Promise.all([
            access(join(cwd, 'a.txt')),
            access(join(cwd, 'b.txt')),
          ])
          finalFilesPresent = true
        } catch {
          // The first merge contains only one task file.
        }
        return { ok: true, output: '' }
      },
    }
    const worker = new FakeCodexWorker(async brief => ({
      files: [{ path: `${brief.id}.txt`, content: `${brief.id}\n` }],
      delayMs: brief.id === 'a' ? 1 : 10,
    }))

    const report = await runPlan(plan([{ id: 'a' }, { id: 'b' }]), {
      repoRoot,
      userPrompt: 'Create two files.',
      worker,
      checks,
      runId,
      maxParallel: 2,
    })

    expect(report.status).toBe('success')
    expect(report.totals).toMatchObject({
      tasks: 2,
      succeeded: 2,
      failed: 0,
      skipped: 0,
      merged: 2,
    })
    expect(report.merges.map(entry => entry.outcome)).toEqual(['merged', 'merged'])
    expect(finalFilesPresent).toBe(true)
    await expectCodeFleetClean(runId)
  })

  it('branches a dependent task from the post-merge integration tip', async () => {
    const worker = new FakeCodexWorker(async (brief, ctx) => {
      if (brief.id === 'b') {
        expect(await readFile(join(ctx.workspaceDir, 'a.txt'), 'utf8'))
          .toBe('from a\n')
      }
      return {
        files: [{
          path: `${brief.id}.txt`,
          content: brief.id === 'a' ? 'from a\n' : 'from b\n',
        }],
      }
    })

    const report = await runPlan(plan([
      { id: 'a' },
      { id: 'b', dependsOn: ['a'] },
    ]), {
      repoRoot,
      userPrompt: 'Run a chain.',
      worker,
      runId: 'chain',
    })

    expect(report.status).toBe('success')
    expect(report.merges.map(entry => entry.outcome)).toEqual(['merged', 'merged'])
  })

  it('does not retry failures and transitively skips dependents', async () => {
    let bRuns = 0
    const worker = new FakeCodexWorker(async brief => {
      if (brief.id === 'a') {
        return {
          result: {
            status: 'failure',
            summary: 'programmed failure',
            failures: ['programmed failure'],
          },
        }
      }
      bRuns += 1
      return {}
    })

    const report = await runPlan(plan([
      { id: 'a' },
      { id: 'b', dependsOn: ['a'] },
    ]), {
      repoRoot,
      userPrompt: 'Fail the first task.',
      worker,
      runId: 'failure',
    })

    expect(report.status).toBe('partial')
    expect(report.tasks.map(entry => entry.outcome)).toEqual(['failed', 'skipped'])
    expect(report.tasks[1]?.skippedReason).toContain('"a"')
    expect(report.merges.map(entry => entry.outcome))
      .toEqual(['not-merged', 'not-merged'])
    expect(bRuns).toBe(0)
    await expectCodeFleetClean('failure')
  })

  it('uses the injected resolver for conflicting successful tasks', async () => {
    const resolver: ConflictResolver = {
      async resolve(conflict) {
        return {
          files: conflict.files.map(file => ({
            path: file.path,
            resolvedContent: 'resolved\n',
          })),
          rationale: 'Deterministic test resolution.',
          unresolved: [],
        }
      },
    }
    const worker = new FakeCodexWorker(async brief => ({
      files: [{ path: 'shared.txt', content: `${brief.id}\n` }],
      delayMs: brief.id === 'a' ? 1 : 15,
    }))

    const report = await runPlan(plan([{ id: 'a' }, { id: 'b' }]), {
      repoRoot,
      userPrompt: 'Resolve a conflict.',
      worker,
      resolver,
      runId: 'conflict',
      maxParallel: 2,
    })

    expect(report.status).toBe('success')
    expect(report.merges.map(entry => entry.outcome))
      .toEqual(['merged', 'conflict-resolved'])
    expect(report.totals.conflictsResolved).toBe(1)
    await expectCodeFleetClean('conflict')
  })

  it('preserves all run worktrees and branches when requested', async () => {
    const runId = 'preserved'
    const report = await runPlan(plan([{ id: 'a' }]), {
      repoRoot,
      userPrompt: 'Keep debugging state.',
      worker: new FakeCodexWorker(async () => ({
        files: [{ path: 'kept.txt', content: 'kept\n' }],
      })),
      runId,
      keepWorkspaces: true,
    })

    expect(report.status).toBe('success')
    const worktrees = await runGit(repoRoot, ['worktree', 'list', '--porcelain'])
    expect((worktrees.stdout.match(/^worktree /gm) ?? []).length).toBeGreaterThan(1)
    const branches = await runGit(repoRoot, ['branch', '--list', `codefleet/${runId}/*`])
    expect(branches.stdout).toContain(`codefleet/${runId}/a`)
    expect(branches.stdout).toContain(`codefleet/${runId}/integration`)
  })
})
