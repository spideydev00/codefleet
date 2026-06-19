/**
 * @fileoverview Schema and parser for whole-file conflict resolutions.
 */

import { z } from 'zod'
import { extractTrailingJson } from './worker-result.js'

/**
 * Schema for one fully resolved file.
 */
export const resolvedFileSchema = z.object({
  path: z.string().min(1),
  resolvedContent: z.string(),
})

/**
 * Schema for a conflict-resolution response.
 */
export const conflictResolutionSchema = z.object({
  files: z.array(resolvedFileSchema).default([]),
  rationale: z.string().default(''),
  unresolved: z.array(z.string()).default([]),
})

/**
 * Validated, defaults-filled conflict resolution.
 */
export type ConflictResolution = z.infer<typeof conflictResolutionSchema>

/**
 * Parses conflict-resolution text without throwing.
 */
export function parseConflictResolution(
  rawText: string,
): { resolution?: ConflictResolution; parseError?: string } {
  const extracted = extractTrailingJson(rawText)
  if (extracted === undefined) {
    return { parseError: 'No ConflictResolution JSON found in output' }
  }

  const parsed = conflictResolutionSchema.safeParse(extracted)
  if (!parsed.success) {
    return { parseError: parsed.error.message }
  }

  return { resolution: parsed.data }
}
