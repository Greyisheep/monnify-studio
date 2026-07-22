# Monnify Studio (web)

> To run the whole product (web + API) in one command, use `docker compose up`
> from the repo root — see the top-level `README.md`. The steps below are for
> working on the web app on its own.

Next.js + React Flow shell for the Monnify Studio canvas: edit the payment IR,
run Architecture Review, and Apply Fix against the FastAPI analyzer.

Tracks Epic 1 Lane C work: canvas + typed editing (#4), Architecture Review UI
(#27). Design craft is intentional (D14). IR contract is D6.

## What you get

| Area | Behaviour |
|------|-----------|
| Canvas | React Flow graph of the marketplace hero (unsafe / safe toggle) |
| Edit | Add / delete / connect nodes with typed connection checks |
| Config | Business fields + advanced JSON for the selected node |
| Review | Severity counts, finding cards, path highlight, Explain / Docs |
| Remediate | Apply Fix (one rule or all) via the backend remediation engine |
| Layout | Dagre re-layout after Apply Fix when the graph structure changes (#37) |
| Offline | Local fixtures in `src/data/` if the API is down |

## Quickstart

Needs Node 20+ and the API from `apps/api` when you want Live API mode.

```bash
# Terminal 1 - API (Python 3.11+, typically port 8010)
cd apps/api
# activate your venv, then:
uvicorn monnify_studio.api.main:app --reload --port 8010

# Terminal 2 - web
cd apps/web
cp .env.example .env.local   # if you do not already have one
npm install
npm run dev                  # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` defaults to `http://127.0.0.1:8010`. If the API is
unreachable, the UI still loads hero fixtures and marks the source as
"Local fixtures".

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run typecheck` | `tsc --noEmit` |

## Source map

```
src/
├── app/                 # Next entry + globals.css design tokens
├── components/          # Header, toolbar, canvas, config, review, node
├── hooks/
│   ├── useStudioSession.ts   # load / save / analyze / remediate
│   └── useStudioGraph.ts     # connect, add, delete, update selection
├── lib/
│   ├── api.ts                # FastAPI client + fixture fallback
│   ├── flowIo.ts             # IR <-> React Flow
│   ├── layout.ts             # Dagre auto-layout after structure changes (#37)
│   ├── findings.ts           # highlight + diff copy helpers
│   └── constants.ts          # heroes + palette
├── types/               # Interim hand ports of IR/analysis (see D6)
└── data/                # Offline marketplace-unsafe / -safe payloads
```

Read [`docs/ENGINEERING_STANDARDS.md`](../../docs/ENGINEERING_STANDARDS.md) §6
for the frontend rules this tree is held to.

## Design tokens (D14)

Tokens live in `src/app/globals.css` under `:root` (`--ink`, `--paper`,
`--accent`, category colors, fonts). Prefer extending those variables over
adding one-off colors in components.

## IR types (D6, interim)

`src/types/` currently mirrors backend Pydantic shapes by hand. That is an
acknowledged interim until Phase 1.1 JSON Schema -> TypeScript codegen lands
(see BUILD_PLAN D6). Do not grow a parallel IR here; fix the backend contract
and plan to regenerate.

UI-only types (`StudioNodeData` in `types/canvas.ts`) stay frontend-owned.

## Related docs

- [`docs/BUILD_PLAN.md`](../../docs/BUILD_PLAN.md) - epics, phases, decisions
- [`docs/ENGINEERING_STANDARDS.md`](../../docs/ENGINEERING_STANDARDS.md) - APOSD + FE standards
- Root [`README.md`](../../README.md) - product thesis + combined quickstart
