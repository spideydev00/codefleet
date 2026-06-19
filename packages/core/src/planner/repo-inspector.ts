/**
 * @fileoverview Lightweight tracked-file snapshot for Claude planning.
 */

import { resolve } from 'node:path'
import { runGit } from '../worktree/git.js'

const DEFAULT_MAX_FILES = 2_000

/**
 * Tracked repository paths available to the planner.
 */
export interface RepoSnapshot {
  root: string
  files: string[]
  truncated: boolean
}

/**
 * Options controlling snapshot size.
 */
export interface RepoInspectorOptions {
  readonly maxFiles?: number
}

/**
 * Lists tracked files without reading their contents.
 */
export async function inspectRepo(
  repoRoot: string,
  options: RepoInspectorOptions = {},
): Promise<RepoSnapshot> {
  const root = resolve(repoRoot)
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
  if (!Number.isInteger(maxFiles) || maxFiles < 1) {
    throw new Error('maxFiles must be a positive integer')
  }

  const result = await runGit(root, ['ls-files', '-z'])
  const allFiles = result.stdout.split('\0').filter(path => path.length > 0)
  return {
    root,
    files: allFiles.slice(0, maxFiles),
    truncated: allFiles.length > maxFiles,
  }
}
