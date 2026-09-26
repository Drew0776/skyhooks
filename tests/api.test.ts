import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Import the Express app without opening port 3000, and without a Gemini key
process.env.SKYHOOK_NO_LISTEN = '1';
process.env.GEMINI_API_KEY = '';
const { app, resetYardState, aiSystemInstruction } = await import('../server');

let server: Server;
let base = '';

before(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => resetYardState());

async function call(method: string, path: string, body?: unknown, rawBody?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json };
}

test('unknown API routes and malformed JSON answer in JSON', async () => {
  const missing = await call('GET', '/api/nope');
  assert.equal(missing.status, 404);
  assert.match(missing.json.error, /No API route/);

  const bad = await call('POST', '/api/bundles/b-1/drop', undefined, '{not json');
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /not valid JSON/);
});

test('drop enforces grade zoning', async () => {
  const epoxyAtSwDoor = await call('POST', '/api/bundles/b-1/drop', { location: 'Door-8' });
  assert.equal(epoxyAtSwDoor.status, 400);
  assert.match(epoxyAtSwDoor.json.error, /NW\/NE doors/);

  const blackInNorthRack = await call('POST', '/api/bundles/b-4/drop', { location: 'Rack K-1' });
  assert.equal(blackInNorthRack.status, 400);
  assert.match(blackInNorthRack.json.error, /SW-only/);
});

test('execute-route enforces the wind lockout and checks the chosen bundle', async () => {
  const windy = await call('POST', '/api/gantry/execute-route', { originId: 'Rack J-04', destinationId: 'Door-2', windSpeed: 30 });
  assert.equal(windy.status, 400);
  assert.match(windy.json.error, /WIND LOCKOUT/);

  const notThere = await call('POST', '/api/gantry/execute-route', { originId: 'Rack J-04', destinationId: 'Door-2', bundleId: 'b-2', windSpeed: 8 });
  assert.equal(notThere.status, 400);
  assert.match(notThere.json.error, /not at Rack J-04/);

  const unknownZone = await call('POST', '/api/gantry/execute-route', { originId: 'Moon', destinationId: 'Door-2' });
  assert.equal(unknownZone.status, 400);
});

test('AI endpoints explain that no Gemini key is configured', async () => {
  for (const path of ['/api/ai/query', '/api/ai/optimize-route', '/api/ai/analyze-logs']) {
    const r = await call('POST', path, { prompt: 'Where is TG-101?', originId: 'Rack J-04', destinationId: 'Door-1' });
    assert.equal(r.status, 503, path);
    assert.match(r.json.error, /GEMINI_API_KEY/);
  }
  const status = await call('GET', '/api/ai/status');
  assert.equal(status.json.configured, false);
  assert.match(status.json.model, /^gemini-/);
});

test('dashboard metrics answer', async () => {
  const dash = await call('GET', '/api/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(typeof dash.json.uvHazardsCount, 'number');
});

test('drop refuses to bury a bundle that ships sooner', async () => {
  // TG-201 (b-3) ships the day after TG-103 (b-6), which sits on Door-1
  const buried = await call('POST', '/api/bundles/b-3/drop', { location: 'Door-1' });
  assert.equal(buried.status, 400);
  assert.match(buried.json.error, /SLOTTING VIOLATION.*TG-103/);

  const route = await call('POST', '/api/gantry/execute-route', { originId: 'Coat-Station', destinationId: 'Door-1', bundleId: 'b-3', windSpeed: 8 });
  assert.equal(route.status, 400);
  assert.match(route.json.error, /SLOTTING VIOLATION/);
});

test('the crane cab default move (Coat-Station to Door-2) goes through', async () => {
  const r = await call('POST', '/api/gantry/execute-route', { originId: 'Coat-Station', destinationId: 'Door-2', bundleId: 'b-3', windSpeed: 8 });
  assert.equal(r.status, 200, r.json?.error);
});

test('seed ship dates start today or later', async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { json } = await call('GET', '/api/bundles');
  for (const b of json) {
    const [y, m, d] = b.shippingDate.split('-').map(Number);
    assert.ok(new Date(y, m - 1, d) >= today, `${b.tagId} ships ${b.shippingDate}`);
  }
});

test('AI requests are validated before any Gemini call', async () => {
  const long = await call('POST', '/api/ai/query', { prompt: 'x'.repeat(2001) });
  assert.equal(long.status, 400);
  assert.match(long.json.error, /2,000 characters/);

  const blank = await call('POST', '/api/ai/query', { prompt: '   ' });
  assert.equal(blank.status, 400);

  const unknownZone = await call('POST', '/api/ai/optimize-route', { originId: 'Moon', destinationId: 'Door-2' });
  assert.equal(unknownZone.status, 400);
  assert.match(unknownZone.json.error, /Unknown yard zone: Moon/);
});

test('AI requests are rate limited per client', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 13; i++) statuses.push((await call('POST', '/api/ai/analyze-logs', {})).status);
  assert.deepEqual(statuses.slice(0, 12), Array(12).fill(503));
  assert.equal(statuses[12], 429);
});

test('the co-pilot brief carries the plant clock and the enforced yard rules', () => {
  const brief = aiSystemInstruction(new Date('2026-09-26T15:00:00Z'));
  assert.match(brief, /Saturday, September 26, 2026 at 10:00 AM/);
  assert.match(brief, /first shift/);
  assert.match(brief, /25 mph/);
  assert.match(brief, /ASTM D3963/);
  assert.match(brief, /Ships-first stacking/);
});

test('request bodies must carry text where the screens expect text', async () => {
  // One exception with an object for a name used to crash every open screen
  const objectTag = await call('POST', '/api/exceptions', { tagId: {}, operatorName: 'QC', type: 'Misplaced Bar', description: 'x' });
  assert.equal(objectTag.status, 400);
  assert.match(objectTag.json.error, /tagId must be text/);

  const numberName = await call('POST', '/api/shift-messages', { sender: 5, content: 'hi', shift: '1st Shift' });
  assert.equal(numberName.status, 400);

  const tooLong = await call('POST', '/api/exceptions', { tagId: 'b-1', operatorName: 'QC', type: 'Misplaced Bar', description: 'x'.repeat(1001) });
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.json.error, /1,000 characters/);

  const notAnObject = await call('POST', '/api/bundles/bulk-action', [1, 2, 3]);
  assert.equal(notAnObject.status, 400);

  const oversized = await call('POST', '/api/shift-messages', { sender: 'x', content: 'x'.repeat(200_000), shift: '1st Shift' });
  assert.equal(oversized.status, 413);

  const blank = await call('POST', '/api/exceptions', { tagId: '   ', operatorName: 'QC', type: 'Misplaced Bar', description: 'x' });
  assert.equal(blank.status, 400, 'a blank-but-spaces tag counts as missing');
});

test('a wind speed that is not a number cannot skip the wind lockout', async () => {
  const r = await call('POST', '/api/gantry/execute-route', { originId: 'Coat-Station', destinationId: 'Door-2', bundleId: 'b-3', windSpeed: 'high' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /windSpeed must be a number/);
});

test('resolving an exception keeps who resolved it and their notes', async () => {
  const r = await call('POST', '/api/exceptions/EX-101/resolve', { operatorName: 'QC Lead', resolutionNotes: 'Tarped with opaque cover.' });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'RESOLVED');
  assert.equal(r.json.resolvedBy, 'QC Lead');
  assert.equal(r.json.resolutionNotes, 'Tarped with opaque cover.');
});

test('a coated epoxy bundle cannot be set down in Raw-SW black-bar stock', async () => {
  const r = await call('POST', '/api/bundles/b-1/drop', { location: 'Raw-SW' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /never go back into Raw-SW/);
});
