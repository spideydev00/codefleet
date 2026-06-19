/**
 * @fileoverview Integration tests for tracked repository inspection.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inspectRepo } from '../src/planner/repo-inspector.js'
import { runGit } from '../src/worktree/git.js'

let testRoot: string
let repoRoot: string

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'codefleet-repo-inspector-'))
  repoRoot = join(testRoot, 'repo')
  await mkdir(repoRoot)
  await runGit(repoRoot, ['init'])
  await writeFile(join(repoRoot, 'a.ts'), 'a\n')
  await writeFile(join(repoRoot, 'b.ts'), 'b\n')
  await writeFile(join(repoRoot, 'untracked.ts'), 'untracked\n')
  await runGit(repoRoot, ['add', 'a.ts', 'b.ts'])
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

describe('inspectRepo', () => {
  it('lists only tracked files', async () => {
    await expect(inspectRepo(repoRoot)).resolves.toEqual({
      root: resolve(repoRoot),
      files: ['a.ts', 'b.ts'],
      truncated: false,
    })
  })

  it('caps files and reports truncation', async () => {
    await expect(inspectRepo(repoRoot, { maxFiles: 1 })).resolves.toEqual({
      root: resolve(repoRoot),
      files: ['a.ts'],
      truncated: true,
    })
  })
})
