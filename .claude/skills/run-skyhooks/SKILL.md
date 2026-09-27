---
name: run-skyhooks
description: Build, start, stop and drive the skyhooks rebar yard app (Express + React + Gemini co-pilot). Use when asked to run or launch skyhooks, smoke-test its API, screenshot a screen, do a crane move, ask the AI co-pilot something, run the shift handoff wizard, or run its tests.
---

skyhooks is one Express server (API, SSE, Gemini co-pilot and the built React client) on port 3000.
Drive it with `.claude/skills/run-skyhooks/driver.mjs`: it starts and stops the production build,
runs API smoke checks, and uses Playwright to screenshot screens and drive the crane cab, co-pilot
and handoff wizard. All paths are relative to the repo root.

## Prerequisites

Node 22 and Bun (the lockfile is `bun.lock`). Playwright is **not** a project dependency: the
driver loads the container's global install (`npm root -g`) with browsers in `/opt/pw-browsers`.
Don't run `playwright install`.

## Setup and build

```bash
bun install --frozen-lockfile
npm run build          # client -> dist/, server -> dist/server.cjs
```

Optional: the co-pilot needs a Gemini key in `.env.local`, which is git-ignored and loaded by `server.ts`.
Everything else works without it. Never commit the key or put it in code.

```bash
printf 'GEMINI_API_KEY="%s"\n' "$GEMINI_API_KEY" > .env.local && chmod 600 .env.local
```

## Run (agent path)

```bash
D=.claude/skills/run-skyhooks/driver.mjs
node $D start                     # kills anything on :3000, starts dist/server.cjs, prints co-pilot on/off + model
node $D smoke                     # 7 API checks, PASS/FAIL, non-zero exit on failure
node $D shot /crane               # screenshot a route at 1440px
node $D crane --to Door-1         # blocked by ships-first before sending: prints why, exit 2
node $D crane --wind 30           # wind lockout: exit 2
node $D crane                     # the cab's default move: TG-201 Coat-Station -> Door-2 (run the blocked ones first)
node $D ask "Which bundles ship in the next two days, and where are they?"
node $D handoff "TG-201 is on Door-2 for tomorrow." --name "Skill Verifier"
node $D start --no-ai             # same server with the co-pilot switched off
node $D stop
```

Screenshots go to `/tmp/shots/skyhooks/` (override with `SHOTS_DIR`). The server log is `/tmp/skyhooks.log`.

| command | what it does |
|---|---|
| `start [--no-ai]` / `stop` | Start the production server detached, or kill the port's listener |
| `smoke` | Health, bundles, JSON 404, grade-zoning refusal, wind lockout, co-pilot status, dashboard |
| `shot [/route] [--width N] [--full]` | Screenshot, and report horizontal overflow and console errors |
| `crane [--from Z] [--to Z] [--tag T] [--wind N]` | Set the crane cab and press Execute. It prints the toast and the server's new location, or exits 2 with the reason when the cab blocks the move |
| `ask "question"` | Ask the co-pilot in its chat panel and print the answer (5-10s with a key) |
| `handoff "note" [--name N]` | Run the 3-step handoff wizard and print the shift message it logged |

Every browser command prints `console errors: none` or lists them, and exits 1 if there were any.

**Direct invocation** (no server, for PRs that touch rules or routes):

```bash
node --import tsx -e "import('./src/yardRules.ts').then(r => console.log(r.slottingConflict({ id: 'm', tagId: 'M', location: 'Coat-Station', shippingDate: '2026-10-02' }, 'Door-1', [{ id: 'a', tagId: 'A', location: 'Door-1', shippingDate: '2026-10-01' }])?.tagId))"
SKYHOOK_NO_LISTEN=1 GEMINI_API_KEY= node --import tsx -e "import('./server.ts').then(async ({ app }) => { const s = app.listen(0); await new Promise(r => s.once('listening', r)); console.log(await (await fetch('http://127.0.0.1:' + s.address().port + '/api/ai/status')).text()); s.close(); })"
```

## Test

```bash
npm run lint   # tsc --noEmit
npm test       # 36 tests: yard rules, sample data, Markdown renderer, API tests against the real Express app (no Gemini calls)
```

## Gotchas

- **The API checks request bodies.** Text fields must be strings within their length caps (for example `operatorName` 80 and `description` 1,000 characters), numeric fields must be real numbers, and a body over 100 KB gets 413. A `curl` call that sends numbers as strings (`"windSpeed": "30"`) gets a 400 naming the field.
- **Drops come off a crane hook.** `/api/bundles/:id/drop` refuses a bundle that isn't on a crane, so pick it up first (`crane` does both). Each hook takes one load, and a bundle in a bender can't be lifted until it's marked bent. Smoke checks use a refused `force-load` so they leave the yard untouched.
- **Port 3000 is hardcoded** (`server.ts`). The sibling Sky-hookz repo uses it too, so run one app at a time. The driver's `start` frees the port first.
- **Don't stop it with `pkill -f "node dist/server.cjs"`.** The pattern matches the shell running the command and kills it (exit 144). Kill the port's listener instead, as `stop` does.
- **Never wait for `networkidle`.** `/api/updates` is a Server-Sent Events stream that stays open, so `waitForLoadState('networkidle')` times out after 30s. Wait for an element instead.
- **An empty `GEMINI_API_KEY` beats `.env.local`.** dotenv never overrides a variable that is already set, even to `''`. That is how `start --no-ai` and the tests switch the co-pilot off. If the co-pilot is unexpectedly off, check your environment.
- **Without a key**, the Gemini SDK prints `API key should be set when using the Gemini API.` at startup. It's harmless. `ask` then shows the app's "not configured" message and exits 1, because the 503 counts as a real error.
- **The co-pilot allows 12 requests a minute per client.** A tight loop of `ask` calls gets 429s. Restarting the server resets the count.
- **Two buttons match `/AI CO-PILOT/i`** on the overview: the nav button and "Launch AI Co-Pilot". Use `#ai-copilot-launch-btn`.
- **The chat log shows a placeholder** ("Gemini is analyzing live yard telemetry...") before the answer. Wait for it to go, not just for a new message.
- **Refused moves log a console error.** Chromium prints `Failed to load resource: ... status of 400` for every API refusal the app handles. The driver counts these as "API refusals shown to the user", not as errors.
- **State is in memory, and sample dates are relative to server start.** After `crane`, TG-201 stays on Door-2 until the server restarts, so a second `crane` carries "no bundle". Don't hard-code ship dates in checks.
- **Screenshots use plant time** (`America/Chicago`). Date-only ship dates render per time zone, and a UTC browser can show a different day than operators see.
- **Colour transitions.** A blocked button fades to grey, so the driver waits 600ms before screenshots. Without it, the button can still look green.
- **Google Fonts can't load in this container** (Chromium distrusts the proxy CA). skyhooks doesn't use them, but the driver still serves any font request through `curl`, so pages render the same as elsewhere.

## Troubleshooting

- **`error: dist/server.cjs is missing`**: run `npm run build`.
- **`co-pilot off (no GEMINI_API_KEY)` after `start`**: `.env.local` is missing, or `GEMINI_API_KEY` is set to empty in your shell. Run `unset GEMINI_API_KEY`, or pass the key when starting.
- **`error: TG-201 is not at Coat-Station`** from `crane --tag`: the bundle already moved. Restart with `node $D start` to reset the yard. (`--tag` works whether or not the "Bundle To Carry" menu is shown; it only appears when two or more bundles share the origin.)
- **`error: Target drop zone: "Door-3" is not a choice. Choices: Door-1, Door-2, Door-7, Rack K-1, Rack K-2`**: the crane cab only offers those drop zones (and a fixed list of pickup zones). Use one of them, or call `/api/gantry/execute-route` directly for other zones.
- **`page.waitForLoadState: Timeout 30000ms exceeded`** in your own script: see the `networkidle` gotcha.
