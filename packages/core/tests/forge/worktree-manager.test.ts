/**
 * @fileoverview Integration tests for isolated Forge task workspaces.
 */

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveCommit, runGit } from '../../src/forge/worktree/git.js'
import { WorktreeManager } from '../../src/forge/worktree/worktree-manager.js'

let testRoot: string
let repoRoot: string
let managers: WorktreeManager[]

function createManager(
  options: Partial<ConstructorParameters<typeof WorktreeManager>[0]> = {},
): WorktreeManager {
  const manager = new WorktreeManager({
    repoRoot,
    runId: `test-${randomUUID()}`,
    ...options,
  })
  managers.push(manager)
  return manager
}

function isOutside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '..' || path.startsWith('../') || isAbsolute(path)
}

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'forge-worktree-test-'))
  repoRoot = join(testRoot, 'repo')
  managers = []

  await mkdir(repoRoot)
  await runGit(repoRoot, ['init'])
  await runGit(repoRoot, ['config', 'user.name', 'Forge Test'])
  await runGit(repoRoot, ['config', 'user.email', 'forge@example.invalid'])
  await writeFile(join(repoRoot, 'README.md'), 'initial\n')
  await runGit(repoRoot, ['add', 'README.md'])
  await runGit(repoRoot, ['commit', '-m', 'Initial commit'])
})

afterEach(async () => {
  for (const manager of managers.reverse()) {
    await manager.cleanupAll()
  }
  await rm(testRoot, { recursive: true, force: true })
})

describe('WorktreeManager', () => {
  it('creates a branch-backed workspace outside the repository', async () => {
    const manager = createManager()
    const workspace = await manager.create('task-a')

    expect(workspace.mode).toBe('worktree')
    expect(workspace.branch).toBe(`forge/${manager.runId}/task-a`)
    expect(workspace.baseCommit).toBe(await resolveCommit(repoRoot, 'HEAD'))
    expect(isOutside(repoRoot, workspace.dir)).toBe(true)
    expect(existsSync(workspace.dir)).toBe(true)

    const branch = await runGit(workspace.dir, ['branch', '--show-current'])
    expect(branch.stdout.trim()).toBe(workspace.branch)
  })

  it('keeps workspace writes out of the main working tree', async () => {
    const manager = createManager()
    const workspace = await manager.create('task-a')

    await writeFile(join(workspace.dir, 'isolated.txt'), 'workspace only\n')

    const status = await runGit(repoRoot, ['status', '--porcelain'])
    expect(status.stdout).toBe('')
    expect(existsSync(join(repoRoot, 'isolated.txt'))).toBe(false)
  })

  it('reports modified and untracked files in changed files and diff', async () => {
    const manager = createManager()
    const workspace = await manager.create('task-a')

    await writeFile(join(workspace.dir, 'README.md'), 'initial\nmodified\n')
    await writeFile(join(workspace.dir, 'new-file.txt'), 'new content\n')

    const changedFiles = await manager.changedFiles(workspace)
    const diff = await manager.diff(workspace)

    expect(changedFiles.sort()).toEqual(['README.md', 'new-file.txt'])
    expect(diff).toContain('README.md')
    expect(diff).toContain('+modified')
    expect(diff).toContain('new-file.txt')
    expect(diff).toContain('+new content')
  })

  it('cleans one workspace and branch idempotently', async () => {
    const manager = createManager()
    const workspace = await manager.create('task-a')
    const branch = workspace.branch

    await manager.cleanup(workspace)

    expect(existsSync(workspace.dir)).toBe(false)
    const branches = await runGit(repoRoot, ['branch', '--list', branch])
    expect(branches.stdout.trim()).toBe('')
    await expect(manager.cleanup(workspace)).resolves.toBeUndefined()
  })

  it('isolates two concurrently created workspaces', async () => {
    const manager = createManager()
    const [first, second] = await Promise.all([
      manager.create('task-a'),
      manager.create('task-b'),
    ])

    await writeFile(join(first.dir, 'first-only.txt'), 'first\n')

    expect(existsSync(join(first.dir, 'first-only.txt'))).toBe(true)
    expect(existsSync(join(second.dir, 'first-only.txt'))).toBe(false)
  })

  it('cleans every workspace and the run root idempotently', async () => {
    const rootDir = join(testRoot, 'run-root')
    const manager = createManager({ rootDir })
    const first = await manager.create('task-a')
    const second = await manager.create('task-b')

    await manager.cleanupAll()

    expect(existsSync(first.dir)).toBe(false)
    expect(existsSync(second.dir)).toBe(false)
    expect(existsSync(rootDir)).toBe(false)
    await expect(manager.cleanupAll()).resolves.toBeUndefined()
  })

  it('supports directory mode for a non-Git repository', async () => {
    const nonGitRoot = join(testRoot, 'plain-directory')
    const rootDir = join(testRoot, 'directory-workspaces')
    await mkdir(nonGitRoot)

    const manager = createManager({
      repoRoot: nonGitRoot,
      rootDir,
    })
    const workspace = await manager.create('task-a')
    await writeFile(join(workspace.dir, 'file.txt'), 'content\n')

    expect(workspace.mode).toBe('directory')
    await expect(manager.changedFiles(workspace)).resolves.toEqual([])
    await expect(manager.diff(workspace)).resolves.toBe('')

    await manager.cleanup(workspace)
    expect(existsSync(workspace.dir)).toBe(false)
    await expect(manager.cleanup(workspace)).resolves.toBeUndefined()
  })
})
