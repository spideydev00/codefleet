/**
 * @fileoverview Tests for CodeFleet conflict-resolution parsing.
 */

import { describe, expect, it } from 'vitest'
import { parseConflictResolution } from '../src/resolution-schema.js'

describe('parseConflictResolution', () => {
  it('parses fenced resolution JSON and fills defaults', () => {
    const raw = [
      'Resolution:',
      '```json',
      '{"files":[{"path":"src/a.ts","resolvedContent":"export const a = 1\\n"}]}',
      '```',
    ].join('\n')

    expect(parseConflictResolution(raw)).toEqual({
      resolution: {
        files: [
          {
            path: 'src/a.ts',
            resolvedContent: 'export const a = 1\n',
          },
        ],
        rationale: '',
        unresolved: [],
      },
    })
  })

  it('parses bare resolution JSON with optional unresolved entries', () => {
    const raw = [
      'Prepared result.',
      '{"files":[],"rationale":"Manual choice","unresolved":["src/b.ts"]}',
    ].join('\n')

    expect(parseConflictResolution(raw)).toEqual({
      resolution: {
        files: [],
        rationale: 'Manual choice',
        unresolved: ['src/b.ts'],
      },
    })
  })

  it('returns only a parse error for garbage and never throws', () => {
    expect(() => parseConflictResolution('not JSON')).not.toThrow()

    const parsed = parseConflictResolution('not JSON')
    expect(parsed.resolution).toBeUndefined()
    expect(parsed.parseError).toBeDefined()
  })
})
