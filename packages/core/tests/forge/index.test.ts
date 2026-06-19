/**
 * @fileoverview Tests for the public Forge API barrel.
 */

import { describe, expect, it } from 'vitest'
import {
  ClaudeConflictResolver,
  ForgeValidationError,
  CodexWorker,
  FakeCodexWorker,
  Integrator,
  planTasks,
  renderReport,
  runCli,
  runForge,
  runPlan,
} from '../../src/forge/index.js'
import { ClaudeConflictResolver as SourceClaudeConflictResolver } from '../../src/forge/claude/conflict-resolver.js'
import { runCli as sourceRunCli } from '../../src/forge/cli/forge-cli.js'
import { runPlan as sourceRunPlan } from '../../src/forge/engine/engine.js'
import { ForgeValidationError as SourceForgeValidationError } from '../../src/forge/errors.js'
import { Integrator as SourceIntegrator } from '../../src/forge/merge/integrator.js'
import { runForge as sourceRunForge } from '../../src/forge/orchestrator/run-forge.js'
import { planTasks as sourcePlanTasks } from '../../src/forge/planner/planner.js'
import { renderReport as sourceRenderReport } from '../../src/forge/report/render.js'
import { CodexWorker as SourceCodexWorker } from '../../src/forge/worker/codex-worker.js'
import { FakeCodexWorker as SourceFakeCodexWorker } from '../../src/forge/worker/fake-codex-worker.js'

describe('Forge public API', () => {
  it('re-exports the key runtime API by reference', () => {
    expect(runCli).toBe(sourceRunCli)
    expect(runForge).toBe(sourceRunForge)
    expect(runPlan).toBe(sourceRunPlan)
    expect(planTasks).toBe(sourcePlanTasks)
    expect(renderReport).toBe(sourceRenderReport)
    expect(CodexWorker).toBe(SourceCodexWorker)
    expect(FakeCodexWorker).toBe(SourceFakeCodexWorker)
    expect(ClaudeConflictResolver).toBe(SourceClaudeConflictResolver)
    expect(Integrator).toBe(SourceIntegrator)
    expect(ForgeValidationError).toBe(SourceForgeValidationError)
  })
})
