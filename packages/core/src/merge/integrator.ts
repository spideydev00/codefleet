/**
 * @fileoverview Run-scoped integration branch, conflict resolution, and checks.
 */

import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import type { MergeReportEntry } from '../report-types.js'
import { resolveCommit, runGit } from '../worktree/git.js'
import {
  NoopCheckRunner,
  type CheckRunner,
} from '../engine/checks.js'
import {
  NoopConflictResolver,
  type ConflictResolver,
} from './conflict-resolver.js'
import type { MergeConflict } from './conflict.js'

const NOTE_LIMIT = 4_000

/**
 * Configuration for one integration branch.
 */
export interface IntegratorOptions {
  repoRoot: string
  runId: string
  baseRef?: string
  resolver?: ConflictResolver
  checks?: CheckRunner
  committer?: { name: string; email: string }
}

function note(text: string): string {
  return text.trim().slice(0, NOTE_LIMIT)
}

/**
 * Owns the single serialized integration worktree for one run.
 */
export class Integrator {
  readonly branch: string

  private readonly repoRoot: string
  private readonly baseRef: string
  private readonly resolver: ConflictResolver
  private readonly checks: CheckRunner
  private readonly committer: { name: string; email: string }
  private rootDir?: string
  private worktreeDir?: string

  constructor(options: IntegratorOptions) {
    this.repoRoot = resolve(options.repoRoot)
    this.baseRef = options.baseRef ?? 'HEAD'
    this.branch = `codefleet/${options.runId}/integration`
    this.resolver = options.resolver ?? new NoopConflictResolver()
    this.checks = options.checks ?? new NoopCheckRunner()
    this.committer = options.committer ?? {
      name: 'CodeFleet',
      email: 'codefleet@local',
    }
  }

  /**
   * Creates the integration branch and worktree once.
   */
  async init(): Promise<void> {
    if (this.worktreeDir) return

    const baseCommit = await resolveCommit(this.repoRoot, this.baseRef)
    await runGit(this.repoRoot, ['check-ref-format', '--branch', this.branch])
    const rootDir = await mkdtemp(join(tmpdir(), 'codefleet-integration-'))
    const worktreeDir = join(rootDir, 'worktree')

    try {
      await runGit(this.repoRoot, [
        'worktree',
        'add',
        '-b',
        this.branch,
        worktreeDir,
        baseCommit,
      ])
      this.rootDir = rootDir
      this.worktreeDir = worktreeDir
    } catch (error) {
      await rm(rootDir, { recursive: true, force: true })
      try {
        await runGit(this.repoRoot, ['branch', '-D', '--', this.branch])
      } catch {
        // The branch may not have been created.
      }
      throw error
    }
  }

  /**
   * Returns the current integration commit.
   */
  async tip(): Promise<string> {
    return await resolveCommit(this.requireWorktree(), 'HEAD')
  }

  /**
   * Merges one task branch, resolves conflicts, and validates the result.
   */
  async merge(taskBranch: string, taskId: string): Promise<MergeReportEntry> {
    let preTip: string | undefined

    try {
      const cwd = this.requireWorktree()
      preTip = await resolveCommit(cwd, 'HEAD')

      try {
        await runGit(cwd, [
          '-c',
          `user.name=${this.committer.name}`,
          '-c',
          `user.email=${this.committer.email}`,
          'merge',
          '--no-ff',
          '--no-edit',
          taskBranch,
        ])
      } catch (mergeError) {
        const conflicted = await this.conflictedPaths(cwd)
        if (conflicted.length === 0) throw mergeError
        return await this.resolveConflict(cwd, taskBranch, taskId, conflicted, preTip)
      }

      const checks = await this.checks.run(cwd)
      if (checks.ok) return { taskId, outcome: 'merged' }

      await this.rollback(cwd, preTip)
      return {
        taskId,
        outcome: 'merge-aborted',
        note: note(checks.output || 'Integration checks failed'),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (this.worktreeDir && preTip) {
        await this.rollback(this.worktreeDir, preTip)
      }
      return {
        taskId,
        outcome: 'merge-aborted',
        note: note(message),
      }
    }
  }

  /**
   * Removes the integration worktree and branch without throwing.
   */
  async cleanup(): Promise<void> {
    const worktreeDir = this.worktreeDir
    this.worktreeDir = undefined

    if (worktreeDir) {
      try {
        await runGit(this.repoRoot, ['worktree', 'remove', '--force', worktreeDir])
      } catch {
        // Filesystem cleanup and pruning cover partial worktree state.
      }
    }

    if (this.rootDir) {
      try {
        await rm(this.rootDir, { recursive: true, force: true })
      } catch {
        // Continue cleanup.
      }
      this.rootDir = undefined
    }

    try {
      await runGit(this.repoRoot, ['worktree', 'prune'])
    } catch {
      // Continue branch cleanup.
    }

    try {
      await runGit(this.repoRoot, ['branch', '-D', '--', this.branch])
    } catch {
      // The branch may already be absent.
    }
  }

  private requireWorktree(): string {
    if (!this.worktreeDir) throw new Error('Integrator is not initialized')
    return this.worktreeDir
  }

  private async conflictedPaths(cwd: string): Promise<string[]> {
    const result = await runGit(cwd, [
      'diff',
      '--name-only',
      '--diff-filter=U',
      '-z',
    ])
    return result.stdout.split('\0').filter(path => path.length > 0)
  }

  private async resolveConflict(
    cwd: string,
    taskBranch: string,
    taskId: string,
    conflicted: string[],
    preTip: string,
  ): Promise<MergeReportEntry> {
    const conflict: MergeConflict = {
      taskId,
      branch: taskBranch,
      files: await Promise.all(conflicted.map(async path => ({
        path,
        markedContent: await readFile(join(cwd, path), 'utf8'),
      }))),
    }
    const resolution = await this.resolver.resolve(conflict)
    const aborted = (reason: string): Promise<MergeReportEntry> =>
      this.abortConflict(cwd, preTip, taskId, conflicted, reason)

    if (!resolution) return await aborted('Conflict resolver returned no resolution')
    if (resolution.unresolved.length > 0) {
      return await aborted(`Resolver left unresolved files: ${resolution.unresolved.join(', ')}`)
    }

    const resolved = new Map(resolution.files.map(file => [file.path, file.resolvedContent]))
    const missing = conflicted.filter(path => !resolved.has(path))
    if (missing.length > 0) {
      return await aborted(`Resolver omitted conflicted files: ${missing.join(', ')}`)
    }

    for (const path of conflicted) {
      const destination = resolve(cwd, path)
      const fromRoot = relative(cwd, destination)
      if (
        fromRoot === '..'
        || fromRoot.startsWith(`..${sep}`)
        || isAbsolute(fromRoot)
      ) {
        return await aborted(`Conflicted path escapes integration worktree: ${path}`)
      }
      await writeFile(destination, resolved.get(path) ?? '', 'utf8')
    }
    await runGit(cwd, ['add', '--', ...conflicted])

    const checks = await this.checks.run(cwd)
    if (!checks.ok) {
      return await aborted(checks.output || 'Integration checks failed')
    }

    await runGit(cwd, [
      '-c',
      `user.name=${this.committer.name}`,
      '-c',
      `user.email=${this.committer.email}`,
      'commit',
      '--no-edit',
    ])
    return {
      taskId,
      outcome: 'conflict-resolved',
      conflictFiles: conflicted,
      resolutionRationale: resolution.rationale,
    }
  }

  private async abortConflict(
    cwd: string,
    preTip: string,
    taskId: string,
    conflictFiles: string[],
    reason: string,
  ): Promise<MergeReportEntry> {
    await this.rollback(cwd, preTip)
    return {
      taskId,
      outcome: 'merge-aborted',
      conflictFiles,
      note: note(reason),
    }
  }

  private async rollback(cwd: string, preTip: string): Promise<void> {
    try {
      await runGit(cwd, ['merge', '--abort'])
    } catch {
      // A clean merge has no active merge state.
    }
    try {
      await runGit(cwd, ['reset', '--hard', preTip])
    } catch {
      // Best-effort rollback is completed by worktree cleanup if needed.
    }
  }
}
