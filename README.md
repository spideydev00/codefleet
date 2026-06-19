<br />

<h1 align="center">CodeFleet</h1>

<p align="center">
  <strong>From a goal to a task DAG, automatically.</strong><br/>
  TypeScript-native multi-agent orchestration. Three runtime dependencies.
</p>

<!-- <p align="center">
  <a href="https://www.npmjs.com/package/@codefleet/core"><img src="https://img.shields.io/npm/v/@codefleet/core" alt="npm version"></a>
  <a href="https://github.com/spideydev00/codefleet/actions/workflows/ci.yml"><img src="https://github.com/spideydev00/codefleet/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.6-blue" alt="TypeScript"></a>
  <a href="https://codecov.io/gh/spideydev00/codefleet"><img src="https://codecov.io/gh/spideydev00/codefleet/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/spideydev00/codefleet/blob/main/packages/core/package.json"><img src="https://img.shields.io/badge/runtime_deps-3-brightgreen" alt="runtime deps"></a>
  <a href="https://github.com/spideydev00/codefleet/stargazers"><img src="https://img.shields.io/github/stars/spideydev00/codefleet" alt="GitHub stars"></a>
  <a href="https://github.com/spideydev00/codefleet/network/members"><img src="https://img.shields.io/github/forks/spideydev00/codefleet" alt="GitHub forks"></a>
</p> -->

<br />

`codefleet` is a multi-agent orchestration framework for TypeScript backends. Give it a goal; a coordinator agent decomposes it into a task DAG, parallelizes independents, and synthesizes the result. Three runtime dependencies, drops into any Node.js backend.

> **Your engineers describe the goal, not the graph.**

Graph-first frameworks make you enumerate every node and edge up front. `codefleet` is goal-first: you describe the outcome and the coordinator builds the task DAG at runtime, so the orchestration adapts to the goal instead of being hand-wired for one.

## Get started

```bash
npm install @codefleet/core
```

The full quickstart, the three ways to run, provider setup, the production checklist, and the complete API reference live on the package page:

**→ [`packages/core/README.md`](packages/core/README.md)**

Prefer to run something first? Clone and run an example:

```bash
git clone https://github.com/spideydev00/codefleet && cd codefleet
npm install
export OPENAI_API_KEY=sk-...
npx tsx packages/core/examples/basics/team-collaboration.ts
```

Three agents collaborate on a REST API while `onProgress` streams the coordinator's task DAG — independent tasks run in parallel, dependents unblock as their inputs land, and the coordinator synthesizes the final result. Local models via Ollama need no API key; see the [providers guide](https://github.com/spideydev00/codefleet/blob/main/docs/providers.md).

## How is this different from X?

A quick router. Mechanism breakdown follows.

| If you need                                                 | Pick          |
| ----------------------------------------------------------- | ------------- |
| Fixed production topology with mature checkpointing         | LangGraph JS  |
| Explicit Supervisor + hand-wired workflows                  | Mastra        |
| Python stack with mature multi-agent ecosystem              | CrewAI        |
| AI app toolkit with broad model-provider support            | Vercel AI SDK |
| **TypeScript, goal to result with auto task decomposition** | **codefleet** |

**vs. LangGraph JS.** LangGraph compiles a declarative graph (nodes, edges, conditional routing) into an invokable. `codefleet` runs a Coordinator that decomposes the goal into a task DAG at runtime, then auto-parallelizes independents. Same end (orchestrated execution), opposite directions: LangGraph is graph-first, CodeFleet is goal-first.

**vs. Mastra.** Both are TypeScript-native. Mastra's Supervisor pattern requires you to wire agents and workflows by hand; CodeFleet's Coordinator does the wiring at runtime from the goal string. If the workflow is known up front, Mastra's explicitness pays off. If you'd rather not enumerate every step, CodeFleet's `runTeam(team, goal)` is one call.

**vs. CrewAI.** CrewAI is the mature multi-agent option in Python. CodeFleet targets TypeScript backends with three runtime dependencies and direct Node.js embedding. Roughly comparable orchestration surface; the choice is the language stack.

**vs. Vercel AI SDK.** AI SDK provides the LLM-call layer — provider abstraction, streaming, tool calls, and structured outputs. It does not orchestrate goal-driven multi-agent teams. The two are complementary: AI SDK for app surfaces and single-agent calls, CodeFleet when you need a team.

## Ecosystem

`codefleet` launched 2026-04-01 under MIT. Known users and integrations to date:

**In production**

- **[temodar-agent](https://github.com/xeloxa/temodar-agent)** (~60 stars). WordPress security analysis platform by [Ali Sünbül](https://github.com/xeloxa). Uses our built-in tools (`bash`, `file_*`, `grep`) directly inside a Docker runtime. Confirmed production use.

**Integrations**

- **[Engram](https://www.engram-memory.com)** — "Git for AI memory." Syncs knowledge across agents instantly and flags conflicts. ([repo](https://github.com/Agentscreator/engram-memory))
- **[@agentsonar/codefleet](https://github.com/agentsonar/agentsonar-codefleet)** — Sidecar detecting cross-run delegation cycles, repetition, and rate bursts.

**Provider community offers** — limited-time, not paid endorsements.

- **[MiniMax](https://platform.minimax.io/subscribe/coding-plan?code=6ZoOY13DDV&source=link)** — Use MiniMax M3 in CodeFleet's TypeScript multi-agent workflows. CodeFleet users get 12% off the MiniMax Token Plan until 2026-06-30. See the [MiniMax setup guide](https://github.com/spideydev00/codefleet/blob/main/docs/providers/minimax.md).

Using `codefleet` in production or a side project? [Open a discussion](https://github.com/spideydev00/codefleet/discussions) and we will list it here. For a deep integration, see the [Featured partner program](https://github.com/spideydev00/codefleet/blob/main/docs/featured-partner.md).

## Repository

This is a monorepo. The published package is **`@codefleet/core`**, and it lives in [`packages/core/`](packages/core/) — the source of truth for the library, its tests, examples, and the npm package page.

```
codefleet/
├── packages/
│   └── core/          # @codefleet/core — the published library
│       ├── src/       # framework source
│       ├── tests/     # vitest suite
│       └── examples/  # runnable examples (npx tsx packages/core/examples/<path>.ts)
└── docs/              # subsystem documentation
```

Build, lint, and test orchestrate across the workspace from the repo root:

```bash
npm install            # install all workspaces
npm run build          # compile packages/core
npm run lint           # type-check
npm test               # run the test suite
```

## Documentation

- [Providers](https://github.com/spideydev00/codefleet/blob/main/docs/providers.md) — env vars, model examples, local tool-calling, timeouts, troubleshooting.
- [Tool configuration](https://github.com/spideydev00/codefleet/blob/main/docs/tool-configuration.md) — tool presets, custom tools, the filesystem sandbox, and MCP.
- [Observability](https://github.com/spideydev00/codefleet/blob/main/docs/observability.md) — `onProgress` events, `onTrace` spans, and the post-run dashboard.
- [Shared memory](https://github.com/spideydev00/codefleet/blob/main/docs/shared-memory.md) — the default store and custom `MemoryStore` backends.
- [Context management](https://github.com/spideydev00/codefleet/blob/main/docs/context-management.md) — sliding window, summarization, compaction, and custom compressors.
- [CLI](https://github.com/spideydev00/codefleet/blob/main/docs/cli.md) — the JSON-first `codefleet` binary for shell and CI.
- [Consensus](https://github.com/spideydev00/codefleet/blob/main/docs/consensus.md) — the `runConsensus` proposer→judge primitive, the per-task `verify` hook, and the budget invariant.
- [Model routing](https://github.com/spideydev00/codefleet/blob/main/docs/model-routing.md) — the opt-in `modelRouting` policy: match by phase / agent / role / priority / leaf, first match wins.
- [Forge](docs/forge.md) — the plan→execute→merge control plane for repository changes.

## Contributing

Issues, feature requests, and PRs are welcome. Some areas where contributions would be especially valuable:

- **Production examples.** Real-world end-to-end workflows. See [`packages/core/examples/production/README.md`](packages/core/examples/production/README.md) for the acceptance criteria and submission format.
- **Documentation.** Guides, tutorials, and API docs.
- **Translations.** Help translate the docs into other languages. [Open a PR](https://github.com/spideydev00/codefleet/pulls).

## Contributors

<a href="https://github.com/spideydev00/codefleet/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=spideydev00/codefleet&max=100&v=20260529" />
</a>

Full credits by area are on the [package page](packages/core/README.md#contributors).

## License

MIT
