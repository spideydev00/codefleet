/**
 * @fileoverview Tests for CodeFleet planned-task DAG validation.
 */

import { describe, expect, it } from 'vitest'
import { CodeFleetValidationError } from '../src/errors.js'
import { parseTasksPlan } from '../src/tasks-schema.js'

function task(id: string, dependsOn?: string[]) {
  return {
    id,
    title: `Task ${id}`,
    description: `Implement task ${id}.`,
    ...(dependsOn === undefined ? {} : { dependsOn }),
  }
}

describe('parseTasksPlan', () => {
  it('parses a valid plan and fills defaults', () => {
    const plan = parseTasksPlan({ tasks: [task('a')] })

    expect(plan.tasks[0]).toEqual({
      id: 'a',
      title: 'Task a',
      description: 'Implement task a.',
      fileScope: [],
      dependsOn: [],
    })
  })

  it('rejects an empty task list', () => {
    expect(() => parseTasksPlan({ tasks: [] })).toThrow(CodeFleetValidationError)
  })

  it('rejects duplicate task ids', () => {
    expect(() => parseTasksPlan({ tasks: [task('a'), task('a')] })).toThrow(
      /Duplicate task id: a/,
    )
  })

  it('rejects a dangling dependency', () => {
    expect(() => parseTasksPlan({ tasks: [task('a', ['missing'])] })).toThrow(
      /non-existent task "missing"/,
    )
  })

  it('rejects a self-dependency', () => {
    expect(() => parseTasksPlan({ tasks: [task('a', ['a'])] })).toThrow(
      /Task "a" cannot depend on itself/,
    )
  })

  it('rejects a two-node cycle and names both members', () => {
    expect(() =>
      parseTasksPlan({
        tasks: [
          task('a', ['b']),
          task('b', ['a']),
        ],
      }),
    ).toThrow(/cycle detected involving: a, b/)
  })

  it('rejects a three-node cycle and names every member', () => {
    expect(() =>
      parseTasksPlan({
        tasks: [
          task('a', ['c']),
          task('b', ['a']),
          task('c', ['b']),
        ],
      }),
    ).toThrow(/cycle detected involving: a, b, c/)
  })

  it('accepts a linear dependency chain', () => {
    const plan = parseTasksPlan({
      tasks: [
        task('a'),
        task('b', ['a']),
        task('c', ['b']),
      ],
    })

    expect(plan.tasks.map(entry => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('accepts a diamond DAG', () => {
    const plan = parseTasksPlan({
      tasks: [
        task('a'),
        task('b', ['a']),
        task('c', ['a']),
        task('d', ['b', 'c']),
      ],
    })

    expect(plan.tasks).toHaveLength(4)
  })
})
