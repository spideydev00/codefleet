# Forge

Forge turns one high-level repository prompt, such as “Modify the password reset logic,” into an executed and automatically merged change.

## Roles

| Role | Implementation | Responsibility |
|------|----------------|----------------|
| Deterministic control plane | Forge TypeScript glue | Validates plans, schedules tasks, manages worktrees, merges changes, runs checks, cleans up, and reports results. It does not call an LLM directly. |
| Claude brain | `claude -p` | Inspects the repository, creates the task DAG, and resolves merge conflicts. |
| Codex worker | `codex exec` | Implements one task inside an isolated Git worktree. It does not plan the run. |

The brain and worker are injectable ports, so tests and applications can replace them with deterministic fakes.

## End-to-end flow

```text
user prompt
    |
    v
Claude planner
    |
    v
validated task DAG
    |
    v
execution engine
    |
    +--> per-task worktree --> Codex worker --> commit
    |                                          |
    |                                          v
    +---------------------- serialized merge into integration branch
                                               |
                              conflict? --> Claude resolver
                                               |
                              apply resolution + run checks
                                               |
                              failure --> abort + rollback
                                               |
                                               v
                                        report renderer
```

## Guarantees

- **English-only output.** Prompts, validation messages, and reports are English.
- **Plan from one prompt.** The Claude planner turns the user request and tracked-file snapshot into a validated dependency DAG.
- **Automatic merge.** Failed tasks are never merged. Dependents start from the post-merge integration tip, so they see accepted dependency changes.
- **Automatic conflict resolution.** Forge detects conflicted files, asks Claude for whole-file resolutions, applies them, validates the result, and aborts plus rolls back on failure.
- **No automatic retry.** A failed task is recorded once and its downstream dependents are skipped.
- **Guaranteed cleanup.** Task and integration worktrees are removed from a `finally` path unless `--keep` / `keepWorkspaces` is enabled.

## Module map

All paths below are relative to `packages/core/src/forge/`.

| Layer | Key files | Responsibility |
|-------|-----------|----------------|
| Foundation / types | `errors.ts`, `task-brief.ts`, `tasks-schema.ts`, `resolution-schema.ts`, `worker.ts`, `worker-result.ts`, `report-types.ts` | Validation, task DAG, worker contracts, conflict resolutions, and report models. |
| Worktree isolation | `worktree/git.ts`, `worktree/workspace.ts`, `worktree/worktree-manager.ts`, `cleanup/cleanup.ts` | Non-shell Git operations, isolated task branches, diffs, and guaranteed cleanup. |
| Worker | `worker/prompt.ts`, `worker/process.ts`, `worker/codex-worker.ts`, `worker/fake-codex-worker.ts` | Worker prompts, process execution, real Codex execution, and deterministic tests. |
| Merge / integration | `merge/conflict.ts`, `merge/conflict-resolver.ts`, `merge/integrator.ts` | Integration branch ownership, serialized merges, conflict resolution, checks, and rollback. |
| Engine | `engine/checks.ts`, `engine/concurrency.ts`, `engine/types.ts`, `engine/engine.ts` | Bounded DAG scheduling, task execution, skip propagation, integration, and final report construction. |
| Claude ports | `claude/claude-cli.ts`, `claude/conflict-resolver.ts`, `planner/repo-inspector.ts`, `planner/prompt.ts`, `planner/planner.ts` | Repository inspection, `claude -p` invocation, planning, and conflict resolution. |
| Entry points | `orchestrator/run-forge.ts`, `report/render.ts`, `cli/forge-cli.ts`, `cli/forge.ts`, `index.ts` | End-to-end orchestration, Markdown output, CLI behavior, executable bin, and public API. |

## Run flow

A task is ready only when every dependency has succeeded and its merge outcome is `merged` or `conflict-resolved`. Workers run concurrently up to `maxParallel` (default `4`), while merges are serialized through one integration branch.

A failed task, skipped task, or aborted dependency merge cascade-skips downstream tasks. Final report status is:

| Status | Meaning |
|--------|---------|
| `success` | Every task succeeded and merged. |
| `failed` | Nothing merged and nothing was skipped. |
| `partial` | Any other mixed result. |

## CLI

```bash
forge "Modify the password reset logic" \
  --repo /path/to/repository \
  --base main \
  --max-parallel 4
```

| Flag | Meaning |
|------|---------|
| `--repo <path>` | Repository root; defaults to the current directory. |
| `--base <ref>` | Git reference used as the run base. |
| `--max-parallel <n>` | Maximum concurrent workers; defaults to `4`. |
| `--timeout <ms>` | Per-task worker timeout. |
| `--keep` | Preserve task and integration worktrees for debugging. |
| `--json` | Print the structured report instead of Markdown. |

| Exit code | Meaning |
|-----------|---------|
| `0` | Successful run. |
| `1` | Partial run. |
| `2` | Failed run. |
| `3` | Planning or unexpected execution error. |
| `64` | Invalid CLI arguments. |

## Programmatic usage

```typescript
import { runForge } from '@codefleet/core/forge'

const { report, rendered } = await runForge({
  repoRoot: '/path/to/repository',
  userPrompt: 'Modify the password reset logic',
})

console.log(report.status)
console.log(rendered)
```

`worker`, `resolver`, `checks`, and `planTasksFn` are injectable for custom integrations and deterministic tests.

## Requirements

A real run requires:

- An authenticated `claude` CLI.
- An installed `codex` CLI.
- A Git repository at `repoRoot`.

See the package [README](../packages/core/README.md) for installation and the general framework documentation.

## Testing

Engine, integrator, and worktree tests use real temporary Git repositories. Worker and Claude tests use fake local binaries, so the Forge test suite needs no API keys or network access.
