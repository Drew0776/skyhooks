# SkyHook Yard Logistics (with Gemini co-pilot)

SkyHook tracks every rebar bundle in a fabrication yard from raw stock to the trailer, and checks every crane move before it happens. This build adds a Gemini-powered co-pilot and a supervisor shift-handoff wizard to the main build in [Sky-hookz](https://github.com/Drew0776/Sky-hookz).

## Features

- **Crane cab** (`/crane`): gantry transit from a pickup zone to a drop zone, with a bundle picker, wind/sway readings and zoning and ships-first warnings before the move is sent. Reported wind of **25 mph or more locks out gantry travel**.
- **Floor trigger** (`/floor`): stage, bend and export a PDF floor report.
- **Yard map, jobs, exceptions, dashboard**: inventory, order progress, QC audits, UV exposure and shift throughput.
- **AI co-pilot**: yard Q&A, route reviews and shift-log checks. Answers come from live yard data (ship dates, outdoor exposure, open exceptions) and the same yard rules the server enforces. Route reviews include the server's verdict on the move and, when it's refused, the legal alternatives.
- **Shift handoff wizard**: open exceptions, supervisor notes and confirmation for the incoming shift.

## Yard rules

Shared by the server and the screens in [`src/yardRules.ts`](src/yardRules.ts):

- **Grade zoning.** Black and epoxy are never mixed. Black (uncoated, ASTM A615) bar stays in the SW zone, and coated epoxy never goes into a black-bar area: Raw-SW, the SW black-bar racks or Doors 7–8. Shears, benders and the coat line take either grade.
- **Ships-first stacking.** A bundle can't be set on a spot that holds a bundle shipping sooner.
- **Gantry interlocks.** A parked crane on the path blocks a move. Crossing a zone at 60% of capacity forces slow mode, and 85% blocks it. ASTM A934 bundles skip slow mode.
- **Hard stops.** QC-rejected bundles can't move, and wind of 25 mph or more locks out gantry travel.
- **UV exposure.** Epoxy outdoors for 25 days raises a warning, ahead of the common 30-day covering guidance. ASTM D3963 requires opaque covering once total exposure is expected to exceed two months.
- **Shifts.** First shift runs 6:00 AM to 4:30 PM plant time (America/Chicago).

## Getting started

Requires Node.js 22 and [Bun](https://bun.sh) for installs (the lockfile is `bun.lock`).

```bash
bun install
cp .env.example .env.local   # then set GEMINI_API_KEY to enable the co-pilot
npm run dev                  # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Enables the AI co-pilot. Without it, the AI endpoints return 503 with setup instructions and the rest of the app works normally. Keep it in `.env.local` (git-ignored) or your host's secrets, never in code. |
| `GEMINI_MODEL` | Optional. Gemini model for the co-pilot (default `gemini-3.8-flash`). Set `gemini-flash-latest` to follow Google's newest Flash model automatically. |
| `APP_URL` | Public URL of the deployed app (set automatically on AI Studio). |

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the server with the Vite dev middleware |
| `npm run lint` | Type-check with `tsc --noEmit` |
| `npm test` | Unit tests for the yard rules plus API tests against the real Express app |
| `npm run build` | Build the client into `dist/` and bundle the server into `dist/server.cjs` |
| `npm start` | Serve the production build from `dist/` |

The yard state is kept in memory and starts from [`src/seedData.ts`](src/seedData.ts), which is fictional sample data. Its ship dates and timestamps are relative to server start, so the sample schedule is always current.

## API highlights

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/gantry/execute-route` | `originId`, `destinationId`, optional `bundleId`, `windSpeed`, `ropeSway` |
| POST | `/api/bundles/:id/pickup`, `/drop`, `/stage`, `/force-load` | Crane and floor moves with zoning checks |
| POST | `/api/ai/query`, `/api/ai/optimize-route`, `/api/ai/analyze-logs` | Gemini co-pilot (503 when no key is set). Up to 12 requests a minute per client address; questions up to 2,000 characters |
| GET | `/api/ai/status` | Whether the co-pilot is configured, and its model |
| GET | `/api/dashboard` | Stage counts, UV hazards, shift throughput |
| GET | `/api/updates` | Server-Sent Events stream of state changes |

Errors are returned as JSON: `{ "error": "..." }`. CI (`.github/workflows/ci.yml`) runs the type-check, tests and build on every pull request.
