/**
 * @fileoverview Tests for Forge task-brief validation.
 */

import { describe, expect, it } from 'vitest'
import { ForgeValidationError } from '../../src/forge/errors.js'
import { parseTaskBrief } from '../../src/forge/task-brief.js'

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

      expect(() => parseTaskBrief(raw)).toThrow(ForgeValidationError)
    },
  )

  it('throws the dedicated validation error type', () => {
    let error: unknown

    try {
      parseTaskBrief({})
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ForgeValidationError)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('ForgeValidationError')
  })
})
