/**
 * @fileoverview Pure planning prompt construction.
 */

import type { RepoSnapshot } from './repo-inspector.js'

/**
 * Builds a repository-aware task-planning instruction.
 */
export function buildPlanningPrompt(
  userPrompt: string,
  snapshot: RepoSnapshot,
): string {
  return [
    'Create an implementation task plan for the following repository request.',
    '',
    'User request:',
    userPrompt,
    '',
    `Repository root: ${snapshot.root}`,
    `Tracked files${snapshot.truncated ? ' (truncated)' : ''}:`,
    snapshot.files.length > 0
      ? snapshot.files.map(file => `- ${file}`).join('\n')
      : '- No tracked files',
    '',
    'Return only one fenced ```json block matching this TasksPlan shape:',
    '```json',
    JSON.stringify({
      tasks: [{
        id: 'stable-task-id',
        title: 'Short task title',
        description: 'Self-contained implementation instructions',
        fileScope: ['relative/path'],
        dependsOn: [],
      }],
    }, null, 2),
    '```',
    'Use unique non-empty task IDs.',
    'Dependencies must reference real task IDs and form an acyclic graph.',
    'Keep each task implementation-ready and limit fileScope to repository-relative paths.',
  ].join('\n')
}
