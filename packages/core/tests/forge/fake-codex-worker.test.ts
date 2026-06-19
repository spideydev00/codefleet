/**
 * @fileoverview Tests for the deterministic fake Codex worker.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TaskBrief } from '../../src/forge/task-brief.js'
import { FakeCodexWorker } from '../../src/forge/worker/fake-codex-worker.js'

let testRoot: string

const brief: TaskBrief = {
  id: 'brief-task',
  title: 'Fake task',
  description: 'Run deterministically.',
  dependsOn: [],
  fileScope: [],
  acceptance: [],
}

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'forge-fake-worker-'))
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

function context() {
  return {
    workspaceDir: testRoot,
    runId: 'run-1',
    taskId: 'runner-task',
  }
}

describe('FakeCodexWorker', () => {
  it('returns a deterministic default success record', async () => {
    const record = await new FakeCodexWorker().run(brief, context())

    expect(record).toMatchObject({
      taskId: 'runner-task',
      worker: 'fake-codex',
      exitCode: 0,
      result: {
        taskId: 'runner-task',
        status: 'success',
        summary: 'Fake worker completed successfully',
      },
    })
  })

  it('writes configured files inside the workspace and applies result overrides', async () => {
    const worker = new FakeCodexWorker(async () => ({
      files: [{ path: 'nested/output.txt', content: 'written\n' }],
      result: { taskId: 'wrong-task', summary: 'Configured result' },
      stdout: 'fake output',
      exitCode: 3,
      delayMs: 1,
    }))

    const record = await worker.run(brief, context())

    await expect(readFile(join(testRoot, 'nested/output.txt'), 'utf8'))
      .resolves.toBe('written\n')
    expect(record.result.taskId).toBe('runner-task')
    expect(record.result.summary).toBe('Configured result')
    expect(record.stdout).toBe('fake output')
    expect(record.exitCode).toBe(3)
  })

  it('rejects path escape without throwing', async () => {
    const worker = new FakeCodexWorker(async () => ({
      files: [{ path: '../escaped.txt', content: 'no\n' }],
    }))

    const run = worker.run(brief, context())

    await expect(run).resolves.toMatchObject({
      exitCode: 1,
      result: {
        taskId: 'runner-task',
        status: 'failure',
      },
    })
    expect((await run).parseError).toContain('escapes workspace')
  })

  it('encodes handler failures instead of throwing', async () => {
    const worker = new FakeCodexWorker(async () => {
      throw new Error('programmed failure')
    })

    const run = worker.run(brief, context())

    await expect(run).resolves.toMatchObject({
      exitCode: 1,
      stderr: 'programmed failure',
      result: {
        status: 'failure',
        failures: ['programmed failure'],
      },
    })
  })
})
