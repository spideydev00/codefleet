/**
 * @fileoverview Schema and DAG validation for planned Forge tasks.
 */

import { z } from 'zod'
import { ForgeValidationError } from './errors.js'

/**
 * Schema for one task produced by planning.
 */
export const plannedTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  fileScope: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
})

/**
 * Validated, defaults-filled planned task.
 */
export type PlannedTask = z.infer<typeof plannedTaskSchema>

/**
 * Schema for a non-empty task plan.
 */
export const tasksPlanSchema = z.object({
  tasks: z.array(plannedTaskSchema).min(1),
})

/**
 * Validated task plan with DAG integrity.
 */
export type TasksPlan = z.infer<typeof tasksPlanSchema>

function findCycleMembers(
  tasks: readonly PlannedTask[],
  remaining: ReadonlySet<string>,
): string[] {
  const dependencies = new Map(
    tasks.map(task => [
      task.id,
      task.dependsOn.filter(dependency => remaining.has(dependency)),
    ]),
  )

  return tasks
    .map(task => task.id)
    .filter(id => remaining.has(id))
    .filter(start => {
      const visited = new Set<string>()
      const stack = [...(dependencies.get(start) ?? [])]

      while (stack.length > 0) {
        const current = stack.pop()
        if (current === undefined) continue
        if (current === start) return true
        if (visited.has(current)) continue

        visited.add(current)
        stack.push(...(dependencies.get(current) ?? []))
      }

      return false
    })
}

/**
 * Validates a task plan schema and enforces dependency DAG integrity.
 *
 * @throws {ForgeValidationError} for schema, identity, reference, or cycle errors.
 */
export function parseTasksPlan(raw: unknown): TasksPlan {
  const parsed = tasksPlanSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new ForgeValidationError(`Invalid TasksPlan: ${issues}`)
  }

  const plan = parsed.data
  const ids = new Set<string>()

  for (const task of plan.tasks) {
    if (ids.has(task.id)) {
      throw new ForgeValidationError(`Duplicate task id: ${task.id}`)
    }
    ids.add(task.id)
  }

  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) {
      if (dependency === task.id) {
        throw new ForgeValidationError(`Task "${task.id}" cannot depend on itself`)
      }
      if (!ids.has(dependency)) {
        throw new ForgeValidationError(
          `Task "${task.id}" depends on non-existent task "${dependency}"`,
        )
      }
    }
  }

  const inDegree = new Map(plan.tasks.map(task => [task.id, task.dependsOn.length]))
  const dependents = new Map<string, string[]>()

  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) {
      const entries = dependents.get(dependency) ?? []
      entries.push(task.id)
      dependents.set(dependency, entries)
    }
  }

  const queue = plan.tasks
    .filter(task => inDegree.get(task.id) === 0)
    .map(task => task.id)
  let processed = 0

  for (let index = 0; index < queue.length; index += 1) {
    const taskId = queue[index]
    if (taskId === undefined) continue
    processed += 1

    for (const dependent of dependents.get(taskId) ?? []) {
      const nextDegree = (inDegree.get(dependent) ?? 0) - 1
      inDegree.set(dependent, nextDegree)
      if (nextDegree === 0) queue.push(dependent)
    }
  }

  if (processed !== plan.tasks.length) {
    const remaining = new Set(
      plan.tasks
        .map(task => task.id)
        .filter(id => (inDegree.get(id) ?? 0) > 0),
    )
    const cycleMembers = findCycleMembers(plan.tasks, remaining)
    throw new ForgeValidationError(
      `Task dependency cycle detected involving: ${cycleMembers.join(', ')}`,
    )
  }

  return plan
}
