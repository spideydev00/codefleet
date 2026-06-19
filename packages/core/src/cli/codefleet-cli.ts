/**
 * @fileoverview Thin injectable command-line interface for CodeFleet.
 */

import { resolveDefaults, loadConfig, saveConfig } from '../config/config.js'
import { runConfigWizard } from '../config/interactive.js'
import {
  runCodeFleet,
  type RunCodeFleetOptions,
} from '../orchestrator/run-codefleet.js'

const USAGE = [
  'Usage: codefleet [options] <prompt>',
  '       codefleet config [options]',
  '       codefleet [options] --prompt <prompt>',
  '',
  'Options:',
  '  --repo <path>          Repository root (default: current directory)',
  '  --base <ref>           Git base reference',
  '  --max-parallel <n>     Maximum concurrent workers',
  '  --timeout <ms>         Per-task timeout in milliseconds',
  '  --keep                 Preserve CodeFleet worktrees',
  '  --json                 Print the JSON report',
  '  --orchestrator <name>  Override orchestrator preset',
  '  --worker <name>        Override worker preset',
  '  --help, -h             Print this help',
  '',
  'Config Options:',
  '  --show                 Print current config',
  '  --set-orchestrator <n> Set default orchestrator',
  '  --set-worker <n>       Set default worker',
].join('\n')

/**
 * Injectable CLI dependencies.
 */
export interface CodeFleetCliDependencies {
  runCodeFleet?: typeof runCodeFleet
  runConfigWizard?: typeof runConfigWizard
  resolveDefaults?: typeof resolveDefaults
  stdout?: (text: string) => void
  stderr?: (text: string) => void
}

interface ParsedArguments {
  options: RunCodeFleetOptions
  json: boolean
}

function positiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parseArguments(argv: string[]): ParsedArguments | undefined {
  let repoRoot = process.cwd()
  let userPrompt: string | undefined
  let orchestratorProvider: string | undefined
  let workerProvider: string | undefined
  let baseRef: string | undefined
  let maxParallel: number | undefined
  let taskTimeoutMs: number | undefined
  let keepWorkspaces = false
  let json = false
  const positional: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--keep') {
      keepWorkspaces = true
    } else if (argument === '--json') {
      json = true
    } else if (argument === '--prompt') {
      userPrompt = argv[++index]
      if (!userPrompt) return undefined
    } else if (argument === '--repo') {
      repoRoot = argv[++index] ?? ''
      if (!repoRoot) return undefined
    } else if (argument === '--base') {
      baseRef = argv[++index]
      if (!baseRef) return undefined
    } else if (argument === '--max-parallel') {
      maxParallel = positiveInteger(argv[++index])
      if (maxParallel === undefined) return undefined
    } else if (argument === '--timeout') {
      taskTimeoutMs = positiveInteger(argv[++index])
      if (taskTimeoutMs === undefined) return undefined
    } else if (argument === '--orchestrator') {
      orchestratorProvider = argv[++index]
      if (!orchestratorProvider) return undefined
    } else if (argument === '--worker') {
      workerProvider = argv[++index]
      if (!workerProvider) return undefined
    } else if (argument?.startsWith('-')) {
      return undefined
    } else if (argument !== undefined) {
      positional.push(argument)
    }
  }

  if (positional.length > 1 || (userPrompt && positional.length > 0)) return undefined
  userPrompt ??= positional[0]
  if (!userPrompt) return undefined

  return {
    options: {
      repoRoot,
      userPrompt,
      baseRef,
      maxParallel,
      taskTimeoutMs,
      keepWorkspaces,
      orchestratorProvider,
      workerProvider,
    },
    json,
  }
}

/**
 * Executes the CLI and returns a process-compatible exit code without exiting.
 */
export async function runCli(
  argv: string[],
  dependencies: CodeFleetCliDependencies = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? (text => process.stdout.write(`${text}\n`))
  const stderr = dependencies.stderr ?? (text => process.stderr.write(`${text}\n`))

  try {
    if (argv.some(argument => argument === '--help' || argument === '-h')) {
      stdout(USAGE)
      return 0
    }

    if (argv[0] === 'config') {
      if (argv.includes('--show')) {
        const cfg = await loadConfig()
        stdout(JSON.stringify(cfg, null, 2))
        return 0
      }
      
      const setOrchIdx = argv.indexOf('--set-orchestrator')
      const setWorkIdx = argv.indexOf('--set-worker')
      
      if (setOrchIdx !== -1 || setWorkIdx !== -1) {
        const update: Record<string, string> = {}
        if (setOrchIdx !== -1 && argv[setOrchIdx + 1]) update.orchestrator = argv[setOrchIdx + 1]
        if (setWorkIdx !== -1 && argv[setWorkIdx + 1]) update.worker = argv[setWorkIdx + 1]
        await saveConfig(update)
        return 0
      }
      
      await (dependencies.runConfigWizard ?? runConfigWizard)()
      return 0
    }

    const parsed = parseArguments(argv)
    if (!parsed) {
      stderr(USAGE)
      return 64
    }

    const defaults = await (dependencies.resolveDefaults ?? resolveDefaults)()
    if (!parsed.options.orchestratorProvider) parsed.options.orchestratorProvider = defaults.orchestrator
    if (!parsed.options.workerProvider) parsed.options.workerProvider = defaults.worker

    const result = await (dependencies.runCodeFleet ?? runCodeFleet)(parsed.options)
    stdout(parsed.json ? JSON.stringify(result.report, null, 2) : result.rendered)
    return result.report.status === 'success'
      ? 0
      : result.report.status === 'partial'
        ? 1
        : 2
  } catch (error) {
    try {
      stderr(error instanceof Error ? error.message : String(error))
    } catch {
      // Output failures must not escape the CLI boundary.
    }
    return 3
  }
}
