/**
 * @fileoverview English Markdown rendering for completed Forge runs.
 */

import type { ForgeReport } from '../report-types.js'

function truncate(text: string, max = 4_000): string {
  return text.length > max
    ? `${text.slice(0, max)}… (truncated)`
    : text
}

/**
 * Renders a complete run report as English Markdown.
 */
export function renderReport(report: ForgeReport): string {
  const lines = [
    '# Forge Report',
    '',
    `- Run ID: \`${report.runId}\``,
    `- Request: ${report.userPrompt}`,
    `- Final status: **${report.status}**`,
    '',
    '## Totals',
    '',
    `- Tasks: ${report.totals.tasks}`,
    `- Succeeded: ${report.totals.succeeded}`,
    `- Failed: ${report.totals.failed}`,
    `- Skipped: ${report.totals.skipped}`,
    `- Merged: ${report.totals.merged}`,
    `- Conflicts resolved: ${report.totals.conflictsResolved}`,
    `- Duration: ${report.totals.durationMs} ms`,
    '',
    '## Tasks',
    '',
  ]

  for (const task of report.tasks) {
    lines.push(`### ${task.taskId}: ${task.title}`, '', `- Outcome: **${task.outcome}**`)
    if (task.outcome === 'failed') {
      lines.push(`- Failure: ${truncate(task.record?.result.summary ?? 'No failure summary provided')}`)
    }
    if (task.outcome === 'skipped') {
      lines.push(`- Reason: ${truncate(task.skippedReason ?? 'No skip reason provided')}`)
    }
    lines.push('')
  }

  lines.push('## Merges', '')
  for (const merge of report.merges) {
    lines.push(`### ${merge.taskId}`, '', `- Outcome: **${merge.outcome}**`)
    if (merge.conflictFiles?.length) {
      lines.push(`- Conflict files: ${merge.conflictFiles.map(path => `\`${path}\``).join(', ')}`)
    }
    if (merge.resolutionRationale) {
      lines.push(`- Resolution rationale: ${merge.resolutionRationale}`)
    }
    if (merge.note) lines.push(`- Note: ${truncate(merge.note)}`)
    lines.push('')
  }

  const attention = [
    ...report.tasks
      .filter(task => task.outcome === 'failed')
      .map(task => truncate(`- Failed task \`${task.taskId}\`: ${task.record?.result.summary ?? task.title}`)),
    ...report.tasks
      .filter(task => task.outcome === 'skipped')
      .map(task => truncate(`- Skipped task \`${task.taskId}\`: ${task.skippedReason ?? task.title}`)),
    ...report.merges
      .filter(merge => merge.outcome === 'merge-aborted')
      .map(merge => truncate(`- Aborted merge \`${merge.taskId}\`: ${merge.note ?? 'No reason provided'}`)),
  ]

  lines.push(
    '## Needs attention',
    '',
    ...(attention.length > 0 ? attention : ['- None']),
  )
  return `${lines.join('\n')}\n`
}
