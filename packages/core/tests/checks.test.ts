/**
 * @fileoverview Tests for injectable integration check runners.
 */

import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CommandCheckRunner,
  NoopCheckRunner,
} from '../src/engine/checks.js'

let testRoot: string

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'codefleet-checks-'))
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

describe('CheckRunner', () => {
  it('accepts through the no-op runner', async () => {
    await expect(new NoopCheckRunner().run(testRoot)).resolves.toEqual({
      ok: true,
      output: '',
    })
  })

  it('runs successful commands in order and combines output', async () => {
    const runner = new CommandCheckRunner([
      { command: process.execPath, args: ['-e', 'process.stdout.write("one\\n")'] },
      { command: process.execPath, args: ['-e', 'process.stderr.write("two\\n")'] },
    ])

    await expect(runner.run(testRoot)).resolves.toEqual({
      ok: true,
      output: 'one\ntwo\n',
    })
  })

  it('stops after the first failed command', async () => {
    const marker = join(testRoot, 'should-not-exist')
    const runner = new CommandCheckRunner([
      {
        command: process.execPath,
        args: ['-e', 'process.stderr.write("failed\\n"); process.exit(7)'],
      },
      {
        command: process.execPath,
        args: ['-e', `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "bad")`],
      },
    ])

    const result = await runner.run(testRoot)

    expect(result).toEqual({ ok: false, output: 'failed\n' })
    await expect(access(marker)).rejects.toBeDefined()
  })
})
