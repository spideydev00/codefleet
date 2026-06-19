import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { PassThrough } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runConfigWizard } from '../src/config/interactive.js'
import { loadConfig, setMockHomeDir } from '../src/config/config.js'

describe('Interactive Config Wizard', () => {
  let mockHome: string

  beforeEach(async () => {
    mockHome = await mkdtemp(join(tmpdir(), 'codefleet-interactive-'))
    setMockHomeDir(mockHome)
  })

  afterEach(async () => {
    setMockHomeDir(undefined)
    await rm(mockHome, { recursive: true, force: true })
  })

  it('collects presets via interactive prompts', async () => {
    const input = new PassThrough()
    const output = new PassThrough()

    const runPromise = runConfigWizard({
      input,
      output,
      orchestratorPresets: ['claude', 'gemini'],
      workerPresets: ['codex', 'bash'],
    })

    // Wait a tick for prompts
    await new Promise(r => setTimeout(r, 10))
    
    // Invalid choice (should retry)
    input.write('garbage\n')
    await new Promise(r => setTimeout(r, 10))
    
    // Choose 2 (gemini)
    input.write('2\n')
    await new Promise(r => setTimeout(r, 10))
    
    // Choose bash by name
    input.write('bash\n')
    
    const result = await runPromise
    expect(result).toEqual({ orchestrator: 'gemini', worker: 'bash' })
    
    const saved = await loadConfig()
    expect(saved).toEqual({ orchestrator: 'gemini', worker: 'bash' })
  })

  it('keeps defaults on empty answers', async () => {
    const input = new PassThrough()
    const output = new PassThrough()

    const runPromise = runConfigWizard({
      input,
      output,
    })

    await new Promise(r => setTimeout(r, 10))
    input.write('\n') // empty = skip
    await new Promise(r => setTimeout(r, 10))
    input.write('\n') // empty = skip
    
    const result = await runPromise
    expect(result.orchestrator).toBe('claude') // from default
    expect(result.worker).toBe('codex') // from default
  })
})
