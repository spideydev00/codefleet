/**
 * @fileoverview Compile-time and runtime coverage for Forge report types.
 */

import { describe, expect, it } from 'vitest'
import type { ForgeReport } from '../../src/forge/report-types.js'

describe('ForgeReport', () => {
  it('supports every task and merge outcome in a complete report', () => {
    const report: ForgeReport = {
      runId: 'run-1',
      userPrompt: 'Implement the foundation.',
      plan: [
        {
          id: 'a',
          title: 'Task a',
          description: 'Implement task a.',
          fileScope: ['src/a.ts'],
          dependsOn: [],
        },
        {
          id: 'b',
          title: 'Task b',
          description: 'Implement task b.',
          fileScope: [],
          dependsOn: ['a'],
        },
        {
          id: 'c',
          title: 'Task c',
          description: 'Implement task c.',
          fileScope: [],
          dependsOn: ['b'],
        },
      ],
      tasks: [
        {
          taskId: 'a',
          title: 'Task a',
          outcome: 'succeeded',
          record: {
            taskId: 'a',
            worker: 'fake-codex',
            result: {
              taskId: 'a',
              status: 'success',
              summary: 'Implemented.',
              diffNotes: '',
              risks: [],
              testsRun: [],
              failures: [],
              nextRecommendations: [],
            },
            changedFiles: [],
            diff: '',
            exitCode: 0,
            durationMs: 25,
            stdout: '',
            stderr: '',
          },
        },
        {
          taskId: 'b',
          title: 'Task b',
          outcome: 'failed',
        },
        {
          taskId: 'c',
          title: 'Task c',
          outcome: 'skipped',
          skippedReason: 'Dependency failed.',
        },
      ],
      merges: [
        { taskId: 'a', outcome: 'merged' },
        {
          taskId: 'b',
          outcome: 'conflict-resolved',
          conflictFiles: ['src/b.ts'],
          resolutionRationale: 'Combined both changes.',
        },
        { taskId: 'c', outcome: 'merge-aborted', note: 'Unsafe resolution.' },
        { taskId: 'd', outcome: 'not-merged' },
      ],
      totals: {
        tasks: 3,
        succeeded: 1,
        failed: 1,
        skipped: 1,
        merged: 2,
        conflictsResolved: 1,
        durationMs: 25,
      },
      status: 'partial',
    }

    expect(report.tasks.map(task => task.outcome)).toEqual([
      'succeeded',
      'failed',
      'skipped',
    ])
    expect(report.merges).toHaveLength(4)
    expect(report.status).toBe('partial')
  })
})
