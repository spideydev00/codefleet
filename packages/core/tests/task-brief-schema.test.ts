/**
 * @fileoverview Tests for CodeFleet task-brief validation.
 */

import { describe, expect, it } from 'vitest'
import { CodeFleetValidationError } from '../src/errors.js'
import { parseTaskBrief } from '../src/task-brief.js'

describe('parseTaskBrief', () => {
  it('parses a valid brief and fills collection defaults', () => {
    const brief = parseTaskBrief({
      id: 'task-1',
      title: 'Add parser',
      description: 'Implement the parser foundation.',
    })

    expect(brief).toEqual({
      id: 'task-1',
      title: 'Add parser',
      description: 'Implement the parser foundation.',
      dependsOn: [],
      fileScope: [],
      acceptance: [],
    })
  })

  it.each(['id', 'title', 'description'] as const)(
    'rejects a brief missing %s',
    field => {
      const raw: Record<string, string> = {
        id: 'task-1',
        title: 'Add parser',
        description: 'Implement the parser foundation.',
      }
      delete raw[field]

      expect(() => parseTaskBrief(raw)).toThrow(CodeFleetValidationError)
    },
  )

  it('throws the dedicated validation error type', () => {
    let error: unknown

    try {
      parseTaskBrief({})
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(CodeFleetValidationError)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('CodeFleetValidationError')
  })
})
