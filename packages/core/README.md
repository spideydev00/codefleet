# @codefleet/core

CodeFleet turns one high-level repository request into an implemented and automatically integrated change.

It is a deterministic TypeScript control plane around local command-line tools:

- An orchestrator CLI creates a validated task DAG and resolves merge conflicts.
- Codex implements tasks in isolated Git worktrees.
- CodeFleet commits successful task changes and serializes merges through one integration branch.
- Configured checks can reject an integration and trigger rollback.
- A final Markdown or JSON report records task, merge, and conflict outcomes.

There are no model API or SDK calls. The only runtime dependency is `zod`.

## Install

For the CLI:

```bash
npm install -g @codefleet/core
```

For programmatic use:

```bash
npm install @codefleet/core
```

Node.js 18 or newer is required.

## CLI

Run CodeFleet from a Git repository:

```bash
codefleet "Modify the password reset logic"
```

Specify another repository or base reference:

```bash
codefleet "Add audit logging" \
  --repo /path/to/repository \
  --base main \
  --max-parallel 4
```

### Flags

| Flag | Meaning |
|------|---------|
| `--prompt <prompt>` | Supply the request as a named option instead of the positional argument. |
| `--repo <path>` | Repository root; defaults to the current directory. |
| `--base <ref>` | Git reference used as the run base. |
| `--max-parallel <n>` | Maximum concurrent workers; defaults to `4`. |
| `--timeout <ms>` | Per-task worker timeout in milliseconds. |
| `--keep` | Preserve task and integration worktrees for debugging. |
| `--json` | Print the structured report instead of Markdown. |
| `--orchestrator <name>` | Override the configured orchestrator preset for this run. |
| `--worker <name>` | Override the configured worker preset for this run. |
| `--help`, `-h` | Print usage. |

The prompt must be one quoted positional argument unless `--prompt` is used.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Successful run, configuration command, or help. |
| `1` | Partial run. |
| `2` | Failed run. |
| `3` | Planning, configuration, or unexpected execution error. |
| `64` | Invalid or missing arguments. |

## Programmatic API

```typescript
import { runCodeFleet } from '@codefleet/core'

const { report, rendered } = await runCodeFleet({
  repoRoot: '/path/to/repository',
  userPrompt: 'Modify the password reset logic',
})

console.log(report.status)
console.log(rendered)
```

`runCodeFleet()` accepts the same core execution controls as the CLI, including `baseRef`, `maxParallel`, `keepWorkspaces`, and `taskTimeoutMs`.

The implementation ports remain injectable:

```typescript
const result = await runCodeFleet({
  repoRoot,
  userPrompt,
  worker,
  resolver,
  checks,
  planTasksFn,
})
```

- `worker` replaces the implementation worker.
- `resolver` replaces conflict resolution.
- `checks` validates the integration worktree after each merge; the default runner is a no-op.
- `planTasksFn` replaces repository planning.

Provider presets can be selected programmatically with `orchestratorProvider` and `workerProvider`.

## Provider presets

| Role | Preset | CLI |
|------|--------|-----|
| Orchestrator | `claude` (default) | `claude -p`, `claude-opus-4-8`, medium effort |
| Orchestrator | `gemini` | `gemini` in plan approval mode |
| Orchestrator | `kimi` | `claude -p` with `~/.claude-kimi-env` |
| Orchestrator | `glm` | `claude -p` with `~/.claude-glm-env` |
| Orchestrator | `deepseek` | `claude -p` with `~/.claude-deepseek-env` |
| Worker | `codex` (default) | `codex exec`, `gpt-5.5`, high reasoning effort |

CodeFleet reads compatible provider env files itself and merges them with the inherited process environment. No shell wrapper is used.

See the [provider configuration guide](../../docs/providers.md) for details.

## Configuration

Launch the interactive preset selector:

```bash
codefleet config
```

Set or inspect defaults non-interactively:

```bash
codefleet config --set-orchestrator glm --set-worker codex
codefleet config --show
```

Configuration is stored in `~/.codefleet/config.json`. Per-run `--orchestrator` and `--worker` flags take precedence.

## Execution behavior

- The planner lists tracked repository files and returns a schema-validated dependency DAG.
- Ready tasks run concurrently up to `maxParallel`.
- Each task receives an isolated branch-backed Git worktree.
- A dependent task starts only after every dependency has succeeded and merged.
- Successful task changes are committed before integration.
- Merges are serialized through one run-scoped integration branch.
- Conflicts are passed to the selected orchestrator CLI as complete marked file contents.
- Failed tasks are not retried and are never merged; downstream tasks are skipped.
- Worktrees and run branches are cleaned up in a guaranteed cleanup path unless preservation is requested.

## Requirements

A default real run requires:

- Git and a Git repository at `repoRoot`.
- An authenticated `claude` CLI.
- An installed `codex` CLI.

Using `gemini`, `kimi`, `glm`, or `deepseek` also requires the corresponding CLI or env-file setup described in [Provider configuration](../../docs/providers.md).

## Documentation

- [Architecture and run lifecycle](../../docs/codefleet.md)
- [Provider configuration](../../docs/providers.md)
- [Repository README](../../README.md)

## Development

From the repository root:

```bash
npm install
npm run build
npm run lint
npm test
```

Tests use temporary Git repositories and fake CLI binaries. They do not require model credentials or network access.

## License

MIT
