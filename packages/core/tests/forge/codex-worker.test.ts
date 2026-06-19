/**
 * @fileoverview Integration tests for the Codex CLI worker adapter.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TaskBrief } from '../../src/forge/task-brief.js'
import { CodexWorker } from '../../src/forge/worker/codex-worker.js'

let testRoot: string
let executable: string

const brief: TaskBrief = {
  id: 'brief-task',
  title: 'Test task',
  description: 'Return a deterministic worker result.',
  dependsOn: [],
  fileScope: [],
  acceptance: [],
}

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'forge-codex-worker-'))
  executable = join(testRoot, 'fake-codex.mjs')
  await writeFile(executable, `
const mode = process.argv[2]
if (mode === 'success') {
  console.log('received prompt:', process.argv[3])
  console.log(\`\\\`\\\`\\\`json
{"taskId":"wrong-task","status":"success","summary":"Implemented","diffNotes":"Changed files","risks":[],"testsRun":[],"failures":[],"nextRecommendations":[]}
\\\`\\\`\\\`\`)
} else if (mode === 'missing') {
  console.log('finished without structured output')
} else if (mode === 'nonzero') {
  console.error('worker failed')
  process.exitCode = 7
} else if (mode === 'sleep') {
  setTimeout(() => {}, 10_000)
} else if (mode === 'env') {
  console.log(\`\\\`\\\`\\\`json
{"taskId":"env-task","status":"success","summary":"\${process.env.CODEFLEET_TEST_VAR}:\${Boolean(process.env.PATH)}"}
\\\`\\\`\\\`\`)
}
`)
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

function createWorker(mode: string): CodexWorker {
  return new CodexWorker({
    command: process.execPath,
    baseArgs: [executable, mode],
  })
}

function context(overrides: {
  abortSignal?: AbortSignal
  timeoutMs?: number
} = {}) {
  return {
    workspaceDir: testRoot,
    runId: 'run-1',
    taskId: 'runner-task',
    ...overrides,
  }
}

describe('CodexWorker', () => {
  it('passes the prompt as an argument and parses the worker result', async () => {
    const record = await createWorker('success').run(brief, context())

    expect(record.exitCode).toBe(0)
    expect(record.worker).toBe('codex')
    expect(record.result).toMatchObject({
      taskId: 'runner-task',
      status: 'success',
      summary: 'Implemented',
    })
    expect(record.stdout).toContain('current working directory only')
    expect(record.changedFiles).toEqual([])
    expect(record.diff).toBe('')
    expect(record.parseError).toBeUndefined()
  })

  it('returns a parser failure when structured output is missing', async () => {
    const record = await createWorker('missing').run(brief, context())

    expect(record.result.status).toBe('failure')
    expect(record.parseError).toContain('No WorkerResult JSON found')
  })

  it('records a non-zero exit without throwing', async () => {
    const worker = createWorker('nonzero')
    const record = await worker.run(brief, context())

    expect(record.exitCode).toBe(7)
    expect(record.stderr).toContain('worker failed')
    expect(record.result.status).toBe('failure')
    expect(record.parseError).toContain('No WorkerResult JSON found')
  })

  it('kills and records a timed-out process', async () => {
    const record = await createWorker('sleep').run(brief, context({ timeoutMs: 20 }))

    expect(record.result.status).toBe('failure')
    expect(record.parseError).toContain('timed out after 20ms')
    expect(record.stderr).toContain('timed out after 20ms')
  })

  it('kills and records an aborted process', async () => {
    const controller = new AbortController()
    const run = createWorker('sleep').run(
      brief,
      context({ abortSignal: controller.signal }),
    )
    setTimeout(() => controller.abort(), 20)

    const record = await run

    expect(record.result.status).toBe('failure')
    expect(record.parseError).toBe('Process aborted')
    expect(record.stderr).toContain('Process aborted')
  })

  it('checks command availability with --version', async () => {
    await expect(createWorker('unused').healthcheck()).resolves.toBe(true)
  })

  it('extends the inherited environment with custom variables', async () => {
    const worker = new CodexWorker({
      command: 'node',
      baseArgs: [executable, 'env'],
      env: { CODEFLEET_TEST_VAR: 'present' },
    })

    const record = await worker.run(brief, context())

    expect(record.exitCode).toBe(0)
    expect(record.result).toMatchObject({
      status: 'success',
      summary: 'present:true',
    })
  })
})
