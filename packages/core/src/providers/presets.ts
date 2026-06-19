/**
 * @fileoverview CLI Provider Presets for CodeFleet orchestrators and workers.
 */

import type { OrchestratorProvider, WorkerProvider } from './provider.js'

const ORCHESTRATOR_PRESETS: Record<string, OrchestratorProvider> = {
  claude: {
    command: 'claude',
    baseArgs: ['-p', '--model', 'claude-opus-4-8', '--effort', 'medium'],
    passPromptVia: 'stdin',
  },
  gemini: {
    command: 'gemini',
    baseArgs: ['--approval-mode', 'plan', '-o', 'text', '-p'],
    passPromptVia: 'arg',
  },
  kimi: {
    command: 'claude',
    baseArgs: ['-p'],
    passPromptVia: 'stdin',
    envFile: '~/.claude-kimi-env',
  },
  glm: {
    command: 'claude',
    baseArgs: ['-p'],
    passPromptVia: 'stdin',
    envFile: '~/.claude-glm-env',
  },
  deepseek: {
    command: 'claude',
    baseArgs: ['-p'],
    passPromptVia: 'stdin',
    envFile: '~/.claude-deepseek-env',
  },
}

const WORKER_PRESETS: Record<string, WorkerProvider> = {
  codex: {
    command: 'codex',
    baseArgs: ['exec', '-m', 'gpt-5.5', '-c', 'model_reasoning_effort=high', '--dangerously-bypass-approvals-and-sandbox'],
    passPromptVia: 'arg',
  },
}

export function getOrchestratorPreset(name: string): OrchestratorProvider {
  const preset = ORCHESTRATOR_PRESETS[name]
  if (!preset) {
    throw new Error(`Unknown orchestrator preset: ${name}`)
  }
  return preset
}

export function getWorkerPreset(name: string): WorkerProvider {
  const preset = WORKER_PRESETS[name]
  if (!preset) {
    throw new Error(`Unknown worker preset: ${name}`)
  }
  return preset
}
