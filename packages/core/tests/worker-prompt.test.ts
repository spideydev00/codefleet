/**
 * @fileoverview Tests for implementation-only worker prompt construction.
 */

import { describe, expect, it } from 'vitest'
import type { TaskBrief } from '../src/task-brief.js'
import { buildWorkerPrompt } from '../src/worker/prompt.js'

describe('buildWorkerPrompt', () => {
  it('includes the complete brief and required JSON result instructions', () => {
    const brief: TaskBrief = {
      id: 'task-1',
      title: 'Add the worker',
      description: 'Implement the concrete worker layer.',
      dependsOn: ['phase-b'],
      fileScope: ['packages/core/src/codefleet/worker/**'],
      acceptance: ['Focused tests pass', 'No shell invocation'],
    }

    const prompt = buildWorkerPrompt(brief)

    expect(prompt).toContain('current working directory only')
    expect(prompt).toContain('task-1')
    expect(prompt).toContain('Add the worker')
    expect(prompt).toContain('Implement the concrete worker layer.')
    expect(prompt).toContain('phase-b')
    expect(prompt).toContain('packages/core/src/codefleet/worker/**')
    expect(prompt).toContain('Focused tests pass')
    expect(prompt).toContain('No shell invocation')
    expect(prompt).toContain('exactly one fenced ```json block')
    expect(prompt).toContain('"taskId"')
    expect(prompt).toContain('"nextRecommendations"')
  })
})
