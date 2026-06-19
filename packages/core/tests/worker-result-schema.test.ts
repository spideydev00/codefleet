/**
 * @fileoverview Tests for CodeFleet worker-result extraction and validation.
 */

import { describe, expect, it } from 'vitest'
import {
  extractTrailingJson,
  parseWorkerResult,
} from '../src/worker-result.js'

describe('parseWorkerResult', () => {
  it('parses the last JSON fenced block and fills defaults', () => {
    const raw = [
      'Worker notes.',
      '```json',
      '{"taskId":"worker-task","status":"success","summary":"Done"}',
      '```',
    ].join('\n')

    expect(parseWorkerResult('task-1', raw)).toEqual({
      result: {
        taskId: 'task-1',
        status: 'success',
        summary: 'Done',
        diffNotes: '',
        risks: [],
        testsRun: [],
        failures: [],
        nextRecommendations: [],
      },
    })
  })

  it('parses a bare trailing object and fills defaults', () => {
    const raw = 'Finished.\n{"taskId":"task-2","status":"failure","summary":"Blocked"}'
    const parsed = parseWorkerResult('task-2', raw)

    expect(parsed.result).toEqual({
      taskId: 'task-2',
      status: 'failure',
      summary: 'Blocked',
      diffNotes: '',
      risks: [],
      testsRun: [],
      failures: [],
      nextRecommendations: [],
    })
    expect(parsed.parseError).toBeUndefined()
  })

  it('forces the runner task id over a worker-supplied mismatch', () => {
    const parsed = parseWorkerResult(
      'runner-task',
      '{"taskId":"wrong-task","status":"success","summary":"Done"}',
    )

    expect(parsed.result.taskId).toBe('runner-task')
  })

  it('returns a synthesized failure and parse error for garbage', () => {
    expect(() => parseWorkerResult('task-1', 'plain text only')).not.toThrow()

    const parsed = parseWorkerResult('task-1', 'plain text only')
    expect(parsed.result.status).toBe('failure')
    expect(parsed.result.failures[0]).toContain('No WorkerResult JSON found')
    expect(parsed.parseError).toContain('No WorkerResult JSON found')
  })

  it('returns a synthesized failure and parse error for invalid schema data', () => {
    const parsed = parseWorkerResult(
      'task-1',
      '{"taskId":"task-1","status":"unknown","summary":"Invalid"}',
    )

    expect(parsed.result.status).toBe('failure')
    expect(parsed.result.taskId).toBe('task-1')
    expect(parsed.parseError).toBeDefined()
    expect(parsed.result.failures[0]).toBe(parsed.parseError)
  })
})

describe('extractTrailingJson', () => {
  it('returns the last parseable top-level object', () => {
    const raw = 'First {"value":1}\nSecond {"value":2}'
    expect(extractTrailingJson(raw)).toEqual({ value: 2 })
  })

  it('ignores braces inside quoted JSON string values', () => {
    const raw = [
      'Earlier {"value":1}',
      '{"message":"literal { and } with \\"quoted { braces }\\"","value":2}',
    ].join('\n')

    expect(extractTrailingJson(raw)).toEqual({
      message: 'literal { and } with "quoted { braces }"',
      value: 2,
    })
  })

  it('ignores unmatched quotes in prose before a JSON object', () => {
    const raw = 'Worker said "unfinished prose before output\n{"value":2}'
    expect(extractTrailingJson(raw)).toEqual({ value: 2 })
  })

  it('returns undefined for non-JSON text', () => {
    expect(extractTrailingJson('no structured output')).toBeUndefined()
  })

  it('never throws for malformed objects and strings', () => {
    const malformed = 'prefix {"unterminated":"value with } and \\" quote"'
    expect(() => extractTrailingJson(malformed)).not.toThrow()
    expect(extractTrailingJson(malformed)).toBeUndefined()
  })
})
