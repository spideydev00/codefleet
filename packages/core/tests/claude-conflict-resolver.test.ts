/**
 * @fileoverview Tests for Claude-backed whole-file conflict resolution.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeConflictResolver } from '../src/claude/conflict-resolver.js'
import type { MergeConflict } from '../src/merge/conflict.js'

let testRoot: string
let executable: string

const conflict: MergeConflict = {
  taskId: 'task-1',
  branch: 'codefleet/run/task-1',
  files: [{
    path: 'src/value.ts',
    markedContent: [
      '<<<<<<< HEAD',
      'export const value = 1',
      '=======',
      'export const value = 2',
      '>>>>>>> task',
    ].join('\n'),
  }],
}

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'codefleet-claude-resolver-'))
  executable = join(testRoot, 'fake-claude.mjs')
  await writeFile(executable, `
const mode = process.argv[2]
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  if (mode === 'valid') {
    if (!input.includes('src/value.ts') || !input.includes('<<<<<<< HEAD')) process.exit(9)
    console.log(\`\\\`\\\`\\\`json
{"files":[{"path":"src/value.ts","resolvedContent":"export const value = 3\\\\n"}],"rationale":"Combined both values.","unresolved":[]}
\\\`\\\`\\\`\`)
  } else if (mode === 'garbage') {
    console.log('not a resolution')
  } else if (mode === 'nonzero') {
    process.stderr.write('resolver failed')
    process.exitCode = 2
  }
})
`)
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

function resolver(mode: string): ClaudeConflictResolver {
  return new ClaudeConflictResolver({
    command: process.execPath,
    baseArgs: [executable, mode],
    cwd: testRoot,
  })
}

describe('ClaudeConflictResolver', () => {
  it('returns a parsed complete resolution', async () => {
    await expect(resolver('valid').resolve(conflict)).resolves.toEqual({
      files: [{
        path: 'src/value.ts',
        resolvedContent: 'export const value = 3\n',
      }],
      rationale: 'Combined both values.',
      unresolved: [],
    })
  })

  it('returns undefined for invalid output', async () => {
    await expect(resolver('garbage').resolve(conflict)).resolves.toBeUndefined()
  })

  it('returns undefined for a failed Claude process', async () => {
    await expect(resolver('nonzero').resolve(conflict)).resolves.toBeUndefined()
  })

  it('never throws when Claude cannot start', async () => {
    const missing = new ClaudeConflictResolver({
      command: join(testRoot, 'missing-claude'),
      cwd: testRoot,
    })

    await expect(missing.resolve(conflict)).resolves.toBeUndefined()
  })
})
