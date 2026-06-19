# CLAUDE.md

This is the development map for CodeFleet. The published package is `@codefleet/core` in `packages/core/`; repository-level npm scripts delegate to that workspace.

CodeFleet is a deterministic repository-automation control plane. It invokes external model CLIs as child processes, but contains no model API or SDK integration. Its only runtime dependency is `zod`.

## Commands

Run these from the repository root:

```bash
npm install
npm run build          # Compile packages/core/src/ to packages/core/dist/
npm run lint           # Type-check with tsc --noEmit
npm test               # Run the Vitest suite
npm run test:watch
npm run test:coverage

# After a build:
node packages/core/dist/cli/codefleet.js --help
```

Tests live in `packages/core/tests/`. They use temporary Git repositories and fake CLI binaries; no API keys or network access are required.

## Source layout

All source paths below are relative to `packages/core/src/`.

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Planner | `planner/repo-inspector.ts`, `planner/prompt.ts`, `planner/planner.ts` | Lists tracked files, builds the planning prompt, invokes the selected orchestrator CLI, and validates the returned task DAG. |
| Orchestrator CLI | `claude/claude-cli.ts`, `claude/conflict-resolver.ts` | Runs one-shot planning-compatible CLIs and converts conflict output into validated whole-file resolutions. |
| Worker | `worker/process.ts`, `worker/prompt.ts`, `worker/codex-worker.ts`, `worker/fake-codex-worker.ts` | Non-shell process execution, implementation prompts, real Codex execution, and deterministic test execution. |
| Worktree | `worktree/git.ts`, `worktree/workspace.ts`, `worktree/worktree-manager.ts` | Git command execution, isolated task branches/worktrees, changed-file detection, diffs, and task cleanup. |
| Merge | `merge/conflict.ts`, `merge/conflict-resolver.ts`, `merge/integrator.ts` | Owns the run integration branch, serializes merges, resolves conflicts, runs configured checks, and rolls back failed integrations. |
| Engine | `engine/concurrency.ts`, `engine/checks.ts`, `engine/types.ts`, `engine/engine.ts` | Schedules the validated DAG, bounds workers, skips blocked dependents, records outcomes, and guarantees cleanup. |
| Report | `report/render.ts`, `report-types.ts` | Structured run report and English Markdown rendering. |
| Providers | `providers/provider.ts`, `providers/presets.ts`, `providers/env-file.ts` | CLI command presets, prompt transport, and optional env-file loading. |
| Config | `config/config.ts`, `config/interactive.ts` | Reads and writes `~/.codefleet/config.json` and implements the interactive preset selector. |
| CLI | `cli/codefleet-cli.ts`, `cli/codefleet.ts` | Argument parsing, configuration commands, output selection, exit codes, and the executable entry. |
| Orchestration entry | `orchestrator/run-codefleet.ts` | Connects planning, worker, resolver, engine, and renderer through `runCodeFleet()`. |
| Utilities | `utils/redaction.ts` | Removes sensitive-looking values from worker process output. |
| Root schemas and ports | `tasks-schema.ts`, `task-brief.ts`, `resolution-schema.ts`, `worker.ts`, `worker-result.ts`, `worker-kind.ts`, `errors.ts` | Zod validation and shared contracts. |
| Public API | `index.ts` | Runtime and type exports for `@codefleet/core`. |

## Execution path

```text
user prompt
  -> tracked-file snapshot
  -> orchestrator CLI returns a validated task DAG
  -> ready tasks run in isolated worktrees
  -> successful changes are committed
  -> task branches merge serially into the integration branch
  -> conflicts go to the orchestrator CLI
  -> configured checks accept or roll back the merge
  -> report is rendered
  -> worktrees and run branches are cleaned up
```

## Invariants

- **Pure CLI integration.** Model execution always goes through `runProcess()` with argument arrays and `shell: false`. Do not add API or SDK clients.
- **One runtime dependency.** `zod` is the only package in `dependencies`.
- **Worker and resolver boundaries do not throw for expected failures.** `CodexWorker.run()` encodes process and parse failures in `WorkerRunRecord`; conflict resolution returns `undefined` when it cannot produce a valid resolution.
- **Planning rejects unusable plans.** Planner process failures, missing JSON, invalid references, and cyclic DAGs throw `CodeFleetValidationError` before engine execution.
- **Per-task isolation.** Every executable task gets its own branch-backed worktree created from the current integration tip.
- **Dependencies require integration.** A task is ready only when every dependency succeeded and has merge outcome `merged` or `conflict-resolved`.
- **No automatic retry.** Failed tasks run once. Their downstream dependents are skipped.
- **Merges are serialized.** Workers may run concurrently, but integration uses one merge permit and one run-scoped integration branch.
- **Failed changes are not merged.** Worker failures remain `not-merged`; check failures and unresolved conflicts restore the previous integration tip.
- **Cleanup is guaranteed.** The engine cleanup path removes integration state and task worktrees unless `keepWorkspaces` is enabled.
- **Checks are injectable.** `NoopCheckRunner` is the default; do not document automatic project tests unless a check runner is configured.
- **Secrets are redacted.** Worker stdout and stderr are sanitized before entering run records and reports.

## Provider and configuration rules

- Orchestrator presets: `claude` (default), `gemini`, `kimi`, `glm`, `deepseek`.
- Worker presets: `codex` (default).
- Claude-compatible presets load `~/.claude-<provider>-env` directly; they do not need a shell alias.
- Saved defaults live in `~/.codefleet/config.json`.
- CLI `--orchestrator` and `--worker` values override saved defaults.
- Keep provider execution injectable for tests.

## Code style

- TypeScript strict mode.
- ESM relative imports include `.js`.
- No default exports.
- Use `node:*` built-ins before adding code or dependencies.
- Preserve non-shell child-process execution.
- Match the existing `@fileoverview` headers and explicit exported types.
- After source changes, run `npm run lint` and the relevant tests.

## Documentation

| Topic | Document |
|-------|----------|
| Product architecture and execution lifecycle | [docs/codefleet.md](docs/codefleet.md) |
| CLI provider presets and env files | [docs/providers.md](docs/providers.md) |
| Package usage and public API | [packages/core/README.md](packages/core/README.md) |
