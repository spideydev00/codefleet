# CodeFleet

**Turn one repository prompt into an implemented, integrated change.**

[![npm](https://img.shields.io/npm/v/@codefleet/core)](https://www.npmjs.com/package/@codefleet/core)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![runtime dependencies](https://img.shields.io/badge/runtime_deps-1-brightgreen)](packages/core/package.json)

CodeFleet is a deterministic control plane for repository automation. A planning CLI turns your request into a validated task DAG, Codex implements tasks in isolated Git worktrees, successful changes are committed and merged through one integration branch, conflicts are sent back to the planning CLI for resolution, and the run ends with a structured Markdown or JSON report.

CodeFleet uses child-process CLIs only. It contains no model API or SDK integration, and its only runtime dependency is [Zod](https://zod.dev/).

## Install

```bash
npm install -g @codefleet/core
```

## Quickstart

Run this from a Git repository:

```bash
codefleet "Modify the password reset logic"
```

By default, CodeFleet uses:

- `claude -p` with `claude-opus-4-8` and medium effort for planning and conflict resolution.
- `codex exec` with `gpt-5.5` and high reasoning effort for implementation.

## How it works

```text
prompt
  |
  v
planning CLI -> validated task DAG
  |
  v
parallel task worktrees -> Codex workers -> task commits
  |
  v
serialized integration merges
  |
  +--> conflict -> planning CLI resolution -> configured checks -> commit or rollback
  |
  v
Markdown or JSON report
```

Failed tasks are never merged. Dependents run only after their dependencies have succeeded and merged, and failed or unmerged dependencies cause downstream tasks to be skipped. Worktrees and run branches are cleaned up unless `--keep` is used.

## Providers and configuration

The default orchestrator preset is `claude`; alternatives are `gemini`, `kimi`, `glm`, and `deepseek`. The default and currently available worker preset is `codex`.

Choose defaults interactively:

```bash
codefleet config
```

Or configure them directly:

```bash
codefleet config --set-orchestrator gemini --set-worker codex
codefleet config --show
```

Override a saved default for one run:

```bash
codefleet "Update authentication tests" \
  --orchestrator gemini \
  --worker codex
```

See [Provider configuration](docs/providers.md) for preset commands and Claude-compatible endpoint env files.

## Requirements

- Node.js 18 or newer.
- Git and a Git repository to operate on.
- An authenticated `claude` CLI for the default orchestrator.
- An installed `codex` CLI for the default worker.
- The selected alternate CLI when using another orchestrator preset.

## Documentation

- [CodeFleet architecture and execution model](docs/codefleet.md)
- [CLI provider configuration](docs/providers.md)
- [Package README and programmatic API](packages/core/README.md)

## Development

```bash
npm install
npm run build
npm run lint
npm test
```

## License

MIT
