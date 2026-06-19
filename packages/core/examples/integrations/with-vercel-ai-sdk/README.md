# with-vercel-ai-sdk

A Next.js demo showing **codefleet** (CodeFleet) and **Vercel AI SDK** working together:

- **CodeFleet** orchestrates a research team (researcher agent + writer agent) via `runTeam()`
- **AI SDK** streams the result to a chat UI via `useChat` + `streamText`

## How it works

```
User message
  │
  ▼
API route (app/api/chat/route.ts)
  │
  ├─ Phase 1: CodeFleet runTeam()
  │    coordinator decomposes goal → researcher gathers info → writer drafts article
  │
  └─ Phase 2: AI SDK streamText()
       streams the team's output to the browser
  │
  ▼
Chat UI (app/page.tsx) — useChat hook renders streamed response
```

## Setup

```bash
# 1. From repo root, install CodeFleet dependencies
cd ../../../../..
npm install

# 2. Back to this example
cd packages/core/examples/integrations/with-vercel-ai-sdk
npm install

# 3. Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# 4. Run
npm run dev
```

`npm run dev` automatically builds CodeFleet before starting Next.js (via the `predev` script).

Open [http://localhost:3000](http://localhost:3000), type a topic, and watch the research team work.

## Prerequisites

- Node.js >= 18
- `ANTHROPIC_API_KEY` environment variable (used by both CodeFleet and AI SDK)

## Key files

| File | Role |
|------|------|
| `app/api/chat/route.ts` | Backend — CodeFleet orchestration + AI SDK streaming |
| `app/page.tsx` | Frontend — chat UI with `useChat` hook |
| `package.json` | References CodeFleet via `file:../../..` (local link) |
