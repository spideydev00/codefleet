/**
 * @fileoverview Public API for CodeFleet planning, execution, and reporting.
 */

export {
  runCodeFleet,
} from './orchestrator/run-codefleet.js'
export type {
  RunCodeFleetOptions,
} from './orchestrator/run-codefleet.js'
export {
  runCli,
} from './cli/codefleet-cli.js'
export type {
  CodeFleetCliDependencies,
} from './cli/codefleet-cli.js'
export {
  planTasks,
} from './planner/planner.js'
export type {
  PlanTasksOptions,
} from './planner/planner.js'
export {
  runPlan,
} from './engine/engine.js'
export type {
  RunPlanOptions,
} from './engine/types.js'
export {
  renderReport,
} from './report/render.js'
export {
  CodexWorker,
} from './worker/codex-worker.js'
export type {
  CodexWorkerOptions,
} from './worker/codex-worker.js'
export {
  FakeCodexWorker,
} from './worker/fake-codex-worker.js'
export {
  ClaudeConflictResolver,
} from './claude/conflict-resolver.js'
export {
  Integrator,
} from './merge/integrator.js'
export type {
  TasksPlan,
  PlannedTask,
} from './tasks-schema.js'
export type {
  TaskBrief,
} from './task-brief.js'
export type {
  WorkerRunRecord,
  WorkerResult,
} from './worker-result.js'
export type {
  Worker,
  WorkerContext,
} from './worker.js'
export type {
  ConflictResolver,
} from './merge/conflict-resolver.js'
export {
  CommandCheckRunner,
  NoopCheckRunner,
} from './engine/checks.js'
export type {
  CheckRunner,
} from './engine/checks.js'
export type {
  CodeFleetReport,
  MergeOutcome,
  MergeReportEntry,
  TaskOutcome,
  TaskReportEntry,
} from './report-types.js'
export {
  CodeFleetValidationError,
} from './errors.js'
export type {
  OrchestratorProvider,
  WorkerProvider
} from './providers/provider.js'
export {
  getOrchestratorPreset,
  getWorkerPreset
} from './providers/presets.js'
