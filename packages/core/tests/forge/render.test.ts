/**
 * @fileoverview Tests for English Markdown Forge reports.
 */

import { describe, expect, it } from 'vitest'
import { renderReport } from '../../src/forge/report/render.js'
import type { ForgeReport } from '../../src/forge/report-types.js'

describe('renderReport', () => {
  it('renders totals, outcomes, merge details, and attention items', () => {
    const report: ForgeReport = {
      runId: 'run-1',
      userPrompt: 'Implement the requested changes.',
      plan: [
        {
          id: 'success',
          title: 'Successful task',
          description: 'Succeeds.',
          fileScope: [],
          dependsOn: [],
        },
        {
          id: 'failed',
          title: 'Failed task',
          description: 'Fails.',
          fileScope: [],
          dependsOn: [],
        },
        {
          id: 'skipped',
          title: 'Skipped task',
          description: 'Is skipped.',
          fileScope: [],
          dependsOn: ['failed'],
        },
      ],
      tasks: [
        {
          taskId: 'success',
          title: 'Successful task',
          outcome: 'succeeded',
        },
        {
          taskId: 'failed',
          title: 'Failed task',
          outcome: 'failed',
          record: {
            taskId: 'failed',
            worker: 'fake-codex',
            result: {
              taskId: 'failed',
              status: 'failure',
              summary: 'Compilation failed.',
              diffNotes: '',
              risks: [],
              testsRun: [],
              failures: ['Compilation failed.'],
              nextRecommendations: [],
            },
            changedFiles: [],
            diff: '',
            exitCode: 1,
            durationMs: 12,
            stdout: '',
            stderr: 'Compilation failed.',
          },
        },
        {
          taskId: 'skipped',
          title: 'Skipped task',
          outcome: 'skipped',
          skippedReason: 'Blocked by dependency "failed"',
        },
      ],
      merges: [
        { taskId: 'success', outcome: 'merged' },
        {
          taskId: 'failed',
          outcome: 'conflict-resolved',
          conflictFiles: ['src/value.ts'],
          resolutionRationale: 'Combined both implementations.',
        },
        {
          taskId: 'skipped',
          outcome: 'merge-aborted',
          note: 'Validation failed.',
        },
      ],
      totals: {
        tasks: 3,
        succeeded: 1,
        failed: 1,
        skipped: 1,
        merged: 2,
        conflictsResolved: 1,
        durationMs: 45,
      },
      status: 'partial',
    }

    const rendered = renderReport(report)

    expect(rendered).toContain('# Forge Report')
    expect(rendered).toContain('`run-1`')
    expect(rendered).toContain('Final status: **partial**')
    expect(rendered).toContain('Tasks: 3')
    expect(rendered).toContain('Conflicts resolved: 1')
    expect(rendered).toContain('Compilation failed.')
    expect(rendered).toContain('Blocked by dependency "failed"')
    expect(rendered).toContain('**conflict-resolved**')
    expect(rendered).toContain('`src/value.ts`')
    expect(rendered).toContain('Combined both implementations.')
    expect(rendered).toContain('## Needs attention')
    expect(rendered).toContain('Failed task `failed`')
    expect(rendered).toContain('Skipped task `skipped`')
    expect(rendered).toContain('Aborted merge `skipped`: Validation failed.')
  })

  it('truncates over-long failure summaries', () => {
    const longSummary = 'x'.repeat(5_000)
    const report: ForgeReport = {
      runId: 'run-2',
      userPrompt: 'Fail.',
      plan: [],
      tasks: [{
        taskId: 'failed',
        title: 'Failed task',
        outcome: 'failed',
        record: {
          taskId: 'failed',
          worker: 'fake-codex',
          result: {
            taskId: 'failed',
            status: 'failure',
            summary: longSummary,
            diffNotes: '',
            risks: [],
            testsRun: [],
            failures: [longSummary],
            nextRecommendations: [],
          },
          changedFiles: [],
          diff: '',
          exitCode: 1,
          durationMs: 1,
          stdout: '',
          stderr: longSummary,
        },
      }],
      merges: [{ taskId: 'failed', outcome: 'not-merged' }],
      totals: {
        tasks: 1,
        succeeded: 0,
        failed: 1,
        skipped: 0,
        merged: 0,
        conflictsResolved: 0,
        durationMs: 1,
      },
      status: 'failed',
    }

    const rendered = renderReport(report)

    expect(rendered).toContain('… (truncated)')
    expect(rendered).not.toContain(longSummary)
  })
})
