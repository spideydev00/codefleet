# CLI provider configuration

CodeFleet providers are command-line presets. They select an executable, its base arguments, how the prompt is passed, and optionally an env file.

CodeFleet does not call model APIs or SDKs. Every provider runs through the same non-shell child-process wrapper.

## Defaults

| Role | Default preset | Behavior |
|------|----------------|----------|
| Orchestrator | `claude` | `claude -p --model claude-opus-4-8 --effort medium`; prompt via stdin. |
| Worker | `codex` | `codex exec` with `gpt-5.5`, high reasoning effort, and autonomous non-interactive execution. |

The orchestrator plans the task DAG and resolves conflicts. The worker implements tasks inside isolated disposable Git worktrees.

## Available orchestrator presets

### `claude`

Uses the authenticated Claude CLI:

```text
claude -p --model claude-opus-4-8 --effort medium
```

The prompt is sent through stdin.

### `gemini`

Uses the Gemini CLI in plan approval mode:

```text
gemini --approval-mode plan -o text -p <prompt>
```

The prompt is appended as an argument after `-p`.

### `kimi`, `glm`, and `deepseek`

These presets run `claude -p` against a Claude-compatible endpoint. Each preset loads a provider-specific env file:

| Preset | Env file |
|--------|----------|
| `kimi` | `~/.claude-kimi-env` |
| `glm` | `~/.claude-glm-env` |
| `deepseek` | `~/.claude-deepseek-env` |

Use this pattern with values supplied by your provider:

```sh
# ~/.claude-glm-env  (example pattern — fill in your provider's values)
export ANTHROPIC_BASE_URL="<provider-anthropic-compatible-endpoint>"
export ANTHROPIC_AUTH_TOKEN="<your-api-key>"
```

CodeFleet reads the env file directly, expands `~`, and merges its values with the inherited process environment. `PATH` and other existing variables remain available.

Accepted env-file syntax includes:

```sh
# Comments and blank lines are ignored
export KEY="quoted value"
OTHER_KEY='another value'
PLAIN_KEY=value
```

Kimi or DeepSeek env files may already exist if you previously configured those providers for manual Claude CLI use.

For manual terminal use, an alias is optional:

```sh
alias glm='source ~/.claude-glm-env && claude'
```

CodeFleet does not use or require this alias.

## Worker preset

### `codex`

The built-in worker preset invokes:

```text
codex exec -m gpt-5.5 -c model_reasoning_effort=high --dangerously-bypass-approvals-and-sandbox <prompt>
```

The prompt is passed as an argument. The bypass flag allows Codex to edit files autonomously and non-interactively; CodeFleet limits each task to an isolated disposable worktree and later derives the actual Git diff before integration.

## Configure defaults

Run the interactive selector:

```bash
codefleet config
```

Set defaults without the interactive prompt:

```bash
codefleet config --set-orchestrator glm
codefleet config --set-worker codex
```

Both may be set in one command:

```bash
codefleet config --set-orchestrator gemini --set-worker codex
```

Inspect the saved configuration:

```bash
codefleet config --show
```

Defaults are stored in:

```text
~/.codefleet/config.json
```

Example:

```json
{
  "orchestrator": "claude",
  "worker": "codex"
}
```

## Override one run

CLI flags take precedence over saved defaults:

```bash
codefleet "Refactor the authentication middleware" \
  --orchestrator gemini \
  --worker codex
```

Programmatic callers use `orchestratorProvider` and `workerProvider`:

```typescript
import { runCodeFleet } from '@codefleet/core'

await runCodeFleet({
  repoRoot: process.cwd(),
  userPrompt: 'Refactor the authentication middleware',
  orchestratorProvider: 'glm',
  workerProvider: 'codex',
})
```

Provider objects can also be injected directly when a named preset is not sufficient.

## Requirements

- `claude` preset: authenticated `claude` executable.
- `gemini` preset: installed and authenticated `gemini` executable.
- `kimi`, `glm`, or `deepseek`: installed `claude` executable plus the matching env file.
- `codex` worker: installed `codex` executable.

See [CodeFleet architecture](codefleet.md) for how provider output is validated and integrated.
