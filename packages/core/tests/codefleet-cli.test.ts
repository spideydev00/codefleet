/**
 * @fileoverview Tests for the injectable CodeFleet command-line interface.
 */

import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli/codefleet-cli.js'
import type { RunCodeFleetOptions } from '../src/orchestrator/run-codefleet.js'
import type { CodeFleetReport } from '../src/report-types.js'

function report(status: CodeFleetReport['status']): CodeFleetReport {
  return {
    runId: 'run-1',
    userPrompt: 'Test prompt',
    plan: [],
    tasks: [],
    merges: [],
    totals: {
      tasks: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      merged: 0,
      conflictsResolved: 0,
      durationMs: 1,
    },
    status,
  }
}

describe('runCli', () => {
  it.each(['--help', '-h'])('prints usage to stdout for %s', async flag => {
    const output: string[] = []
    const errors: string[] = []
    let called = false

    const exitCode = await runCli(['--unknown', flag], {
      runCodeFleet: async () => {
        called = true
        return { report: report('success'), rendered: '' }
      },
      stdout: text => output.push(text),
      stderr: text => errors.push(text),
    })

    expect(exitCode).toBe(0)
    expect(called).toBe(false)
    expect(output[0]).toContain('Usage: codefleet')
    expect(errors).toEqual([])
  })

  it.each([
    ['success', 0],
    ['partial', 1],
    ['failed', 2],
  ] as const)('returns the exit code for %s reports', async (status, exitCode) => {
    const output: string[] = []

    const result = await runCli(['Test prompt'], {
      runCodeFleet: async () => ({
        report: report(status),
        rendered: `rendered ${status}`,
      }),
      stdout: text => output.push(text),
    })

    expect(result).toBe(exitCode)
    expect(output).toEqual([`rendered ${status}`])
  })

  it('parses supported flags and prints JSON output', async () => {
    let received: RunCodeFleetOptions | undefined
    const output: string[] = []

    const exitCode = await runCli([
      '--prompt',
      'Build it',
      '--repo',
      '/tmp/repo',
      '--base',
      'main',
      '--max-parallel',
      '3',
      '--timeout',
      '5000',
      '--keep',
      '--json',
    ], {
      runCodeFleet: async options => {
        received = options
        return { report: report('success'), rendered: 'ignored' }
      },
      stdout: text => output.push(text),
    })

    expect(exitCode).toBe(0)
    expect(received).toEqual({
      repoRoot: '/tmp/repo',
      userPrompt: 'Build it',
      baseRef: 'main',
      maxParallel: 3,
      taskTimeoutMs: 5000,
      keepWorkspaces: true,
    })
    expect(JSON.parse(output[0] ?? '')).toEqual(report('success'))
  })

  it('prints usage and returns 64 for invalid arguments', async () => {
    const errors: string[] = []
    let called = false

    const exitCode = await runCli(['--unknown'], {
      runCodeFleet: async () => {
        called = true
        return { report: report('success'), rendered: '' }
      },
      stderr: text => errors.push(text),
    })

    expect(exitCode).toBe(64)
    expect(called).toBe(false)
    expect(errors[0]).toContain('Usage: codefleet')
  })

  it('prints thrown errors and returns 3 without throwing', async () => {
    const errors: string[] = []

    const run = runCli(['Test prompt'], {
      runCodeFleet: async () => {
        throw new Error('Planning failed')
      },
      stderr: text => errors.push(text),
    })

    await expect(run).resolves.toBe(3)
    expect(errors).toEqual(['Planning failed'])
  })
})
