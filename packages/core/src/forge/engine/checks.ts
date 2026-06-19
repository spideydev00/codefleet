/**
 * @fileoverview Injectable validation checks for integrated task changes.
 */

import { runProcess } from '../worker/process.js'

/**
 * Result of validating an integration worktree.
 */
export interface CheckResult {
  ok: boolean
  output: string
}

/**
 * Validates the current integration state.
 */
export interface CheckRunner {
  run(cwd: string): Promise<CheckResult>
}

/**
 * One non-shell validation command.
 */
export interface CheckCommand {
  command: string
  args: string[]
}

/**
 * Accepts every integration without running external validation.
 */
export class NoopCheckRunner implements CheckRunner {
  async run(_cwd: string): Promise<CheckResult> {
    return { ok: true, output: '' }
  }
}

/**
 * Runs validation commands sequentially and stops at the first failure.
 */
export class CommandCheckRunner implements CheckRunner {
  constructor(
    private readonly commands: readonly CheckCommand[],
    private readonly timeoutMs = 30_000,
  ) {}

  async run(cwd: string): Promise<CheckResult> {
    const output: string[] = []

    for (const command of this.commands) {
      const result = await runProcess({
        command: command.command,
        args: command.args,
        cwd,
        timeoutMs: this.timeoutMs,
      })
      output.push(result.stdout, result.stderr)

      if (result.exitCode !== 0 || result.timedOut) {
        return { ok: false, output: output.join('') }
      }
    }

    return { ok: true, output: output.join('') }
  }
}
