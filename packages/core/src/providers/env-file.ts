/**
 * @fileoverview Shell-style env file parser for running providers without a shell.
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Parses a shell-style env file (e.g. .env, ~/.claude-kimi-env).
 * Supports `export KEY=VALUE` or `KEY=VALUE`.
 * Ignores blanks and comments (#).
 * Strips surrounding quotes.
 * Expands leading `~` to the user's home directory for paths.
 */
export async function loadEnvFile(path: string): Promise<Record<string, string>> {
  const resolvedPath = path.startsWith('~/')
    ? join(homedir(), path.slice(2))
    : path

  try {
    const content = await readFile(resolvedPath, 'utf8')
    const env: Record<string, string> = {}

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      // Handle optional 'export ' prefix
      const decl = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
      
      const equalIdx = decl.indexOf('=')
      if (equalIdx === -1) continue

      const key = decl.slice(0, equalIdx).trim()
      let value = decl.slice(equalIdx + 1).trim()

      // Strip quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (key) {
        env[key] = value
      }
    }

    return env
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    throw error
  }
}
