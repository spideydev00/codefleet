/**
 * @fileoverview Prompt construction for implementation-only CodeFleet workers.
 */

import type { TaskBrief } from '../task-brief.js'

function list(items: string[], empty: string): string {
  return items.length > 0 ? items.map(item => `- ${item}`).join('\n') : empty
}

/**
 * Builds the complete implementation instruction for one task.
 */
export function buildWorkerPrompt(brief: TaskBrief): string {
  return [
    'Implement the following task in the current working directory only.',
    'Do not read from or write to any other working directory.',
    '',
    `Task ID: ${brief.id}`,
    `Title: ${brief.title}`,
    `Description: ${brief.description}`,
    '',
    'Dependencies:',
    list(brief.dependsOn, '- None'),
    '',
    'Allowed file scope:',
    list(brief.fileScope, '- No additional file restriction specified'),
    '',
    'Acceptance criteria:',
    list(brief.acceptance, '- No additional acceptance criteria specified'),
    '',
    'Respect the allowed file scope and satisfy every acceptance criterion.',
    'Finish by printing exactly one fenced ```json block matching this WorkerResult shape:',
    '```json',
    JSON.stringify({
      taskId: brief.id,
      status: 'success',
      summary: 'What was completed',
      diffNotes: 'Important implementation details',
      risks: [],
      testsRun: [{ command: 'test command', passed: true, output: 'optional output' }],
      failures: [],
      nextRecommendations: [],
    }, null, 2),
    '```',
  ].join('\n')
}
