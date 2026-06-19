/**
 * @fileoverview Integration tests for the non-shell Claude CLI wrapper.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runClaude } from '../../src/forge/claude/claude-cli.js'

let testRoot: string
let executable: string

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'forge-claude-cli-'))
  executable = join(testRoot, 'fake-claude.mjs')
  await writeFile(executable, `
const mode = process.argv[2]
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  if (mode === 'stdin') process.stdout.write(input)
  else if (mode === 'arg') process.stdout.write(process.argv[3] ?? '')
  else if (mode === 'env') {
    process.stdout.write(\`\${process.env.CODEFLEET_TEST_VAR}:\${Boolean(process.env.PATH)}\`)
  } else if (mode === 'nonzero') {
    process.stderr.write('claude failed')
    process.exitCode = 7
  } else if (mode === 'sleep') {
    setTimeout(() => {}, 10_000)
  }
})
`)
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

function options(mode: string) {
  return {
    command: process.execPath,
    baseArgs: [executable, mode],
    cwd: testRoot,
  }
}

describe('runClaude', () => {
  it('passes prompts through stdin by default', async () => {
    const result = await runClaude('stdin prompt', options('stdin'))

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('stdin prompt')
  })

  it('passes prompts as an argument when configured', async () => {
    const result = await runClaude('argument prompt', {
      ...options('arg'),
      passPromptVia: 'arg',
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('argument prompt')
  })

  it('encodes non-zero exits without throwing', async () => {
    const result = await runClaude('prompt', options('nonzero'))

    expect(result.exitCode).toBe(7)
    expect(result.stderr).toBe('claude failed')
  })

  it('kills and records a timed-out process', async () => {
    const result = await runClaude('prompt', {
      ...options('sleep'),
      timeoutMs: 20,
    })

    expect(result.timedOut).toBe(true)
    expect(result.stderr).toContain('timed out after 20ms')
  })

  it('kills and records an aborted process', async () => {
    const controller = new AbortController()
    const run = runClaude('prompt', {
      ...options('sleep'),
      abortSignal: controller.signal,
    })
    setTimeout(() => controller.abort(), 20)

    const result = await run

    expect(result.stderr).toContain('Process aborted')
  })

  it('extends the inherited environment with custom variables', async () => {
    const result = await runClaude('prompt', {
      command: 'node',
      baseArgs: [executable, 'env'],
      cwd: testRoot,
      env: { CODEFLEET_TEST_VAR: 'present' },
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('present:true')
  })
})
