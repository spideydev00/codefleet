/**
 * @fileoverview Worker semantic output and runner execution records.
 */

import { z } from 'zod'
import type { WorkerKind } from './worker-kind.js'

/**
 * Schema for one test command reported by a worker.
 */
export const testRunSchema = z.object({
  command: z.string(),
  passed: z.boolean(),
  output: z.string().optional(),
})

/**
 * Schema for worker-emitted semantic task output.
 */
export const workerResultSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(['success', 'failure']),
  summary: z.string(),
  diffNotes: z.string().default(''),
  risks: z.array(z.string()).default([]),
  testsRun: z.array(testRunSchema).default([]),
  failures: z.array(z.string()).default([]),
  nextRecommendations: z.array(z.string()).default([]),
})

/**
 * Semantic output emitted by a worker.
 */
export type WorkerResult = z.infer<typeof workerResultSchema>

/**
 * Full runner-owned execution record for one task.
 */
export interface WorkerRunRecord {
  readonly taskId: string
  readonly worker: WorkerKind
  readonly result: WorkerResult
  /** Runner-derived changed paths; empty until change detection is implemented. */
  readonly changedFiles: readonly string[]
  /** Runner-derived unified diff; empty until diff collection is implemented. */
  readonly diff: string
  readonly exitCode: number | null
  readonly durationMs: number
  readonly stdout: string
  readonly stderr: string
  readonly parseError?: string
}

/**
 * Creates a schema-valid failure result for a worker or parser failure.
 */
export function synthesizeFailureResult(taskId: string, reason: string): WorkerResult {
  return {
    taskId,
    status: 'failure',
    summary: `Worker failed: ${reason}`,
    diffNotes: '',
    risks: [],
    testsRun: [],
    failures: [reason],
    nextRecommendations: [],
  }
}

/**
 * Extracts the last usable JSON value from worker output.
 *
 * Prefers the last tagged JSON fence, then scans balanced top-level object
 * spans while ignoring braces inside escaped double-quoted strings.
 */
export function extractTrailingJson(text: string): unknown | undefined {
  const fencePattern = /```json\s*([\s\S]*?)```/gi
  let lastFence: string | undefined

  for (const match of text.matchAll(fencePattern)) {
    lastFence = match[1]
  }

  if (lastFence !== undefined) {
    try {
      return JSON.parse(lastFence.trim())
    } catch {
      // Fall through to balanced-object extraction.
    }
  }

  const spans: Array<readonly [start: number, end: number]> = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"' && depth > 0) {
      inString = true
    } else if (char === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (char === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        spans.push([start, index + 1])
        start = -1
      }
    }
  }

  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index]
    if (!span) continue

    try {
      return JSON.parse(text.slice(span[0], span[1]))
    } catch {
      // Continue to the previous complete object.
    }
  }

  return undefined
}

/**
 * Parses worker text into a semantic result without throwing.
 *
 * The runner-owned task id always replaces a worker-supplied task id.
 */
export function parseWorkerResult(
  taskId: string,
  rawText: string,
): { result: WorkerResult; parseError?: string } {
  const extracted = extractTrailingJson(rawText)
  if (extracted === undefined) {
    const message = 'No WorkerResult JSON found in output'
    return {
      result: synthesizeFailureResult(taskId, message),
      parseError: message,
    }
  }

  const parsed = workerResultSchema.safeParse(extracted)
  if (!parsed.success) {
    const message = parsed.error.message
    return {
      result: synthesizeFailureResult(taskId, message),
      parseError: message,
    }
  }

  return {
    result: {
      ...parsed.data,
      taskId,
    },
  }
}
