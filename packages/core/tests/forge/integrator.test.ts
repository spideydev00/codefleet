/**
 * @fileoverview Integration tests for serialized Git branch integration.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CheckRunner } from '../../src/forge/engine/checks.js'
import type { ConflictResolver } from '../../src/forge/merge/conflict-resolver.js'
import { Integrator } from '../../src/forge/merge/integrator.js'
import { runGit } from '../../src/forge/worktree/git.js'

let testRoot: string
let repoRoot: string
let integrators: Integrator[]

async function createBranch(
  branch: string,
  files: Record<string, string>,
): Promise<void> {
  await runGit(repoRoot, ['checkout', '-b', branch, 'main'])
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(repoRoot, path), content)
  }
  await runGit(repoRoot, ['add', '-A'])
  await runGit(repoRoot, ['commit', '-m', branch])
  await runGit(repoRoot, ['checkout', 'main'])
}

async function integrationDir(integrator: Integrator): Promise<string> {
  const result = await runGit(repoRoot, ['worktree', 'list', '--porcelain'])
  const blocks = result.stdout.trim().split('\n\n')
  const block = blocks.find(entry => (
    entry.includes(`branch refs/heads/${integrator.branch}`)
  ))
  const path = block?.split('\n').find(line => line.startsWith('worktree '))?.slice(9)
  if (!path) throw new Error('Integration worktree not found')
  return path
}

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'forge-integrator-test-'))
  repoRoot = join(testRoot, 'repo')
  integrators = []
  await mkdir(repoRoot)
  await runGit(repoRoot, ['init', '-b', 'main'])
  await runGit(repoRoot, ['config', 'user.name', 'Forge Test'])
  await runGit(repoRoot, ['config', 'user.email', 'forge@example.invalid'])
  await writeFile(join(repoRoot, 'shared.txt'), 'base\n')
  await runGit(repoRoot, ['add', 'shared.txt'])
  await runGit(repoRoot, ['commit', '-m', 'Initial commit'])
})

afterEach(async () => {
  for (const integrator of integrators.reverse()) await integrator.cleanup()
  await rm(testRoot, { recursive: true, force: true })
})

function createIntegrator(options: {
  resolver?: ConflictResolver
  checks?: CheckRunner
} = {}): Integrator {
  const integrator = new Integrator({
    repoRoot,
    runId: `run-${integrators.length}`,
    ...options,
  })
  integrators.push(integrator)
  return integrator
}

describe('Integrator', () => {
  it('merges a clean task branch', async () => {
    await createBranch('task-clean', { 'clean.txt': 'clean\n' })
    const integrator = createIntegrator()
    await integrator.init()

    await expect(integrator.merge('task-clean', 'clean')).resolves.toEqual({
      taskId: 'clean',
      outcome: 'merged',
    })
    await expect(readFile(join(await integrationDir(integrator), 'clean.txt'), 'utf8'))
      .resolves.toBe('clean\n')
  })

  it('commits a complete injected conflict resolution', async () => {
    await createBranch('task-left', { 'shared.txt': 'left\n' })
    await createBranch('task-right', { 'shared.txt': 'right\n' })
    const resolver: ConflictResolver = {
      async resolve(conflict) {
        expect(conflict.files[0]?.markedContent).toContain('<<<<<<<')
        return {
          files: [{ path: 'shared.txt', resolvedContent: 'left + right\n' }],
          rationale: 'Keep both changes.',
          unresolved: [],
        }
      },
    }
    const integrator = createIntegrator({ resolver })
    await integrator.init()
    await integrator.merge('task-left', 'left')

    const result = await integrator.merge('task-right', 'right')

    expect(result).toEqual({
      taskId: 'right',
      outcome: 'conflict-resolved',
      conflictFiles: ['shared.txt'],
      resolutionRationale: 'Keep both changes.',
    })
    await expect(readFile(join(await integrationDir(integrator), 'shared.txt'), 'utf8'))
      .resolves.toBe('left + right\n')
  })

  it('aborts an unresolved conflict and restores the integration tip', async () => {
    await createBranch('task-left', { 'shared.txt': 'left\n' })
    await createBranch('task-right', { 'shared.txt': 'right\n' })
    const integrator = createIntegrator()
    await integrator.init()
    await integrator.merge('task-left', 'left')
    const preTip = await integrator.tip()

    const result = await integrator.merge('task-right', 'right')

    expect(result).toMatchObject({
      taskId: 'right',
      outcome: 'merge-aborted',
      conflictFiles: ['shared.txt'],
    })
    expect(await integrator.tip()).toBe(preTip)
    const status = await runGit(await integrationDir(integrator), ['status', '--porcelain'])
    expect(status.stdout).toBe('')
  })

  it('resets a clean merge when validation fails', async () => {
    await createBranch('task-invalid', { 'invalid.txt': 'invalid\n' })
    const checks: CheckRunner = {
      async run() {
        return { ok: false, output: 'validation failed' }
      },
    }
    const integrator = createIntegrator({ checks })
    await integrator.init()
    const preTip = await integrator.tip()

    const result = await integrator.merge('task-invalid', 'invalid')

    expect(result).toEqual({
      taskId: 'invalid',
      outcome: 'merge-aborted',
      note: 'validation failed',
    })
    expect(await integrator.tip()).toBe(preTip)
  })
})
