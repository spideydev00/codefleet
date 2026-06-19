/**
 * @fileoverview Types and utilities for CodeFleet orchestrator and worker providers.
 */

import { loadEnvFile } from './env-file.js'

export interface ProviderBase {
  readonly command: string
  readonly baseArgs: string[]
  readonly passPromptVia: 'arg' | 'stdin'
  readonly envFile?: string
}

export interface OrchestratorProvider extends ProviderBase {}

export interface WorkerProvider extends ProviderBase {}

/**
 * Resolves the environment for a provider, merging process.env with an optional envFile.
 */
export async function resolveEnv(provider: ProviderBase): Promise<NodeJS.ProcessEnv | undefined> {
  if (!provider.envFile) {
    return undefined
  }
  const fileEnv = await loadEnvFile(provider.envFile)
  return { ...process.env, ...fileEnv }
}
