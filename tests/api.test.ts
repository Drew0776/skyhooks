import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Import the Express app without opening port 3000, and without a Gemini key
process.env.SKYHOOK_NO_LISTEN = '1';
process.env.GEMINI_API_KEY = '';
const { app, resetYardState } = await import('../server');

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
