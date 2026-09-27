#!/usr/bin/env node
// Drives the skyhooks yard app: starts/stops the production server, runs API smoke
// checks, takes screenshots, and drives the crane cab, the Gemini co-pilot and the
// supervisor handoff wizard through the UI.
// Usage (from the repo root): node .claude/skills/run-skyhooks/driver.mjs <command> [args]
import { createRequire } from 'node:module';
import { execFile, execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const UNIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = 3000; // hardcoded in server.ts
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS_DIR || '/tmp/shots/skyhooks';
const LOG = '/tmp/skyhooks.log';

// Piping output into `head` closes stdout early; exit quietly instead of crashing on EPIPE
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0); throw e; });

const [cmd, ...args] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const positional = () => args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Playwright isn't a project dependency; use the container's global install
function playwright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* fall through */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

async function api(method, route, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}

async function up() {
  try { return (await fetch(BASE + '/api/health')).ok; } catch { return false; }
}

// Kill whatever listens on the port (never a broad pkill: it can match your own shell)
function stop() {
  execSync(`lsof -ti:${PORT} -sTCP:LISTEN | xargs -r kill`, { stdio: 'inherit', shell: '/bin/bash' });
}

async function start() {
  if (!existsSync(path.join(UNIT, 'dist/server.cjs'))) throw new Error('dist/server.cjs is missing: run `npm run build` first.');
  stop();
  for (let i = 0; i < 20 && await up(); i++) await sleep(250);
  const env = { ...process.env };
  // An empty GEMINI_API_KEY wins over .env.local (dotenv never overrides a set variable)
  if (args.includes('--no-ai')) env.GEMINI_API_KEY = '';
  const log = openSync(LOG, 'w');
  const child = spawn('node', ['dist/server.cjs'], { cwd: UNIT, detached: true, stdio: ['ignore', log, log], env });
  child.unref();
  for (let i = 0; i < 60; i++) {
    if (await up()) {
      const ai = (await api('GET', '/api/ai/status')).json;
      console.log(`up: ${BASE} (pid ${child.pid}, log ${LOG}); co-pilot ${ai?.configured ? `on, ${ai.model}` : 'off (no GEMINI_API_KEY)'}`);
      return;
    }
    await sleep(500);
  }
  throw new Error(`server did not answer /api/health within 30s; see ${LOG}`);
}

async function smoke() {
  const checks = [
    ['health answers ok', async () => (await api('GET', '/api/health')).json?.status === 'ok'],
    ['bundles listed', async () => (await api('GET', '/api/bundles')).json?.length > 0],
    ['unknown API route answers JSON 404', async () => {
      const r = await api('GET', '/api/nope');
      return r.status === 404 && /No API route/.test(r.json?.error);
    }],
    ['epoxy refused at a black-bar door', async () => {
      const r = await api('POST', '/api/bundles/b-1/force-load', { door: 'Door-8' });
      return r.status === 400 && /NW\/NE doors/.test(r.json?.error);
    }],
    ['wind of 25 mph or more locks out the gantry', async () => {
      const r = await api('POST', '/api/gantry/execute-route', { originId: 'Coat-Station', destinationId: 'Door-2', windSpeed: 30 });
      return r.status === 400 && /WIND LOCKOUT/.test(r.json?.error);
    }],
    ['co-pilot status answers', async () => typeof (await api('GET', '/api/ai/status')).json?.configured === 'boolean'],
    ['dashboard metrics', async () => typeof (await api('GET', '/api/dashboard')).json?.uvHazardsCount === 'number']
  ];
  let failed = 0;
  for (const [name, check] of checks) {
    const ok = await check().catch(() => false);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  }
  if (failed) throw new Error(`${failed} smoke check(s) failed`);
}

// Chromium doesn't trust this container's egress proxy CA; fetch any Google Fonts with
// curl (which does) so pages render with their real fonts and log no TLS errors
async function fontsViaCurl(context) {
  const run = promisify(execFile);
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async route => {
    const req = route.request();
    try {
      const { stdout } = await run('curl', ['-sS', '--fail', '-m', '20', '-A', req.headers()['user-agent'] || 'Mozilla/5.0', req.url()],
        { encoding: 'buffer', maxBuffer: 20 << 20 });
      const contentType = req.url().includes('googleapis') ? 'text/css; charset=utf-8' : 'font/woff2';
      await route.fulfill({ status: 200, body: stdout, contentType, headers: { 'access-control-allow-origin': '*' } });
    } catch {
      await route.abort();
    }
  });
}

async function withPage(width, fn) {
  const { chromium } = playwright();
  const browser = await chromium.launch();
  // Plant time, so ship dates and shift labels match what operators see
  const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'America/Chicago', locale: 'en-US' });
  await fontsViaCurl(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  try {
    await fn(page);
  } finally {
    await browser.close();
  }
  // Chromium logs every refused API call ("status of 400") as a console error; the app handles those
  const refusals = errors.filter(e => /status of 4\d\d/.test(e));
  const real = errors.filter(e => !refusals.includes(e));
  if (refusals.length) console.log(`API refusals shown to the user: ${refusals.length}`);
  console.log(real.length ? `console errors:\n  ${real.join('\n  ')}` : 'console errors: none');
  if (real.length) process.exitCode = 1;
}

async function open(page, route) {
  await page.goto(BASE + route);
  // Never wait for 'networkidle': the /api/updates SSE stream keeps a request open forever
  await page.locator('#main-navigation-bar').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600); // let colour transitions settle before a screenshot
}

async function snap(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: args.includes('--full') });
  console.log(`screenshot: ${file}`);
}

async function shot(route = '/') {
  const width = Number(flag('width', 1440));
  await withPage(width, async page => {
    await open(page, route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(`page: ${route} at ${width}px, horizontal overflow ${overflow}px`);
    await snap(page, `${route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'}-${width}`);
  });
}

// Crane cab: pick origin, drop zone, bundle and wind, then execute if the cab allows it
async function crane() {
  const from = flag('from');
  const to = flag('to');
  const tag = flag('tag');
  const wind = flag('wind');
  await withPage(1440, async page => {
    await open(page, '/crane');
    // selectOption waits 30s for a missing option; fail fast with the real choices instead
    const choose = async (label, value) => {
      const select = page.getByLabel(label);
      const values = await select.locator('option').evaluateAll(os => os.map(o => o.value));
      if (!values.includes(value)) throw new Error(`${label}: "${value}" is not a choice. Choices: ${values.join(', ')}`);
      await select.selectOption(value);
    };
    if (from) await choose('Pickup origin zone', from);
    if (to) await choose('Target drop zone', to);
    if (tag) {
      // The "Bundle To Carry" menu only renders when two or more bundles share the origin
      const carry = page.locator('#carry-bundle');
      const value = await carry.locator('option').evaluateAll((os, t) => os.find(o => o.textContent.trim().startsWith(t))?.value, tag);
      const onlyOne = (await page.locator('text=/Bundle Ready:/').first().innerText().catch(() => '')).includes(tag);
      if (value) await carry.selectOption(value);
      else if (!onlyOne) throw new Error(`${tag} is not at ${await page.getByLabel('Pickup origin zone').inputValue()}`);
    }
    if (wind) await page.getByLabel('Wind speed in mph').fill(String(wind));
    await page.waitForTimeout(600);
    const button = page.getByRole('button', { name: /Execute Gantry Move|Move Blocked|Wind Lockout/ });
    const label = (await button.innerText()).trim();
    const route = `${await page.getByLabel('Pickup origin zone').inputValue()} -> ${await page.getByLabel('Target drop zone').inputValue()}`;
    const carried = (await page.locator('text=/Bundle Ready:/').first().innerText().catch(() => 'no bundle')).replace('Bundle Ready: ', '');
    if (await button.isDisabled()) {
      // Zoning and ships-first blocks explain themselves in an alert; the wind lockout only relabels the button
      const alert = page.getByRole('alert').first();
      const why = (await alert.isVisible()) ? ` ${(await alert.innerText()).replace(/\s+/g, ' ')}` : '';
      console.log(`crane: ${route} (${carried}) blocked before sending: ${label}.${why}`);
      await snap(page, 'crane');
      process.exitCode = 2;
      return;
    }
    await button.click();
    const toast = page.locator('#global-toast-notification');
    await toast.waitFor();
    console.log(`crane: ${route} (${carried}): ${(await toast.innerText()).replace(/\s+/g, ' ').trim()}`);
    const moved = (await api('GET', '/api/bundles')).json.find(b => b.tagId === carried);
    if (moved) console.log(`server says: ${moved.tagId} at ${moved.location} (${moved.status})`);
    await page.waitForTimeout(600);
    await snap(page, 'crane');
  });
}

// Ask the Gemini co-pilot a question through the chat panel
async function ask() {
  const question = positional();
  if (!question) throw new Error('usage: ask "your question"');
  await withPage(1440, async page => {
    await open(page, '/');
    await page.locator('#ai-copilot-launch-btn').click(); // the overview also has a "Launch AI Co-Pilot" button
    await page.getByLabel('Ask the co-pilot').fill(question);
    await page.keyboard.press('Enter');
    // The log shows a "Gemini is analyzing live yard telemetry..." placeholder until the answer lands
    await page.waitForFunction(() => {
      const log = document.querySelector('#ai-assistant-modal-container [role=log]');
      return log && !/analyzing live yard/i.test(log.innerText) && log.querySelectorAll(':scope > div').length >= 3;
    }, null, { timeout: 120000 });
    const answer = await page.locator('#ai-assistant-modal-container [role=log] > div').last().innerText();
    // innerText puts each list marker on its own line; join them back up for the terminal
    console.log(`co-pilot:\n${answer.replace(/^(•|\d+[.)])\s*\n/gm, '$1 ').trim()}`);
    await snap(page, 'copilot');
  });
}

// Supervisor shift handoff wizard, all three steps
async function handoff() {
  const note = positional() || 'Handoff from the run-skyhooks driver.';
  const name = flag('name', 'Driver Supervisor');
  await withPage(1440, async page => {
    await open(page, '/');
    await page.getByRole('button', { name: /Supervisor Shift Handoff/ }).click();
    await page.getByRole('button', { name: /Acknowledge & Continue/ }).click();
    // The wizard's labels aren't tied to its fields, so find them inside the dialog
    const dialog = page.locator('#handoff-modal-close').locator('xpath=ancestor::div[contains(@class,"fixed")]');
    await dialog.locator('input').first().fill(name);
    await dialog.locator('textarea').fill(note);
    await page.getByRole('button', { name: /Review Summary/ }).click();
    await snap(page, 'handoff');
    await page.getByRole('button', { name: /Finalize Shift Handoff/ }).click();
    await page.waitForTimeout(1500);
    const latest = (await api('GET', '/api/shift-messages')).json[0];
    console.log(`handoff logged: ${latest.sender} (${latest.shift}): ${latest.content}`);
  });
}

const commands = {
  start, stop: async () => stop(), smoke, shot: () => shot(args.find(a => a.startsWith('/'))), crane, ask, handoff
};
if (!commands[cmd]) {
  console.log([
    'commands: start [--no-ai] | stop | smoke | shot [/route] [--width N] [--full]',
    '          crane [--from Coat-Station] [--to Door-2] [--tag TG-201] [--wind 8]',
    '          ask "question" | handoff "note" [--name "Supervisor"]'
  ].join('\n'));
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch(e => { console.error(`error: ${e.message}`); process.exit(1); });
