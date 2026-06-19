/**
 * @fileoverview End-to-end tests for the injectable Forge orchestrator.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ForgeValidationError } from '../../src/forge/errors.js'
import type { ConflictResolver } from '../../src/forge/merge/conflict-resolver.js'
import { runForge } from '../../src/forge/orchestrator/run-forge.js'
import type { TasksPlan } from '../../src/forge/tasks-schema.js'
import { FakeCodexWorker } from '../../src/forge/worker/fake-codex-worker.js'
import { runGit } from '../../src/forge/worktree/git.js'

let testRoot: string
let repoRoot: string

const taskPlan: TasksPlan = {
  tasks: [{
    id: 'task-a',
    title: 'Create output',
    description: 'Create the requested output file.',
    fileScope: ['output.txt'],
    dependsOn: [],
  }],
}

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'forge-orchestrator-'))
  repoRoot = join(testRoot, 'repo')
  await mkdir(repoRoot)
  await runGit(repoRoot, ['init', '-b', 'main'])
  await runGit(repoRoot, ['config', 'user.name', 'Forge Test'])
  await runGit(repoRoot, ['config', 'user.email', 'forge@example.invalid'])
  await writeFile(join(repoRoot, 'README.md'), 'initial\n')
  await runGit(repoRoot, ['add', 'README.md'])
  await runGit(repoRoot, ['commit', '-m', 'Initial commit'])
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

describe('runForge', () => {
  it('plans, executes, integrates, and renders through injected ports', async () => {
    let planningOptions: { repoRoot: string; userPrompt: string } | undefined
    const resolver: ConflictResolver = {
      async resolve() {
        return undefined
      },
    }

    const result = await runForge({
      repoRoot,
      userPrompt: 'Create output.',
      planTasksFn: async options => {
        planningOptions = options
        return taskPlan
      },
      worker: new FakeCodexWorker(async () => ({
        files: [{ path: 'output.txt', content: 'done\n' }],
      })),
      resolver,
    })

    expect(planningOptions).toMatchObject({
      repoRoot,
      userPrompt: 'Create output.',
    })
    expect(result.report.status).toBe('success')
    expect(result.report.plan).toEqual(taskPlan.tasks)
    expect(result.report.totals).toMatchObject({
      tasks: 1,
      succeeded: 1,
      merged: 1,
    })
    expect(result.rendered).toContain(`\`${result.report.runId}\``)
    expect(result.rendered).toContain('Final status: **success**')

    const worktrees = await runGit(repoRoot, ['worktree', 'list', '--porcelain'])
    expect(worktrees.stdout.match(/^worktree /gm) ?? []).toHaveLength(1)
    const branches = await runGit(repoRoot, ['branch', '--list', 'forge/*'])
    expect(branches.stdout.trim()).toBe('')
  })

  it('propagates planning validation errors', async () => {
    const error = new ForgeValidationError('No usable task plan')

    await expect(runForge({
      repoRoot,
      userPrompt: 'Invalid plan.',
      planTasksFn: async () => {
        throw error
      },
      worker: new FakeCodexWorker(),
    })).rejects.toBe(error)
  })
})
