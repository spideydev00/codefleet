/**
 * @fileoverview Integration tests for Claude-backed repository planning.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CodeFleetValidationError } from '../src/errors.js'
import { planTasks } from '../src/planner/planner.js'
import { runGit } from '../src/worktree/git.js'

let testRoot: string
let repoRoot: string
let executable: string

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'codefleet-planner-'))
  repoRoot = join(testRoot, 'repo')
  executable = join(testRoot, 'fake-claude.mjs')
  await mkdir(repoRoot)
  await runGit(repoRoot, ['init'])
  await writeFile(join(repoRoot, 'README.md'), 'repository\n')
  await runGit(repoRoot, ['add', 'README.md'])
  await writeFile(executable, `
const mode = process.argv[2]
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  if (mode === 'valid') {
    if (!input.includes('Add a feature') || !input.includes('README.md')) process.exit(9)
    console.log(\`\\\`\\\`\\\`json
{"tasks":[{"id":"a","title":"First","description":"Implement first.","fileScope":["src/a.ts"],"dependsOn":[]},{"id":"b","title":"Second","description":"Implement second.","fileScope":[],"dependsOn":["a"]}]}
\\\`\\\`\\\`\`)
  } else if (mode === 'cyclic') {
    console.log('{"tasks":[{"id":"a","title":"A","description":"A","dependsOn":["b"]},{"id":"b","title":"B","description":"B","dependsOn":["a"]}]}')
  } else if (mode === 'garbage') {
    console.log('no plan')
  } else if (mode === 'nonzero') {
    process.stderr.write('planner failed')
    process.exitCode = 3
  }
})
`)
})

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

function options(mode: string) {
  return {
    repoRoot,
    userPrompt: 'Add a feature',
    claude: {
      command: process.execPath,
      baseArgs: [executable, mode],
    },
  }
}

describe('planTasks', () => {
  it('returns a validated task DAG', async () => {
    await expect(planTasks(options('valid'))).resolves.toEqual({
      tasks: [
        {
          id: 'a',
          title: 'First',
          description: 'Implement first.',
          fileScope: ['src/a.ts'],
          dependsOn: [],
        },
        {
          id: 'b',
          title: 'Second',
          description: 'Implement second.',
          fileScope: [],
          dependsOn: ['a'],
        },
      ],
    })
  })

  it('rejects a cyclic plan as unusable', async () => {
    await expect(planTasks(options('cyclic')))
      .rejects.toBeInstanceOf(CodeFleetValidationError)
  })

  it('rejects missing JSON as unusable', async () => {
    await expect(planTasks(options('garbage')))
      .rejects.toThrow('no JSON plan found')
  })

  it('rejects a failed Claude process as unusable', async () => {
    await expect(planTasks(options('nonzero')))
      .rejects.toThrow('planner failed')
  })
})
