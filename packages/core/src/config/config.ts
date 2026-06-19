import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export interface CodeFleetConfig {
  orchestrator: string
  worker: string
}

export const DEFAULT_CONFIG: CodeFleetConfig = {
  orchestrator: 'claude',
  worker: 'codex',
}

let mockHomeDir: string | undefined

export function setMockHomeDir(dir: string | undefined) {
  mockHomeDir = dir
}

export function configPath(): string {
  const home = mockHomeDir ?? homedir()
  return join(home, '.codefleet', 'config.json')
}

export async function loadConfig(): Promise<Partial<CodeFleetConfig>> {
  try {
    const data = await readFile(configPath(), 'utf8')
    const parsed = JSON.parse(data)
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        ...(typeof parsed.orchestrator === 'string' ? { orchestrator: parsed.orchestrator } : {}),
        ...(typeof parsed.worker === 'string' ? { worker: parsed.worker } : {}),
      }
    }
    return {}
  } catch {
    return {}
  }
}

export async function saveConfig(cfg: Partial<CodeFleetConfig>): Promise<void> {
  const path = configPath()
  await mkdir(dirname(path), { recursive: true })
  
  const existing = await loadConfig()
  const merged = { ...existing, ...cfg }
  
  await writeFile(path, JSON.stringify(merged, null, 2) + '\n', 'utf8')
}

export async function resolveDefaults(): Promise<CodeFleetConfig> {
  const cfg = await loadConfig()
  return {
    orchestrator: cfg.orchestrator ?? DEFAULT_CONFIG.orchestrator,
    worker: cfg.worker ?? DEFAULT_CONFIG.worker,
  }
}
