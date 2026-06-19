import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, saveConfig, resolveDefaults, setMockHomeDir, DEFAULT_CONFIG } from '../src/config/config.js'

describe('Config persistence', () => {
  let mockHome: string

  beforeEach(async () => {
    mockHome = await mkdtemp(join(tmpdir(), 'codefleet-config-'))
    setMockHomeDir(mockHome)
  })

  afterEach(async () => {
    setMockHomeDir(undefined)
    await rm(mockHome, { recursive: true, force: true })
  })

  it('loads empty when missing', async () => {
    const cfg = await loadConfig()
    expect(cfg).toEqual({})
  })

  it('round-trips saves', async () => {
    await saveConfig({ orchestrator: 'gemini' })
    const cfg = await loadConfig()
    expect(cfg.orchestrator).toBe('gemini')
    expect(cfg.worker).toBeUndefined()
  })

  it('merges multiple saves', async () => {
    await saveConfig({ orchestrator: 'gemini' })
    await saveConfig({ worker: 'custom-codex' })
    const cfg = await loadConfig()
    expect(cfg).toEqual({ orchestrator: 'gemini', worker: 'custom-codex' })
  })

  it('resolveDefaults fills missing with hard defaults', async () => {
    await saveConfig({ worker: 'bob' })
    const defaults = await resolveDefaults()
    expect(defaults.orchestrator).toBe(DEFAULT_CONFIG.orchestrator)
    expect(defaults.worker).toBe('bob')
  })
})
