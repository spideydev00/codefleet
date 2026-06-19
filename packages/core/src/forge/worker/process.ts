/**
 * @fileoverview Non-shell child process execution with timeout and abort support.
 */

import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process'

/**
 * Options for one child process execution.
 */
export interface RunProcessOptions {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env?: NodeJS.ProcessEnv
  readonly input?: string
  readonly timeoutMs?: number
  readonly abortSignal?: AbortSignal
}

/**
 * Captured child process outcome.
 */
export interface ProcessResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
  readonly timedOut: boolean
  readonly durationMs: number
}

/**
 * Runs a process without a shell and encodes every failure in the result.
 */
export async function runProcess(options: RunProcessOptions): Promise<ProcessResult> {
  const startedAt = Date.now()

  return await new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let finished = false
    let timeout: NodeJS.Timeout | undefined

    const finish = (exitCode: number | null): void => {
      if (finished) return
      finished = true
      if (timeout) clearTimeout(timeout)
      options.abortSignal?.removeEventListener('abort', abort)
      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
      })
    }

    const appendError = (message: string): void => {
      stderr += `${stderr && !stderr.endsWith('\n') ? '\n' : ''}${message}`
    }

    let child: ChildProcessWithoutNullStreams

    const terminate = (message: string, timeoutExpired: boolean): void => {
      if (finished) return
      timedOut ||= timeoutExpired
      appendError(message)
      try {
        child.kill()
      } catch (error) {
        appendError(error instanceof Error ? error.message : String(error))
        finish(null)
      }
    }

    const abort = (): void => terminate('Process aborted', false)

    try {
      child = spawn(options.command, [...options.args], {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true,
      })
    } catch (error) {
      appendError(error instanceof Error ? error.message : String(error))
      finish(null)
      return
    }

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.stdin.on('error', error => {
      appendError(error.message)
    })
    child.on('error', error => {
      appendError(error.message)
      finish(null)
    })
    child.on('close', exitCode => {
      finish(exitCode)
    })

    options.abortSignal?.addEventListener('abort', abort, { once: true })
    if (options.abortSignal?.aborted) abort()

    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      timeout = setTimeout(
        () => terminate(`Process timed out after ${options.timeoutMs}ms`, true),
        options.timeoutMs,
      )
    }

    child.stdin.end(options.input)
  })
}
