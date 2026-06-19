import { describe, expect, it } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { loadEnvFile } from '../src/providers/env-file.js'

describe('loadEnvFile', () => {
  it('parses export, plain, quoted, comment, and skips empty lines', async () => {
    const dir = await mkdir(join(tmpdir(), 'env-test-'), { recursive: true })
    const file = join(dir, '.env')
    await writeFile(file, `
# Comment line
export KEY1=value1
KEY2=value2
export KEY3="value 3"
KEY4='value 4'

export KEY5=
`)
    
    const env = await loadEnvFile(file)
    expect(env.KEY1).toBe('value1')
    expect(env.KEY2).toBe('value2')
    expect(env.KEY3).toBe('value 3')
    expect(env.KEY4).toBe('value 4')
    expect(env.KEY5).toBe('')
    
    await rm(dir, { recursive: true, force: true })
  })

  it('handles ENOENT gracefully', async () => {
    const env = await loadEnvFile('/does/not/exist/.env')
    expect(env).toEqual({})
  })
})
