import * as readline from 'node:readline'
import { saveConfig, type CodeFleetConfig, resolveDefaults } from './config.js'
import { listOrchestratorPresets, listWorkerPresets } from '../providers/presets.js'

export interface InteractiveDeps {
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
  orchestratorPresets?: string[]
  workerPresets?: string[]
}

export async function runConfigWizard(deps: InteractiveDeps = {}): Promise<CodeFleetConfig> {
  const input = deps.input ?? process.stdin
  const output = deps.output ?? process.stdout
  const orchestrators = deps.orchestratorPresets ?? listOrchestratorPresets()
  const workers = deps.workerPresets ?? listWorkerPresets()

  const rl = readline.createInterface({ input, output })

  const ask = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve))
  }

  const defaults = await resolveDefaults()
  let chosenOrchestrator = defaults.orchestrator
  let chosenWorker = defaults.worker

  try {
    output.write('\n=== CodeFleet Configuration Wizard ===\n\n')
    
    // Choose orchestrator
    output.write('Select an Orchestrator preset:\n')
    orchestrators.forEach((p, i) => {
      output.write(`  ${i + 1}) ${p}${p === defaults.orchestrator ? ' (current)' : ''}\n`)
    })
    
    let validOrch = false
    while (!validOrch) {
      const answer = await ask('Choice (number or name): ')
      if (!answer.trim()) {
        validOrch = true
        break
      }
      
      const num = parseInt(answer.trim(), 10)
      if (!isNaN(num) && num > 0 && num <= orchestrators.length) {
        chosenOrchestrator = orchestrators[num - 1]!
        validOrch = true
      } else if (orchestrators.includes(answer.trim())) {
        chosenOrchestrator = answer.trim()
        validOrch = true
      } else {
        output.write('Invalid choice. Try again.\n')
      }
    }
    
    output.write('\n')

    // Choose worker
    output.write('Select a Worker preset:\n')
    workers.forEach((p, i) => {
      output.write(`  ${i + 1}) ${p}${p === defaults.worker ? ' (current)' : ''}\n`)
    })
    
    let validWorker = false
    while (!validWorker) {
      const answer = await ask('Choice (number or name): ')
      if (!answer.trim()) {
        validWorker = true
        break
      }
      
      const num = parseInt(answer.trim(), 10)
      if (!isNaN(num) && num > 0 && num <= workers.length) {
        chosenWorker = workers[num - 1]!
        validWorker = true
      } else if (workers.includes(answer.trim())) {
        chosenWorker = answer.trim()
        validWorker = true
      } else {
        output.write('Invalid choice. Try again.\n')
      }
    }

    await saveConfig({ orchestrator: chosenOrchestrator, worker: chosenWorker })
    output.write(`\nSaved configuration:\n  Orchestrator: ${chosenOrchestrator}\n  Worker: ${chosenWorker}\n\n`)
    
    return { orchestrator: chosenOrchestrator, worker: chosenWorker }
  } finally {
    rl.close()
  }
}
