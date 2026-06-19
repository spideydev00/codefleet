/**
 * @fileoverview Schema and parser for executable Forge task briefs.
 */

import { z } from 'zod'
import { ForgeValidationError } from './errors.js'

/**
 * Schema for a self-contained task assigned to a worker.
 */
export const taskBriefSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  fileScope: z.array(z.string()).default([]),
  acceptance: z.array(z.string()).default([]),
})

/**
 * Validated, defaults-filled task brief.
 */
export type TaskBrief = z.infer<typeof taskBriefSchema>

/**
 * Validates unknown input as a task brief.
 *
 * @throws {ForgeValidationError} when the input violates the schema.
 */
export function parseTaskBrief(raw: unknown): TaskBrief {
  const parsed = taskBriefSchema.safeParse(raw)
  if (parsed.success) return parsed.data

  const issues = parsed.error.issues
    .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
  throw new ForgeValidationError(`Invalid TaskBrief: ${issues}`)
}
