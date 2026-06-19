import { describe, expect, it } from 'vitest'
import { getOrchestratorPreset, getWorkerPreset } from '../src/providers/presets.js'

describe('Presets', () => {
  it('resolves orchestrator presets', () => {
    const claude = getOrchestratorPreset('claude')
    expect(claude.command).toBe('claude')
    expect(claude.passPromptVia).toBe('stdin')
    
    const gemini = getOrchestratorPreset('gemini')
    expect(gemini.command).toBe('gemini')
    expect(gemini.passPromptVia).toBe('arg')
    
    const kimi = getOrchestratorPreset('kimi')
    expect(kimi.envFile).toBe('~/.claude-kimi-env')
    
    expect(() => getOrchestratorPreset('unknown')).toThrow()
  })

  it('resolves worker presets', () => {
    const codex = getWorkerPreset('codex')
    expect(codex.command).toBe('codex')
    expect(codex.passPromptVia).toBe('arg')
    
    expect(() => getWorkerPreset('unknown')).toThrow()
  })
})
