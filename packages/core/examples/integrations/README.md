# examples/integrations/

CodeFleet wired to external systems: MCP servers, observability backends, other
frameworks, app shells. Runnable starting points, not product docs.

Two categories live here.

**Reference integrations** demonstrate wiring against widely used protocols
or frameworks. The CodeFleet team maintains these once merged, regardless of who
contributed them. Current:

- `mcp-github.ts`: MCP servers via `connectMCPTools()`.
- `trace-observability.ts`: the `onTrace` API.
- `with-vercel-ai-sdk/`: Next.js + AI SDK + `runTeam()`.
- `express-customer-support/`: Express REST API + `runTasks()`. Contributed
  by [@CodingBangboo](https://github.com/CodingBangboo) via #191.

**Vendor integrations** show CodeFleet paired with a specific third-party
commercial product. They live under `with-<product>/` and stay credited to
the contributor. Current:

- `with-engram/`: Engram memory backend. Contributed by
  [@Agentscreator](https://github.com/Agentscreator) via #160.
- `with-tencentdb-memory/`: TencentDB-Agent-Memory long-term memory (L0→L3
  pipeline) via its Hermes Gateway sidecar.

## Submitting a reference integration

Open a PR following the conventions in [`examples/README.md`](../README.md).
For widely used protocols or frameworks, no prior discussion needed. For
niche ones, open a discussion first so we can confirm the wiring is worth
maintaining long-term.

## Submitting a vendor integration

One condition: the integration is reciprocal. Your product's repo or docs
should reference CodeFleet as a supported integration. No payment involved, this
is a signal filter for who has actually shipped against CodeFleet.

Flow:

1. Open a [discussion](https://github.com/spideydev00/codefleet/discussions)
   with the link to CodeFleet in your product's docs and a sketch of the example.
2. Wait for a maintainer reply confirming the example is in scope.
3. PR it. Follow the conventions in [`examples/README.md`](../README.md).

If your product doesn't reference CodeFleet yet, open a discussion to get listed
in the [Ecosystem](../../README.md#ecosystem) section.

The [Featured Partner program](../../docs/featured-partner.md) is separate
and paid, for prominent README placement. Eligibility is an active CodeFleet
integration; reciprocal listing isn't required.

## Out of scope here

- Marketing copy for a third-party product.
- Examples gated behind paid-only APIs with no free or trial tier.
- Thin `connectMCPTools()` wrappers whose only difference from `mcp-github.ts`
  is the server name and prefix. Those belong in your own docs.
