/**
 * @fileoverview Git-worktree and directory isolation for Forge tasks.
 */

import { randomUUID } from 'node:crypto'
import {
  access,
  mkdir,
  mkdtemp,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import { isGitRepo, resolveCommit, runGit } from './git.js'
import type { Workspace, WorkspaceMode } from './workspace.js'

/**
 * Configuration for one run-scoped workspace manager.
 */
export interface WorktreeManagerOptions {
  repoRoot: string
  runId?: string
  baseRef?: string
  rootDir?: string
  mode?: WorkspaceMode
}

function validateRelativeIdentifier(value: string, label: string): void {
  const parts = value.split(/[\\/]/)
  if (
    value.length === 0
    || value.includes('\0')
    || isAbsolute(value)
    || parts.some(part => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new Error(`Invalid ${label}: "${value}"`)
  }
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== ''
    && path !== '..'
    && !path.startsWith(`..${sep}`)
    && !isAbsolute(path)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Allocates and tears down run-scoped isolated task workspaces.
 *
 * Automatic mode detection is lazy and occurs on the first {@link create}
 * call because repository inspection is asynchronous.
 */
export class WorktreeManager {
  readonly runId: string

  private readonly repoRoot: string
  private readonly baseRef: string
  private readonly rootDir: string
  private readonly configuredMode?: WorkspaceMode
  private readonly workspaces = new Map<string, Workspace>()
  private modePromise?: Promise<WorkspaceMode>
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(options: WorktreeManagerOptions) {
    this.repoRoot = resolve(options.repoRoot)
    this.runId = options.runId ?? randomUUID()
    validateRelativeIdentifier(this.runId, 'runId')

    this.baseRef = options.baseRef ?? 'HEAD'
    this.rootDir = resolve(
      options.rootDir ?? join(tmpdir(), 'forge', this.runId),
    )
    this.configuredMode = options.mode
  }

  /**
   * Creates one isolated workspace and tracks it for guaranteed teardown.
   */
  async create(taskId: string, fromRef?: string): Promise<Workspace> {
    return await this.enqueue(async () => {
      validateRelativeIdentifier(taskId, 'taskId')
      if (
        [...this.workspaces.values()]
          .some(workspace => workspace.taskId === taskId)
      ) {
        throw new Error(`Workspace already created for task "${taskId}"`)
      }

      const mode = await this.resolveMode()
      const dir = resolve(this.rootDir, taskId)
      if (!isWithin(this.rootDir, dir)) {
        throw new Error(`Task workspace escapes the run root: "${taskId}"`)
      }

      if (dir === this.repoRoot || isWithin(this.repoRoot, dir)) {
        throw new Error(
          `Workspace directory must be outside the repository: "${dir}"`,
        )
      }

      await mkdir(dirname(dir), { recursive: true })
      if (await pathExists(dir)) {
        throw new Error(`Task workspace already exists: "${dir}"`)
      }

      if (mode === 'directory') {
        await mkdir(dir)
        const workspace: Workspace = { taskId, dir, mode }
        this.track(workspace)
        return workspace
      }

      const branch = `forge/${this.runId}/${taskId}`
      await runGit(this.repoRoot, ['check-ref-format', '--branch', branch])
      const existing = await runGit(this.repoRoot, ['branch', '--list', branch])
      if (existing.stdout.trim()) {
        throw new Error(`Task branch already exists: "${branch}"`)
      }

      const baseCommit = await resolveCommit(
        this.repoRoot,
        fromRef ?? this.baseRef,
      )

      try {
        await runGit(this.repoRoot, [
          'worktree',
          'add',
          '-b',
          branch,
          dir,
          baseCommit,
        ])
      } catch (error) {
        await this.removeFailedWorktree(dir, branch)
        throw error
      }

      const workspace: Workspace = {
        taskId,
        dir,
        mode,
        branch,
        baseCommit,
      }
      this.track(workspace)
      return workspace
    })
  }

  /**
   * Returns a unified binary-capable diff against the recorded base commit.
   *
   * A temporary Git index is initialized from the base commit, populated with
   * `git add -A`, and diffed as cached content. This includes tracked changes,
   * deletions, and non-ignored untracked files without touching the workspace
   * index. Directory mode cannot produce Git diffs and returns an empty string.
   */
  async diff(ws: Workspace): Promise<string> {
    if (ws.mode === 'directory') return ''
    const baseCommit = this.requireBaseCommit(ws)

    return await this.withTemporaryIndex(ws, baseCommit, async environment => {
      const result = await runGit(
        ws.dir,
        ['diff', '--cached', '--binary', '--no-ext-diff', baseCommit, '--'],
        environment,
      )
      return result.stdout
    })
  }

  /**
   * Lists tracked and non-ignored untracked paths changed from the base commit.
   *
   * Directory mode has no comparison base and returns an empty array.
   */
  async changedFiles(ws: Workspace): Promise<string[]> {
    if (ws.mode === 'directory') return []
    const baseCommit = this.requireBaseCommit(ws)

    return await this.withTemporaryIndex(ws, baseCommit, async environment => {
      const result = await runGit(
        ws.dir,
        ['diff', '--cached', '--name-only', '-z', baseCommit, '--'],
        environment,
      )
      return result.stdout.split('\0').filter(path => path.length > 0)
    })
  }

  /**
   * Removes one workspace and its task branch.
   *
   * Cleanup is best-effort and idempotent, including when the directory,
   * worktree registration, or branch has already been removed.
   */
  async cleanup(ws: Workspace): Promise<void> {
    await this.enqueue(async () => {
      await this.cleanupWorkspace(ws)
    })
  }

  /**
   * Removes all tracked workspaces and the run root without throwing.
   */
  async cleanupAll(): Promise<void> {
    try {
      await this.enqueue(async () => {
        for (const workspace of [...this.workspaces.values()]) {
          await this.cleanupWorkspace(workspace)
        }

        try {
          await rm(this.rootDir, { recursive: true, force: true })
        } catch {
          // Best-effort cleanup must continue without surfacing teardown errors.
        }
      })
    } catch {
      // Guard the cleanup contract even if an unexpected internal error occurs.
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async resolveMode(): Promise<WorkspaceMode> {
    if (this.configuredMode) return this.configuredMode
    this.modePromise ??= isGitRepo(this.repoRoot).then(
      gitRepo => gitRepo ? 'worktree' : 'directory',
    )
    return await this.modePromise
  }

  private track(workspace: Workspace): void {
    this.workspaces.set(workspace.dir, workspace)
  }

  private requireBaseCommit(workspace: Workspace): string {
    if (!workspace.baseCommit) {
      throw new Error(
        `Worktree workspace "${workspace.taskId}" has no base commit`,
      )
    }
    return workspace.baseCommit
  }

  private async withTemporaryIndex<T>(
    workspace: Workspace,
    baseCommit: string,
    operation: (environment: NodeJS.ProcessEnv) => Promise<T>,
  ): Promise<T> {
    const tempRoot = await mkdtemp(join(tmpdir(), 'forge-index-'))
    const environment: NodeJS.ProcessEnv = {
      GIT_INDEX_FILE: join(tempRoot, 'index'),
    }

    try {
      await runGit(workspace.dir, ['read-tree', baseCommit], environment)
      await runGit(workspace.dir, ['add', '-A', '--', '.'], environment)
      return await operation(environment)
    } finally {
      try {
        await rm(tempRoot, { recursive: true, force: true })
      } catch {
        // Temporary index cleanup is best-effort.
      }
    }
  }

  private async removeFailedWorktree(dir: string, branch: string): Promise<void> {
    try {
      await runGit(this.repoRoot, ['worktree', 'remove', '--force', dir])
    } catch {
      // The worktree may not have been registered.
    }

    try {
      await rm(dir, { recursive: true, force: true })
    } catch {
      // Continue to prune metadata and remove the branch.
    }

    try {
      await runGit(this.repoRoot, ['worktree', 'prune'])
    } catch {
      // Continue to branch cleanup.
    }

    try {
      await runGit(this.repoRoot, ['branch', '-D', '--', branch])
    } catch {
      // The branch may not have been created.
    }
  }

  private async cleanupWorkspace(workspace: Workspace): Promise<void> {
    const tracked = this.workspaces.get(workspace.dir)
    if (tracked && tracked !== workspace) return

    if (workspace.mode === 'worktree') {
      try {
        await runGit(
          this.repoRoot,
          ['worktree', 'remove', '--force', workspace.dir],
        )
      } catch {
        // Missing worktrees are handled by filesystem removal and pruning.
      }

      try {
        await rm(workspace.dir, { recursive: true, force: true })
      } catch {
        // Continue to metadata and branch cleanup.
      }

      try {
        await runGit(this.repoRoot, ['worktree', 'prune'])
      } catch {
        // Continue to branch cleanup.
      }

      if (workspace.branch) {
        try {
          await runGit(
            this.repoRoot,
            ['branch', '-D', '--', workspace.branch],
          )
        } catch {
          // The branch may already be absent.
        }
      }
    } else {
      try {
        await rm(workspace.dir, { recursive: true, force: true })
      } catch {
        // Directory cleanup is best-effort.
      }
    }

    this.workspaces.delete(workspace.dir)
  }
}
