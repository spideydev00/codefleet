/**
 * @fileoverview Tests for the public CodeFleet API barrel.
 */

import { describe, expect, it } from 'vitest'
import {
  ClaudeConflictResolver,
  CodeFleetValidationError,
  CodexWorker,
  FakeCodexWorker,
  Integrator,
  planTasks,
  renderReport,
  runCli,
  runCodeFleet,
  runPlan,
} from '../src/index.js'
import { ClaudeConflictResolver as SourceClaudeConflictResolver } from '../src/claude/conflict-resolver.js'
import { runCli as sourceRunCli } from '../src/cli/codefleet-cli.js'
import { runPlan as sourceRunPlan } from '../src/engine/engine.js'
import { CodeFleetValidationError as SourceCodeFleetValidationError } from '../src/errors.js'
import { Integrator as SourceIntegrator } from '../src/merge/integrator.js'
import { runCodeFleet as sourceRunCodeFleet } from '../src/orchestrator/run-codefleet.js'
import { planTasks as sourcePlanTasks } from '../src/planner/planner.js'
import { renderReport as sourceRenderReport } from '../src/report/render.js'
import { CodexWorker as SourceCodexWorker } from '../src/worker/codex-worker.js'
import { FakeCodexWorker as SourceFakeCodexWorker } from '../src/worker/fake-codex-worker.js'

describe('CodeFleet public API', () => {
  it('re-exports the key runtime API by reference', () => {
    expect(runCli).toBe(sourceRunCli)
    expect(runCodeFleet).toBe(sourceRunCodeFleet)
    expect(runPlan).toBe(sourceRunPlan)
    expect(planTasks).toBe(sourcePlanTasks)
    expect(renderReport).toBe(sourceRenderReport)
    expect(CodexWorker).toBe(SourceCodexWorker)
    expect(FakeCodexWorker).toBe(SourceFakeCodexWorker)
    expect(ClaudeConflictResolver).toBe(SourceClaudeConflictResolver)
    expect(Integrator).toBe(SourceIntegrator)
    expect(CodeFleetValidationError).toBe(SourceCodeFleetValidationError)
  })
})
