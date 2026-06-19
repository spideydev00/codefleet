# CodeFleet architecture

CodeFleet turns one high-level repository request, such as “Modify the password reset logic,” into an implemented, integrated change and a structured report.

It is deterministic TypeScript glue around command-line tools. CodeFleet itself does not call a model API or SDK.

## Roles

| Role | Default | Responsibility |
|------|---------|----------------|
| Control plane | CodeFleet | Validates plans, schedules tasks, creates worktrees, commits changes, serializes merges, applies conflict resolutions, runs configured checks, cleans up, and reports outcomes. |
| Orchestrator CLI | `claude -p` | Produces the task DAG and resolves merge conflicts. Alternate CLI presets are supported. |
| Worker CLI | `codex exec` | Implements one task inside its isolated worktree. |

The planner, worker, resolver, and check runner are injectable ports. Tests replace external CLIs with deterministic fake binaries or in-process workers.

## End-to-end flow

```text
user prompt
    |
    v
repository inspector
    |  git ls-files
    v
orchestrator CLI
    |
    v
validated task DAG
    |
    v
execution engine
    |
    +--> task worktree --> worker CLI --> changed files + diff --> task commit
    |                                                       |
    |                                                       v
    +-------------------------- serialized integration merge
                                                            |
                                      conflict? --> orchestrator CLI
                                                            |
                                      apply complete resolution
                                                            |
                                           configured checks
                                              |          |
                                           accept     rollback
                                              |
                                              v
                                      structured report
                                              |
                                              v
                                    guaranteed cleanup
```

## Planning

`planner/repo-inspector.ts` runs `git ls-files -z` and captures a bounded list of tracked paths. It does not sample repository file contents.

`planner/prompt.ts` combines that snapshot with the user request and asks the selected orchestrator CLI for a JSON task plan. `planner/planner.ts` validates the output through `parseTasksPlan()`.

Each task contains:

- `id`
- `title`
- `description`
- `fileScope`
- `dependsOn`

Validation rejects duplicate IDs, missing dependencies, and cyclic graphs before execution starts. An unusable plan throws `CodeFleetValidationError`.

## Scheduling and isolation

A task becomes ready only when every dependency:

1. completed successfully; and
2. has merge outcome `merged` or `conflict-resolved`.

Ready workers run concurrently up to `maxParallel`, which defaults to `4`. Each task worktree is created from the current integration branch tip, so dependent tasks see accepted dependency changes.

The worker receives a validated `TaskBrief` and an English instruction to work only in the current directory, respect the task file scope, and emit a structured JSON result.

CodeFleet does not automatically retry a failed task. A failed, skipped, or unmerged dependency causes downstream tasks to be skipped.

## Worker execution

`worker/process.ts` wraps `child_process.spawn` with:

- argument arrays and `shell: false`;
- captured stdout and stderr;
- timeout and abort handling;
- non-throwing process failure results.

`CodexWorker` uses the selected worker provider, defaults to the `codex` preset, and runs inside the task worktree. Worker stdout and stderr are redacted before being stored in the run record.

When a worker succeeds, CodeFleet derives changed files and a binary-capable diff from Git. If files changed, it stages and commits them on the task branch. A successful task with no file changes is recorded as integrated without creating a merge commit.

## Integration and conflict resolution

One run owns one integration branch:

```text
codefleet/<runId>/integration
```

Task branches use:

```text
codefleet/<runId>/<taskId>
```

Workers may finish in any order, but merges are serialized. Each merge records the pre-merge integration tip.

For a clean merge:

1. merge the task branch with `--no-ff`;
2. run the configured `CheckRunner`;
3. keep the merge when checks pass;
4. reset to the previous tip when checks fail.

`NoopCheckRunner` is the default. Project-specific validation runs only when a caller injects a `CommandCheckRunner` or another implementation.

For a conflict:

1. collect every unmerged path;
2. read the complete marked file contents;
3. call the selected conflict resolver;
4. require resolved content for every conflicted path and no unresolved entries;
5. write and stage the resolutions;
6. run configured checks;
7. complete the merge or abort and restore the previous tip.

Expected merge failures are encoded as `merge-aborted`; they do not escape as engine exceptions.

## Providers

CodeFleet providers describe a CLI invocation:

```typescript
interface ProviderBase {
  command: string
  baseArgs: string[]
  passPromptVia: 'arg' | 'stdin'
  envFile?: string
}
```

Built-in orchestrator presets:

| Preset | Command behavior |
|--------|------------------|
| `claude` | `claude -p --model claude-opus-4-8 --effort medium`; prompt via stdin. |
| `gemini` | `gemini --approval-mode plan -o text -p`; prompt as an argument. |
| `kimi` | `claude -p` with `~/.claude-kimi-env`. |
| `glm` | `claude -p` with `~/.claude-glm-env`. |
| `deepseek` | `claude -p` with `~/.claude-deepseek-env`. |

The worker preset is `codex`, which runs `codex exec` with `gpt-5.5`, high reasoning effort, and non-interactive execution inside the isolated task worktree.

See [Provider configuration](providers.md) for env-file patterns and CLI examples.

## Configuration

Saved defaults live in:

```text
~/.codefleet/config.json
```

The default configuration is:

```json
{
  "orchestrator": "claude",
  "worker": "codex"
}
```

Use the interactive selector:

```bash
codefleet config
```

Or set and inspect values directly:

```bash
codefleet config --set-orchestrator gemini --set-worker codex
codefleet config --show
```

Per-run `--orchestrator` and `--worker` flags override saved defaults.

## Reports

Every completed engine run produces a `CodeFleetReport` containing:

- the run ID and user request;
- the validated plan;
- task outcomes and worker records;
- merge outcomes, conflict paths, rationales, and notes;
- totals and elapsed time;
- final status.

Status rules:

| Status | Meaning |
|--------|---------|
| `success` | Every task succeeded and integrated. |
| `failed` | No task integrated and no task was skipped. |
| `partial` | Any mixed result, including downstream skips or an aborted merge after other progress. |

`renderReport()` produces English Markdown with a “Needs attention” section for failed tasks, skipped tasks, and aborted merges. `--json` prints the structured report instead.

## Cleanup

The full engine run is wrapped in guaranteed cleanup:

1. remove the integration worktree and integration branch;
2. remove task worktrees and task branches;
3. prune stale Git worktree registrations.

`--keep` and `keepWorkspaces: true` preserve run state for debugging.

## Module map

All paths are relative to `packages/core/src/`.

| Layer | Key files | Responsibility |
|-------|-----------|----------------|
| Schemas and contracts | `tasks-schema.ts`, `task-brief.ts`, `resolution-schema.ts`, `worker.ts`, `worker-result.ts`, `report-types.ts`, `errors.ts` | Validated plans, task briefs, worker results, conflict resolutions, reports, and validation errors. |
| Planner | `planner/repo-inspector.ts`, `planner/prompt.ts`, `planner/planner.ts` | Repository snapshot, planning prompt, CLI invocation, and plan validation. |
| Orchestrator CLI | `claude/claude-cli.ts`, `claude/conflict-resolver.ts` | One-shot CLI execution and merge-conflict resolution. |
| Worker | `worker/process.ts`, `worker/prompt.ts`, `worker/codex-worker.ts`, `worker/fake-codex-worker.ts` | Process execution, implementation prompt, Codex adapter, and deterministic fake. |
| Worktree | `worktree/git.ts`, `worktree/workspace.ts`, `worktree/worktree-manager.ts`, `cleanup/cleanup.ts` | Git operations, isolated workspaces, diffs, and cleanup. |
| Merge | `merge/conflict.ts`, `merge/conflict-resolver.ts`, `merge/integrator.ts` | Integration branch, serialized merges, conflict application, checks, and rollback. |
| Engine | `engine/concurrency.ts`, `engine/checks.ts`, `engine/types.ts`, `engine/engine.ts` | Bounded DAG execution, skip propagation, integration, cleanup, and report assembly. |
| Providers | `providers/provider.ts`, `providers/presets.ts`, `providers/env-file.ts` | CLI provider contracts, named presets, and env-file loading. |
| Config | `config/config.ts`, `config/interactive.ts` | Persistent defaults and interactive configuration. |
| Entry points | `orchestrator/run-codefleet.ts`, `report/render.ts`, `cli/codefleet-cli.ts`, `cli/codefleet.ts`, `index.ts` | Programmatic orchestration, rendering, CLI boundary, executable, and public exports. |
| Utilities | `utils/redaction.ts` | Sensitive-output redaction. |

## CLI usage

```bash
codefleet "Modify the password reset logic" \
  --repo /path/to/repository \
  --base main \
  --max-parallel 4
```

See the [package README](../packages/core/README.md) for the complete flag and exit-code tables.

## Programmatic usage

```typescript
import { runCodeFleet } from '@codefleet/core'

const { report, rendered } = await runCodeFleet({
  repoRoot: '/path/to/repository',
  userPrompt: 'Modify the password reset logic',
})
```

`worker`, `resolver`, `checks`, and `planTasksFn` can be injected for custom execution or deterministic testing.

## Testing

Engine, integration, and worktree tests use real temporary Git repositories. CLI adapters use fake local binaries. The test suite needs no model credentials or network access.
