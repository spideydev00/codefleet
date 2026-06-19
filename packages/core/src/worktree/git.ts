/**
 * @fileoverview Minimal process runner for CodeFleet Git operations.
 */

import { execFile } from 'node:child_process'

const GIT_TIMEOUT_MS = 30_000
const GIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024

/**
 * Runs Git without a shell and captures its text output.
 *
 * The optional environment override is used for isolated temporary indexes.
 *
 * @throws {Error} when Git exits unsuccessfully or exceeds the timeout.
 */
export async function runGit(
  cwd: string,
  args: string[],
  environment?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          LC_ALL: 'C',
          ...environment,
        },
        maxBuffer: GIT_MAX_BUFFER_BYTES,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr })
          return
        }

        const detail = stderr.trim() || error.message
        reject(
          new Error(
            `Git command failed in "${cwd}": git ${args.join(' ')}: ${detail}`,
            { cause: error },
          ),
        )
      },
    )
  })
}

/**
 * Reports whether a directory belongs to a Git working tree.
 */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const result = await runGit(dir, ['rev-parse', '--is-inside-work-tree'])
    return result.stdout.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Resolves a ref to a concrete commit SHA.
 *
 * @throws {Error} when the ref does not identify a commit.
 */
export async function resolveCommit(repoRoot: string, ref: string): Promise<string> {
  const result = await runGit(repoRoot, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ])
  const commit = result.stdout.trim()
  if (!commit) {
    throw new Error(`Git ref "${ref}" resolved to an empty commit in "${repoRoot}"`)
  }
  return commit
}
