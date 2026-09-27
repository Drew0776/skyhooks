import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Bundle, Job, Operator, Exception, ShiftMessage, ActivityEvent, TrailerSize } from './src/types';
import { INITIAL_BUNDLES, INITIAL_JOBS, INITIAL_OPERATORS, INITIAL_EXCEPTIONS, INITIAL_SHIFT_MESSAGES, INITIAL_ACTIVITY } from './src/seedData';
import {
  PLANT_TIME_ZONE, UV_GUIDANCE, UV_WARNING_DAYS, WIND_LOCKOUT_MPH, isFirstShift, isOutdoorZone, isUvHazard, slottingConflict, slottingViolationMessage, gradePlacementViolation, isCoated, isValidYardLocation
} from './src/yardRules';

// Store state in-memory so modifications persist during runtime
// Deep copies, so runtime changes never mutate the seed data and the yard can be reset
let bundles: Bundle[] = structuredClone(INITIAL_BUNDLES);
let jobs: Job[] = structuredClone(INITIAL_JOBS);
let operators: Operator[] = structuredClone(INITIAL_OPERATORS);
let exceptions: Exception[] = structuredClone(INITIAL_EXCEPTIONS);
let shiftMessages: ShiftMessage[] = structuredClone(INITIAL_SHIFT_MESSAGES);
let activityEvents: ActivityEvent[] = structuredClone(INITIAL_ACTIVITY);

// Recent AI request times per client, for the co-pilot rate limit
const aiRequestLog = new Map<string, number[]>();

/** Restores the yard to the seed data (used by the API tests). */
export function resetYardState() {
  bundles = structuredClone(INITIAL_BUNDLES);
  jobs = structuredClone(INITIAL_JOBS);
  operators = structuredClone(INITIAL_OPERATORS);
  exceptions = structuredClone(INITIAL_EXCEPTIONS);
  shiftMessages = structuredClone(INITIAL_SHIFT_MESSAGES);
  activityEvents = structuredClone(INITIAL_ACTIVITY);
  aiRequestLog.clear();
}

// Keep the in-memory lists bounded on long-running servers
const MAX_ACTIVITY_EVENTS = 500;
const MAX_EXCEPTIONS = 500;
const MAX_SHIFT_MESSAGES = 500;

/** Trims the exception list to its cap, dropping the oldest resolved exceptions first so no open one is lost to a resolved one. */
function trimExceptions() {
  while (exceptions.length > MAX_EXCEPTIONS) {
    const oldestResolved = exceptions.map(e => e.status).lastIndexOf('RESOLVED');
    exceptions.splice(oldestResolved === -1 ? exceptions.length - 1 : oldestResolved, 1);
  }
}

// Load GEMINI_API_KEY and friends from .env.local / .env for local runs (existing env vars win)
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

// Initialize Google GenAI Client with User-Agent header per AI Studio telemetry guidelines
const apiKey = process.env.GEMINI_API_KEY || '';
// Created on first use, so a server without a key never builds one (the SDK warns at startup when it
// has no key); requireAi() answers 503 before any route gets here without a key
let aiClient: GoogleGenAI | undefined;
function gemini(): GoogleGenAI {
  return aiClient ??= new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}
// Co-pilot model, pinned so answers don't shift under an alias; override with GEMINI_MODEL (e.g. gemini-flash-latest)
const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
// Each AI call spends Gemini quota, so requests per client and question length are capped
const AI_REQUESTS_PER_MINUTE = 12;
const MAX_AI_PROMPT_CHARS = 2000;

// Active Server-Sent Events (SSE) Client Connections
let sseClients: any[] = [];

// Helper to push state changes in real-time to all subscribed operators
function notifyClients() {
  const payload = JSON.stringify({
    type: 'update',
    data: {
      bundles,
      jobs,
      exceptions,
      shiftMessages,
      activityEvents,
    }
  });
  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (err) {
      // Client disconnected
    }
  });
}

// Facility zone coordinates registry replicated on backend for safety validation
const zoneCoords: Record<string, { cx: number; cy: number; cw: number; ch: number; label: string }> = {
  'Crane-NW': { cx: 32, cy: 52, cw: 135, ch: 60, label: 'GANTRY NW' },
  'Rack J-04': { cx: 180, cy: 52, cw: 135, ch: 60, label: 'RACK J-04' },
  'Rack J-12': { cx: 328, cy: 52, cw: 135, ch: 60, label: 'RACK J-12' },
  'Door-1': { cx: 106, cy: 125, cw: 135, ch: 65, label: 'DOOR-1 BAY' },
  'Door-2': { cx: 254, cy: 125, cw: 135, ch: 65, label: 'DOOR-2 BAY' },
  'Crane-NE': { cx: 833, cy: 52, cw: 135, ch: 60, label: 'GANTRY NE' },
  'Rack K-1': { cx: 685, cy: 52, cw: 135, ch: 60, label: 'RACK K-1' },
  'Rack K-2': { cx: 537, cy: 52, cw: 135, ch: 60, label: 'RACK K-2' },
  'Door-3': { cx: 611, cy: 125, cw: 135, ch: 65, label: 'DOOR-3 BAY' },
  'North-End': { cx: 759, cy: 125, cw: 135, ch: 65, label: 'NORTH-END' },
  'Coat-Station': { cx: 32, cy: 242, cw: 215, ch: 50, label: 'COAT TUNNEL' },
  'Shear-North': { cx: 267, cy: 242, cw: 220, ch: 50, label: 'SHEAR NORTH' },
  'Shear-Center': { cx: 512, cy: 242, cw: 220, ch: 50, label: 'SHEAR CENTER' },
  'Shear-South': { cx: 757, cy: 242, cw: 215, ch: 50, label: 'SHEAR SOUTH' },
  'Raw-SW': { cx: 32, cy: 345, cw: 135, ch: 65, label: 'STOCK SW' },
  'Crane-SW': { cx: 180, cy: 345, cw: 135, ch: 65, label: 'CRANE SW' },
  'Rack J-19': { cx: 328, cy: 345, cw: 135, ch: 65, label: 'RACK J-19' },
  'Rack L-8': { cx: 32, cy: 422, cw: 135, ch: 65, label: 'RACK L-8' },
  'Door-7': { cx: 180, cy: 422, cw: 135, ch: 65, label: 'DOOR-7 BAY' },
  'Door-8': { cx: 328, cy: 422, cw: 135, ch: 65, label: 'DOOR-8 BAY' },
  'Crane-SE': { cx: 527, cy: 345, cw: 135, ch: 65, label: 'GANTRY SE' },
  'Rack J-15': { cx: 675, cy: 345, cw: 135, ch: 65, label: 'RACK J-15' },
  'Rack L-1': { cx: 823, cy: 345, cw: 135, ch: 65, label: 'RACK L-1' },
  'Bender-New-Robo': { cx: 601, cy: 422, cw: 135, ch: 65, label: 'NEW-ROBO CNC' },
  'Bender-11-Bender': { cx: 749, cy: 422, cw: 135, ch: 65, label: '11-BENDER' }
};

/** A zone drawn on the gantry map. An own-property check, so names like "constructor" aren't zones. */
const isMapZone = (id: string): boolean => Object.prototype.hasOwnProperty.call(zoneCoords, id);

/** Why `bundle` can't be moved at all (a QC hold), or null. */
function movementBlockedReason(bundle: Bundle): string | null {
  if (bundle.status !== 'REJECTED') return null;
  return `CRITICAL: Bundle ${bundle.tagId} failed its coating QC audit and is locked in REJECTED status. Crane movement is prohibited until engineering signs off.`;
}

/** Why a crane can't lift `bundle` (a QC hold, or it's still in a bender), or null. */
function liftBlockedReason(bundle: Bundle): string | null {
  if (bundle.status === 'BENDING') return `Bundle ${bundle.tagId} is still in the bender. Mark it bent before a crane lifts it.`;
  return movementBlockedReason(bundle);
}

/**
 * Why `bundle` can't be set down at `target` (a place the route accepts, per `allowed`), or null:
 * an unknown or wrong kind of place, a QC hold, or a grade rule (zoning, or black steel touching coated steel).
 */
function moveError(bundle: Bundle, target: string, allowed: (zone: string) => boolean, what: string): string | null {
  if (!isValidYardLocation(target) || !allowed(target)) return `"${target}" is not ${what}.`;
  return movementBlockedReason(bundle) ?? gradePlacementViolation(bundle, target, bundles);
}
const notACrane = (zone: string) => !zone.startsWith('Crane-');
const anyZone = () => true;

interface BackendObstruction {
  zoneId: string;
  name: string;
  type: 'CRITICAL' | 'CONSTRAINT' | 'PROXIMITY';
  reason: string;
  desc: string;
}

function getBackendRouteObstructions(
  originId: string,
  destinationId: string,
  materialClass: 'ALL' | 'Epoxy' | 'Black',
  bundlesData: Bundle[],
  zoneCapacities: Record<string, number>,
  windSpeed: number,
  ropeSway: number,
  bundleLength: number,
  movingBundleId?: string
): BackendObstruction[] {
  const origin = zoneCoords[originId];
  const dest = zoneCoords[destinationId];
  if (!origin || !dest) return [];

  const x1 = origin.cx + origin.cw / 2;
  const y1 = origin.cy + origin.ch / 2;
  const x2 = dest.cx + dest.cw / 2;
  const y2 = dest.cy + dest.ch / 2;

  const overlap = (minA: number, maxA: number, minB: number, maxB: number) => {
    return Math.max(minA, minB) <= Math.min(maxA, maxB);
  };

  const obstructions: BackendObstruction[] = [];

  // A934 priority follows the bundle actually being carried, not whichever bundle sits first at the origin
  const targetBundle = movingBundleId
    ? bundlesData.find(b => b.id === movingBundleId)
    : bundlesData.find(b => b.location === originId);
  const isA934Prioritized = targetBundle?.specification === 'ASTM_A934';

  const hazardThreshold = 0.85;
  const warningThreshold = 0.60;

  Object.keys(zoneCoords).forEach((zoneId) => {
    if (zoneId === originId || zoneId === destinationId) return;

    const zone = zoneCoords[zoneId];
    const zLeft = zone.cx;
    const zRight = zone.cx + zone.cw;
    const zTop = zone.cy;
    const zBottom = zone.cy + zone.ch;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const intersectsHoriz = y1 >= zTop && y1 <= zBottom && overlap(minX, maxX, zLeft, zRight);

    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const intersectsVert = x2 >= zLeft && x2 <= zRight && overlap(minY, maxY, zTop, zBottom);

    if (intersectsHoriz || intersectsVert) {
      const bInZone = bundlesData.filter(b => b.location === zoneId);
      const weight = bInZone.reduce((sum, b) => sum + (b.weight || 0), 0);
      const limit = zoneCapacities[zoneId] || 75000;
      const ratio = weight / limit;

      const isCraneType = zoneId.toLowerCase().includes('crane');
      if (isCraneType) {
        obstructions.push({
          zoneId,
          name: zone.label,
          type: 'CRITICAL',
          reason: 'SHARED RAIL OCCUPANCY',
          desc: `Secondary handling equipment is currently located at ${zone.label}. Please confirm gantry path clearance.`
        });
        return;
      }

      if (ratio >= hazardThreshold) {
        obstructions.push({
          zoneId,
          name: zone.label,
          type: 'CRITICAL',
          reason: 'MAX STORAGE CAPACITY EXCEEDED',
          desc: `Zone ${zone.label} is near maximum storage density (${weight.toLocaleString()} lbs, ${(ratio*100).toFixed(0)}% capacity). High stacks violate overhead clearance drop guidelines.`
        });
        return;
      } else if (ratio >= warningThreshold) {
        if (!isA934Prioritized) {
          obstructions.push({
            zoneId,
            name: zone.label,
            type: 'CONSTRAINT',
            reason: 'HIGH LOAD DENSITY',
            desc: `Elevated pile mass density (${weight.toLocaleString()} lbs, ${(ratio*100).toFixed(0)}% capacity). Gantry crane must operate in cautionary slow-speed mode.`
          });
        }
      }
    }
  });

  return obstructions;
}

// Helper to log dynamic activity events
// Unique ids even when several records are created in the same millisecond
let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++idCounter}`;

function logActivity(tagId: string, operatorName: string, action: string, fromLoc: string, toLoc: string, details?: string) {
  const newEvent: ActivityEvent = {
    id: nextId('AC'),
    timestamp: new Date().toISOString(),
    tagId,
    operatorName,
    action,
    fromLocation: fromLoc,
    toLocation: toLoc,
    details
  };
  activityEvents.unshift(newEvent);
  if (activityEvents.length > MAX_ACTIVITY_EVENTS) activityEvents.length = MAX_ACTIVITY_EVENTS;
  return newEvent;
}

const app = express();
app.use(express.json());

// Every text and number field the API accepts, checked once here so no route can store an object,
// an array or a novel where the screens expect short text (one bad record crashed every open screen),
// and no garbage number can slip past a safety check (windSpeed: "high" used to skip the wind lockout,
// and a coating damage of "5%" skipped the 2% rejection).
const TEXT_FIELDS: Record<string, number> = {
  operatorName: 80, sender: 80, resolvedBy: 80,
  tagId: 40, bundleId: 40, bundleTagId: 40,
  type: 60, shift: 20, action: 40, trailerSize: 20, materialClass: 20,
  location: 40, craneId: 40, benderId: 40, door: 40, originId: 40, destinationId: 40,
  description: 1000, content: 1000, resolutionNotes: 500
};
const NUMBER_FIELDS: Record<string, [number, number]> = { windSpeed: [0, 200], ropeSway: [0, 90], bundleLength: [0, 100] };
const MAX_BULK_BUNDLES = 500;

app.use('/api', (req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT') return next();
  const body = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ error: 'The request body must be a JSON object.' });
    return;
  }
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      res.status(400).json({ error: `${field} must be text.` });
      return;
    }
    if (value.length > max) {
      res.status(400).json({ error: `${field} is limited to ${max.toLocaleString()} characters.` });
      return;
    }
    body[field] = value.trim(); // so a blank-but-spaces value counts as missing
  }
  for (const [field, [min, max]] of Object.entries(NUMBER_FIELDS)) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      res.status(400).json({ error: `${field} must be a number from ${min} to ${max}.` });
      return;
    }
  }
  if (body.bundleIds !== undefined && (!Array.isArray(body.bundleIds) || body.bundleIds.length > MAX_BULK_BUNDLES ||
      body.bundleIds.some((id: unknown) => typeof id !== 'string' || id.length > 40))) {
    res.status(400).json({ error: `bundleIds must be a list of up to ${MAX_BULK_BUNDLES} bundle IDs.` });
    return;
  }
  const audit = body.qualityAudit;
  if (audit !== undefined && audit !== null && (typeof audit !== 'object' || Array.isArray(audit) ||
      (audit.damagedFootSection != null && (typeof audit.damagedFootSection !== 'string' || audit.damagedFootSection.length > 40)))) {
    res.status(400).json({ error: 'qualityAudit must be an object with a short damagedFootSection.' });
    return;
  }
  if (audit != null) {
    const pct = audit.coatingDamagePct;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      res.status(400).json({ error: 'Coating damage must be a percentage between 0 and 100.' });
      return;
    }
  }
  next();
});

app.use('/api/ai', (req, res, next) => {
  if (req.method !== 'POST') return next();
  const now = Date.now();
  const client = req.ip || 'unknown';
  const recent = (aiRequestLog.get(client) || []).filter(t => now - t < 60_000);
  if (recent.length >= AI_REQUESTS_PER_MINUTE) {
    res.set('Retry-After', String(Math.ceil((recent[0] + 60_000 - now) / 1000)));
    res.status(429).json({ error: `The AI co-pilot takes up to ${AI_REQUESTS_PER_MINUTE} requests a minute. Try again shortly.` });
    return;
  }
  recent.push(now);
  aiRequestLog.set(client, recent);
  // Forget clients that have gone quiet so the map can't grow without bound
  if (aiRequestLog.size > 1000) {
    for (const [ip, times] of aiRequestLog) if (now - times[times.length - 1] >= 60_000) aiRequestLog.delete(ip);
  }
  next();
});

const PORT = 3000;

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// SSE Subscription stream
app.get('/api/updates', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Comment lines every 25 s keep proxies and load balancers from closing an idle stream
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c !== res);
  });
});

// --- GEMINI AI ENDPOINTS ---

const DAY_MS = 24 * 60 * 60 * 1000;

/** What every co-pilot call starts from: the plant clock and the same yard rules the server enforces. */
export function aiSystemInstruction(now: Date = new Date()): string {
  const plantNow = now.toLocaleString('en-US', { timeZone: PLANT_TIME_ZONE, dateStyle: 'full', timeStyle: 'short' });
  return `You are SkyHook AI, the yard logistics co-pilot for Simcote Manufacturing Inc.'s rebar fabrication yard.
Current plant time: ${plantNow} (${PLANT_TIME_ZONE}), ${isFirstShift(now.toISOString()) ? 'first' : 'second'} shift.
Answer only from the live yard data you are given and the yard rules below. If the data doesn't answer a question, say so instead of guessing. Don't cite ASTM requirements beyond those listed here.

Yard rules, enforced by the server:
- Plant flow: all bar arrives black at Raw-SW; about 98% is epoxy-coated on the coat line, then sheared, bent, loaded and shipped. This yard tracks bar from the coat line on, so every epoxy bundle here is already coated.
- Grade zoning: black and epoxy are never mixed. Black (uncoated, ASTM A615) bar may only be at Raw-SW, Door-7, Door-8, racks J-19 to J-25 and L-6 to L-10, or a shear or bender; it never goes through the coat line. Coated epoxy (ASTM A775 or A934) never goes into a black-bar area: not Raw-SW, not racks J-19 to J-25 or L-6 to L-10, and it ships only from Door-1, Door-2, Door-3 or North-End, never Door-7 or Door-8. Shears, benders and the other racks, doors and staging areas take either grade, but black steel never touches coated steel: a bundle can't go where bar of the other surface already sits, at any stage.
- Ships-first stacking: a bundle can't be set on a spot holding a bundle that ships sooner.
- Gantry interlocks: a parked crane on the path blocks a move. Crossing a zone loaded to 60% of its limit (75,000 lb by default) forces slow mode, and 85% blocks the move. ASTM A934 bundles skip slow mode.
- Hard stops: a bundle that fails coating QC (more than 2% damage) is REJECTED and can't move. Reported wind of ${WIND_LOCKOUT_MPH} mph or more locks out gantry travel.
- UV exposure: epoxy in an outdoor area (racks, doors, Raw-SW, North-End or hanging on a crane) for ${UV_WARNING_DAYS} days or more raises a warning. ${UV_GUIDANCE}
- First shift runs 6:00 AM to 4:30 PM plant time.

Write for crane operators and floor supervisors: short, structured and actionable, in Markdown.`;
}

/** A bundle as the co-pilot sees it, with its ship date and outdoor exposure worked out. */
function aiBundleView(b: Bundle, now: number = Date.now()) {
  return {
    tagId: b.tagId,
    mark: b.mark,
    jobId: b.jobId,
    grade: b.grade,
    specification: b.specification.replace('ASTM_', 'ASTM '),
    barSize: b.barSize,
    lengthFt: b.length,
    weightLb: b.weight,
    status: b.status,
    location: b.location,
    shipsOn: b.shippingDate,
    daysOutdoors: b.stagedAt && isOutdoorZone(b.location) ? Math.floor((now - new Date(b.stagedAt).getTime()) / DAY_MS) : null,
    uvWarning: isUvHazard(b, now)
  };
}

/** Answers 503 with setup instructions when no Gemini API key is configured. */
function requireAi(res: express.Response): boolean {
  if (apiKey) return true;
  res.status(503).json({ error: 'The AI co-pilot is not configured. Set GEMINI_API_KEY on the server to enable it.' });
  return false;
}

// Whether the co-pilot is set up, and which model it uses
app.get('/api/ai/status', (req, res) => {
  res.json({ configured: Boolean(apiKey), model: AI_MODEL });
});

// 1. Natural Language Yard Query Endpoint
app.post('/api/ai/query', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'A valid text prompt is required.' });
    return;
  }
  if (prompt.length > MAX_AI_PROMPT_CHARS) {
    res.status(400).json({ error: `Questions are limited to ${MAX_AI_PROMPT_CHARS.toLocaleString()} characters.` });
    return;
  }
  if (!requireAi(res)) return;

  try {
    const now = Date.now();
    const yardContext = {
      totalBundles: bundles.length,
      bundles: [...bundles]
        .sort((a, b) => new Date(a.shippingDate).getTime() - new Date(b.shippingDate).getTime())
        .map(b => aiBundleView(b, now)),
      jobs: jobs.map(j => ({
        id: j.id,
        customerName: j.customerName,
        projectName: j.projectName,
        targetDeliveryDate: j.targetDeliveryDate,
        bundlesComplete: `${j.completedBundles}/${j.totalBundles}`
      })),
      openExceptions: exceptions.filter(e => e.status === 'OPEN').map(e => ({
        tagId: e.tagId,
        type: e.type,
        description: e.description
      }))
    };

    const response = await gemini().models.generateContent({
      model: AI_MODEL,
      contents: `[LIVE YARD DATA, bundles soonest-shipping first]\n${JSON.stringify(yardContext, null, 2)}\n\n[QUESTION]\n${prompt}`,
      config: { systemInstruction: aiSystemInstruction(new Date(now)) }
    });

    res.json({ answer: response.text || 'No response generated.' });
  } catch (error: any) {
    console.error('Gemini Query Error:', error);
    res.status(500).json({
      error: 'Failed to process AI query.',
      details: error?.message || 'Gemini API call failed.'
    });
  }
});

// 2. AI Automated Route Optimization Endpoint
app.post('/api/ai/optimize-route', async (req, res) => {
  const { originId, destinationId, bundleTagId } = req.body;
  if (!originId || !destinationId) {
    res.status(400).json({ error: 'Origin and destination sector IDs are required.' });
    return;
  }
  if (!isMapZone(originId) || !isMapZone(destinationId)) {
    res.status(400).json({ error: `Unknown yard zone: ${isMapZone(originId) ? destinationId : originId}.` });
    return;
  }
  if (!requireAi(res)) return;

  try {
    const bundle = (bundleTagId && bundles.find(b => b.tagId === bundleTagId && b.location === originId)) || bundles.find(b => b.location === originId);
    const obstructions = getBackendRouteObstructions(originId, destinationId, 'ALL', bundles, {}, 8, 3, 30, bundle?.id);
    // The server's own verdict on the drop, so the advice can't green-light a move the interlocks refuse
    const conflict = bundle && slottingConflict(bundle, destinationId, bundles);
    const zoneIssue = bundle && gradePlacementViolation(bundle, destinationId, bundles);
    const placement = !bundle ? 'Nothing is carried, so no placement checks apply.'
      : bundle.status === 'REJECTED' ? `BLOCKED: ${bundle.tagId} failed coating QC and is locked in REJECTED status.`
      : zoneIssue ?? (conflict ? slottingViolationMessage(bundle, conflict, destinationId) : 'Passes grade zoning and ships-first stacking.');
    // When the drop is refused, where the bundle could legally go instead
    const legalDrops = bundle && bundle.status !== 'REJECTED' && (zoneIssue || conflict)
      ? Object.keys(zoneCoords).filter(z => z !== originId && z !== destinationId && !z.startsWith('Crane-') &&
          !gradePlacementViolation(bundle, z, bundles) && !slottingConflict(bundle, z, bundles))
      : null;

    const prompt = `Review this gantry crane move.
Origin: ${originId} (${zoneCoords[originId].label})
Destination: ${destinationId} (${zoneCoords[destinationId].label})
Bundle carried: ${bundle ? JSON.stringify(aiBundleView(bundle)) : 'none (empty trolley)'}
Server placement check: ${placement}${legalDrops ? `\nZones where this bundle may legally be set down instead: ${legalDrops.join(', ') || 'none'}` : ''}
Route interlock findings: ${obstructions.length ? JSON.stringify(obstructions) : 'none'}

If the placement check or an interlock blocks the move, rate it CRITICAL, tell the operator not to attempt it and say what would make it legal.
Give, as short Markdown bullet points:
1. Risk level (CRITICAL, MODERATE or LOW) and why
2. Step-by-step operator guidance for the gantry
3. Material handling and compliance notes`;

    const response = await gemini().models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: { systemInstruction: aiSystemInstruction() }
    });

    res.json({
      recommendation: response.text || 'Route analysis completed.',
      obstructions
    });
  } catch (error: any) {
    console.error('Gemini Route Optimization Error:', error);
    res.status(500).json({
      error: 'Failed to run AI route optimization.',
      details: error?.message || 'Gemini API call failed.'
    });
  }
});

// 3. AI Shift Log Anomaly & Maintenance Prediction Endpoint
app.post('/api/ai/analyze-logs', async (req, res) => {
  if (!requireAi(res)) return;
  try {
    const now = Date.now();
    const analysisPayload = {
      recentActivities: activityEvents.slice(0, 15),
      openExceptions: exceptions.filter(e => e.status === 'OPEN'),
      shiftMessages: shiftMessages.slice(0, 10),
      uvWarnings: bundles.filter(b => isUvHazard(b, now)).map(b => aiBundleView(b, now)),
      shippingNext48Hours: bundles
        .filter(b => new Date(b.shippingDate).getTime() - now < 2 * DAY_MS)
        .map(b => ({ tagId: b.tagId, status: b.status, location: b.location, shipsOn: b.shippingDate }))
    };

    const prompt = `Review these shift logs and floor exceptions:
${JSON.stringify(analysisPayload, null, 2)}

Identify, as short Markdown bullet points:
1. Bottlenecks or equipment wear risks (for example shear blade wear or crane congestion)
2. Compliance and UV exposure risks
3. Action points for the next shift handoff`;

    const response = await gemini().models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: { systemInstruction: aiSystemInstruction(new Date(now)) }
    });

    res.json({ analysis: response.text || 'No anomalies detected.' });
  } catch (error: any) {
    console.error('Gemini Log Analysis Error:', error);
    res.status(500).json({
      error: 'Failed to run AI log analysis.',
      details: error?.message || 'Gemini API call failed.'
    });
  }
});

// --- EXISTING REST ENDPOINTS ---

app.post('/api/gantry/execute-route', (req, res) => {
  const { originId, destinationId, bundleId, materialClass, windSpeed, ropeSway, bundleLength, operatorName } = req.body;
  if (!originId || !destinationId) {
    res.status(400).json({ error: 'Origin and destination sector IDs are required.' });
    return;
  }
  if (!isMapZone(originId) || !isMapZone(destinationId)) {
    res.status(400).json({ error: 'Origin and destination must be zones on the yard map.' });
    return;
  }
  if (originId === destinationId) {
    res.status(400).json({ error: 'Origin and destination are the same zone.' });
    return;
  }

  if (windSpeed !== undefined && Number(windSpeed) >= WIND_LOCKOUT_MPH) {
    res.status(400).json({ error: `WIND LOCKOUT: Reported wind of ${Number(windSpeed)} mph is at or above the ${WIND_LOCKOUT_MPH} mph limit for outdoor gantry travel.` });
    return;
  }

  // The bundle being carried: the one the operator picked, or the first bundle resting at the origin
  let targetBundle: Bundle | undefined;
  if (bundleId) {
    targetBundle = bundles.find(b => b.id === bundleId);
    if (!targetBundle || targetBundle.location !== originId) {
      res.status(400).json({ error: `Bundle ${bundleId} is not at ${originId}.` });
      return;
    }
  } else {
    targetBundle = bundles.find(b => b.location === originId);
  }

  const obstructions = getBackendRouteObstructions(
    originId,
    destinationId,
    materialClass || 'ALL',
    bundles,
    {},
    windSpeed || 8,
    ropeSway || 3,
    bundleLength || 30,
    targetBundle?.id
  );

  const criticalIssues = obstructions.filter(obs => obs.type === 'CRITICAL');
  if (criticalIssues.length > 0) {
    res.status(400).json({
      error: `CRITICAL INTERLOCK TRIGGERED: Safety bypass prohibited. Movement from "${originId}" to "${destinationId}" blocked due to: ${criticalIssues.map(c => c.reason).join(', ')}`
    });
    return;
  }

  if (targetBundle) {
    const zoneError = liftBlockedReason(targetBundle) ?? moveError(targetBundle, destinationId, notACrane, 'a place to set a bundle down');
    if (zoneError) {
      res.status(400).json({ error: zoneError });
      return;
    }
    const conflict = slottingConflict(targetBundle, destinationId, bundles);
    if (conflict) {
      res.status(400).json({ error: slottingViolationMessage(targetBundle, conflict, destinationId) });
      return;
    }

    const oldLoc = targetBundle.location;
    targetBundle.location = destinationId;
    targetBundle.updatedAt = new Date().toISOString();

    if (destinationId.startsWith('Rack')) {
      targetBundle.status = 'RACKED';
    } else if (destinationId.startsWith('Door')) {
      targetBundle.status = 'LOADED';
      targetBundle.door = destinationId;
    } else if (destinationId === 'Coat-Station') {
      targetBundle.status = 'COATED';
    } else {
      targetBundle.status = 'STAGED';
    }

    logActivity(
      targetBundle.tagId,
      operatorName || 'Gantry Automations',
      'GANTRY_MOVE',
      oldLoc,
      destinationId,
      `Operational route executed successfully.${windSpeed !== undefined ? ` Reported wind ${Number(windSpeed)} mph, rope sway ${Number(ropeSway ?? 0)}°.` : ''}`
    );

    if (targetBundle.status === 'LOADED') {
      const parentJob = jobs.find(j => j.id === targetBundle.jobId);
      if (parentJob) {
        const completed = bundles.filter(b => b.jobId === parentJob.id && b.status === 'LOADED').length;
        parentJob.completedBundles = Math.min(parentJob.totalBundles, completed);
      }
    }

    notifyClients();
    res.json({
      success: true,
      message: `Successfully executed travel command. Moved Bundle ${targetBundle.tagId} to ${destinationId}`,
      bundle: targetBundle
    });
  } else {
    logActivity(
      'GANTRY',
      operatorName || 'Gantry Automations',
      'TROLLEY_REPOSITION',
      originId,
      destinationId,
      `Trolley transit executed from ${originId} to ${destinationId} (Idle traverse).`
    );

    notifyClients();
    res.json({
      success: true,
      message: `Gantry trolley repositioned from ${originId} to ${destinationId} (idle).`
    });
  }
});

app.get('/api/jobs', (req, res) => {
  res.json(jobs);
});

app.get('/api/jobs/:jobId/bundles', (req, res) => {
  const jobBundles = bundles.filter(b => b.jobId === req.params.jobId);
  res.json(jobBundles);
});

app.get('/api/bundles', (req, res) => {
  res.json(bundles);
});

app.get('/api/operators', (req, res) => {
  res.json(operators);
});

app.get('/api/activity', (req, res) => {
  res.json(activityEvents);
});

app.get('/api/exceptions', (req, res) => {
  res.json(exceptions);
});

app.post('/api/exceptions', (req, res) => {
  const { tagId, operatorName, type, description, qualityAudit } = req.body;
  if (!tagId || !operatorName || !type || !description) {
    res.status(400).json({ error: 'Missing required parameters' });
    return;
  }
  
  let finalDescription = description;
  const bundle = bundles.find(b => b.tagId === tagId);

  if (type === 'Quality Audit' && qualityAudit) {
    if (bundle && !isCoated(bundle)) {
      res.status(400).json({ error: `Bundle ${bundle.tagId} is black bar, so it has no coating to audit.` });
      return;
    }
    const damagePct: number = qualityAudit.coatingDamagePct; // a percentage, checked with the request body
    if (damagePct > 2) {
      finalDescription = `${description} [AUTOMATIC ASTM REJECTION: Visible coating damage of ${damagePct}% exceeds the 2% maximum allowable limit in section: ${qualityAudit.damagedFootSection}.]`;
      if (bundle) {
        bundle.status = 'REJECTED';
        bundle.updatedAt = new Date().toISOString();
        logActivity(
          tagId,
          operatorName,
          'QUALITY_REJECT',
          bundle.location,
          bundle.location,
          `REJECTED: Coating damage of ${damagePct}% exceeds 2% ASTM limit.`
        );
      }
    }
  }

  const newEx: Exception = {
    id: nextId('EX'),
    timestamp: new Date().toISOString(),
    tagId,
    operatorName,
    type,
    description: finalDescription,
    status: 'OPEN',
    qualityAudit: qualityAudit ? {
      coatingDamagePct: qualityAudit.coatingDamagePct,
      damagedFootSection: qualityAudit.damagedFootSection,
      inspectorName: operatorName,
      inspectionDate: new Date().toISOString().split('T')[0]
    } : undefined
  };
  
  exceptions.unshift(newEx);
  trimExceptions();
  notifyClients();
  res.status(201).json(newEx);
});

app.post('/api/exceptions/:exceptionId/resolve', (req, res) => {
  const { exceptionId } = req.params;
  // The Exceptions screen sends who resolved it as operatorName, with the inspector's notes
  const { resolvedBy, operatorName, resolutionNotes } = req.body;
  const ex = exceptions.find(e => e.id === exceptionId);
  if (!ex) {
    res.status(404).json({ error: 'Exception not found' });
    return;
  }
  ex.status = 'RESOLVED';
  ex.resolvedAt = new Date().toISOString();
  ex.resolvedBy = resolvedBy || operatorName || 'ADMIN';
  if (resolutionNotes) ex.resolutionNotes = resolutionNotes;
  notifyClients();
  res.json(ex);
});

app.get('/api/shift-messages', (req, res) => {
  res.json(shiftMessages);
});

app.post('/api/shift-messages', (req, res) => {
  const { sender, content, shift } = req.body;
  if (!sender || !content || !shift) {
    res.status(400).json({ error: 'Missing message parameters' });
    return;
  }
  const newMessage: ShiftMessage = {
    id: nextId('SM'),
    sender,
    content,
    timestamp: new Date().toISOString(),
    shift
  };
  shiftMessages.unshift(newMessage);
  if (shiftMessages.length > MAX_SHIFT_MESSAGES) shiftMessages.length = MAX_SHIFT_MESSAGES;
  notifyClients();
  res.status(201).json(newMessage);
});

app.post('/api/bundles/:bundleId/stage', (req, res) => {
  const { bundleId } = req.params;
  const { operatorName, location } = req.body;
  const bundle = bundles.find(b => b.id === bundleId);
  if (!bundle) {
    res.status(404).json({ error: 'Bundle not found' });
    return;
  }

  const stageError = moveError(bundle, location || 'Coat-Station', notACrane, 'a place to stage a bundle');
  if (stageError) {
    res.status(400).json({ error: stageError });
    return;
  }

  const oldLoc = bundle.location;
  bundle.location = location || 'Coat-Station';
  bundle.status = 'STAGED';
  bundle.updatedAt = new Date().toISOString();

  logActivity(bundle.tagId, operatorName || 'Shear Operator', 'STAGED', oldLoc, bundle.location, `Staged at ${bundle.location}`);
  notifyClients();
  res.json(bundle);
});

app.post('/api/bundles/:bundleId/pickup', (req, res) => {
  const { bundleId } = req.params;
  const { operatorName, craneId } = req.body;
  const bundle = bundles.find(b => b.id === bundleId);
  if (!bundle) {
    res.status(404).json({ error: 'Bundle not found' });
    return;
  }

  // A crane hook is not storage: grade zoning applies where the bundle is set down, not to the lift
  const crane = craneId || 'Crane-SW';
  const onHook = bundles.find(b => b.location === crane && b.id !== bundle.id);
  const pickupError = !/^Crane-(NW|NE|SW|SE)$/.test(crane) ? `"${crane}" is not a gantry crane.`
    : liftBlockedReason(bundle)
    ?? (bundle.grade === 'Black' && crane !== 'Crane-SW' ? 'CRITICAL: Black (non-epoxy) bar can only be moved in the SW zone (Crane-SW).' : null)
    ?? (onHook ? `CRANE COLLISION HAZARD: ${crane} already has bundle ${onHook.tagId} on the hook. Drop it first.` : null);
  if (pickupError) {
    res.status(400).json({ error: pickupError });
    return;
  }

  const oldLoc = bundle.location;
  bundle.location = crane;
  bundle.updatedAt = new Date().toISOString();

  logActivity(bundle.tagId, operatorName || 'Crane Operator', 'PICKUP', oldLoc, bundle.location, `Picked up by ${crane}`);
  notifyClients();
  res.json(bundle);
});

app.post('/api/bundles/:bundleId/drop', (req, res) => {
  const { bundleId } = req.params;
  const { operatorName, location } = req.body;
  const bundle = bundles.find(b => b.id === bundleId);
  if (!bundle) {
    res.status(404).json({ error: 'Bundle not found' });
    return;
  }

  if (!location) {
    res.status(400).json({ error: 'Specify a valid drop location.' });
    return;
  }
  // Only a load on a crane hook can be set down; anything else would skip the pickup rules (the SW crane for black bar)
  if (!bundle.location.startsWith('Crane-')) {
    res.status(400).json({ error: `Bundle ${bundle.tagId} is not on a crane hook. Pick it up first.` });
    return;
  }
  // Black bar stays SW; epoxy stays out of black-bar racks and SW shipping doors; black never touches coated
  const zoneError = moveError(bundle, location, notACrane, 'a place to set a bundle down');
  if (zoneError) {
    res.status(400).json({ error: zoneError });
    return;
  }

  const conflict = slottingConflict(bundle, location, bundles);
  if (conflict) {
    res.status(400).json({ error: slottingViolationMessage(bundle, conflict, location) });
    return;
  }

  const oldLoc = bundle.location;
  bundle.location = location;

  if (location.startsWith('Rack')) {
    bundle.status = 'RACKED';
  } else if (location.startsWith('Door')) {
    bundle.status = 'LOADED';
    bundle.door = location;
  } else if (location === 'Coat-Station') {
    bundle.status = 'COATED';
  } else {
    bundle.status = 'STAGED';
  }

  bundle.updatedAt = new Date().toISOString();

  if (bundle.status === 'LOADED') {
    const job = jobs.find(j => j.id === bundle.jobId);
    if (job) {
      const completed = bundles.filter(b => b.jobId === job.id && b.status === 'LOADED').length;
      job.completedBundles = Math.min(job.totalBundles, completed);
    }
  }

  logActivity(bundle.tagId, operatorName || 'Crane Operator', 'DROP', oldLoc, bundle.location, `Dropped at ${location}`);
  notifyClients();
  res.json(bundle);
});

app.post('/api/bundles/:bundleId/send-to-bender', (req, res) => {
  const { bundleId } = req.params;
  const { operatorName, benderId } = req.body;
  const bundle = bundles.find(b => b.id === bundleId);
  if (!bundle) {
    res.status(404).json({ error: 'Bundle not found' });
    return;
  }

  const bender = benderId || 'Bender-New-Robo';
  const benderError = moveError(bundle, bender, z => z.startsWith('Bender-'), 'a bender');
  if (benderError) {
    res.status(400).json({ error: benderError });
    return;
  }

  const oldLoc = bundle.location;
  bundle.location = bender;
  bundle.status = 'BENDING';
  bundle.updatedAt = new Date().toISOString();

  logActivity(bundle.tagId, operatorName || 'Shear Operator', 'BENDING_START', oldLoc, bundle.location, `Sent to bender ${bender}`);
  notifyClients();
  res.json(bundle);
});

app.post('/api/bundles/:bundleId/mark-bent', (req, res) => {
  const { bundleId } = req.params;
  const { operatorName } = req.body;
  const bundle = bundles.find(b => b.id === bundleId);
  if (!bundle) {
    res.status(404).json({ error: 'Bundle not found' });
    return;
  }

  // Only a bundle in a bender can finish bending; anything else (a QC hold above all) keeps its status
  if (bundle.status !== 'BENDING') {
    res.status(400).json({ error: `Bundle ${bundle.tagId} is ${bundle.status}, not BENDING.` });
    return;
  }

  const oldLoc = bundle.location;
  bundle.status = 'STAGED';
  bundle.updatedAt = new Date().toISOString();

  logActivity(bundle.tagId, operatorName || 'Bender Operator', 'BENT', oldLoc, oldLoc, `Fabrication completed at ${oldLoc}`);
  notifyClients();
  res.json(bundle);
});

app.post('/api/bundles/:bundleId/force-load', (req, res) => {
  const { bundleId } = req.params;
  const { operatorName, door, trailerSize } = req.body;
  const bundle = bundles.find(b => b.id === bundleId);
  if (!bundle) {
    res.status(404).json({ error: 'Bundle not found' });
    return;
  }

  const loadError = moveError(bundle, door || 'Door-1', z => z.startsWith('Door-') || z === 'North-End', 'a shipping door');
  if (loadError) {
    res.status(400).json({ error: loadError });
    return;
  }

  const oldLoc = bundle.location;
  bundle.location = door || 'Door-1';
  bundle.door = door || 'Door-1';
  bundle.trailerSize = trailerSize || 'Flatbed';
  bundle.status = 'LOADED';
  bundle.updatedAt = new Date().toISOString();

  const job = jobs.find(j => j.id === bundle.jobId);
  if (job) {
    const completed = bundles.filter(b => b.jobId === job.id && b.status === 'LOADED').length;
    job.completedBundles = Math.min(job.totalBundles, completed);
  }

  logActivity(bundle.tagId, operatorName || 'Admin Operator', 'FORCED_LOAD', oldLoc, bundle.location, `Directly loaded onto ${bundle.trailerSize} at ${bundle.location}`);
  notifyClients();
  res.json(bundle);
});

app.post('/api/bundles/bulk-action', (req, res) => {
  const { bundleIds, action, operatorName } = req.body;
  if (!Array.isArray(bundleIds) || bundleIds.length === 0) {
    res.status(400).json({ error: 'Please select at least one bundle to execute bulk operations.' });
    return;
  }
  if (!['LOAD', 'STAGE', 'SEND_TO_FABRICATION'].includes(action)) {
    res.status(400).json({ error: 'Invalid bulk action.' });
    return;
  }

  const results: any[] = [];
  const errors: string[] = [];

  for (const bundleId of bundleIds) {
    const bundle = bundles.find(b => b.id === bundleId);
    if (!bundle) {
      errors.push(`Bundle ${bundleId} not found.`);
      continue;
    }

    const oldLoc = bundle.location;

    if (action === 'LOAD') {
      let door = bundle.grade === 'Black' ? 'Door-7' : 'Door-1';
      let trailerSize: TrailerSize = 'Flatbed';
      const placeError = moveError(bundle, door, anyZone, 'a yard zone');
      if (placeError) {
        errors.push(`${bundle.tagId}: ${placeError}`);
        continue;
      }

      bundle.location = door;
      bundle.door = door;
      bundle.trailerSize = trailerSize;
      bundle.status = 'LOADED';
      bundle.updatedAt = new Date().toISOString();

      const job = jobs.find(j => j.id === bundle.jobId);
      if (job) {
        const completed = bundles.filter(b => b.jobId === job.id && b.status === 'LOADED').length;
        job.completedBundles = Math.min(job.totalBundles, completed);
      }

      logActivity(bundle.tagId, operatorName || 'Admin Operator', 'FORCED_LOAD', oldLoc, bundle.location, `Bulk loaded at ${bundle.location}`);
      results.push(bundle);
    } else if (action === 'STAGE') {
      let location = bundle.grade === 'Black' ? 'Raw-SW' : 'Coat-Station';
      const placeError = moveError(bundle, location, anyZone, 'a yard zone');
      if (placeError) {
        errors.push(`${bundle.tagId}: ${placeError}`);
        continue;
      }

      bundle.location = location;
      bundle.status = 'STAGED';
      bundle.updatedAt = new Date().toISOString();

      logActivity(bundle.tagId, operatorName || 'Shear Operator', 'STAGED', oldLoc, bundle.location, `Bulk staged at ${bundle.location}`);
      results.push(bundle);
    } else if (action === 'SEND_TO_FABRICATION') {
      let benderId = bundle.grade === 'Black' ? 'Bender-11-Bender' : 'Bender-New-Robo';
      const placeError = moveError(bundle, benderId, anyZone, 'a yard zone');
      if (placeError) {
        errors.push(`${bundle.tagId}: ${placeError}`);
        continue;
      }

      bundle.location = benderId;
      bundle.status = 'BENDING';
      bundle.updatedAt = new Date().toISOString();

      logActivity(bundle.tagId, operatorName || 'Shear Operator', 'BENDING_START', oldLoc, bundle.location, `Bulk sent to fabrication at ${benderId}`);
      results.push(bundle);
    }
  }

  notifyClients();

  if (errors.length > 0 && results.length === 0) {
    res.status(400).json({ error: errors.join(' ') });
  } else {
    res.json({ success: true, count: results.length, errors: errors.length > 0 ? errors : undefined });
  }
});

app.get('/api/dashboard', (req, res) => {
  const bendingCount = bundles.filter(b => b.status === 'BENDING').length;
  const totalActiveJobs = jobs.filter(j => j.completedBundles < j.totalBundles).length;
  const stagedCount = bundles.filter(b => b.status === 'STAGED').length;
  const loadedCount = bundles.filter(b => b.status === 'LOADED').length;
  const rackedCount = bundles.filter(b => b.status === 'RACKED').length;
  const rejectedCount = bundles.filter(b => b.status === 'REJECTED').length;

  const uvHazardsCount = bundles.filter(b => isUvHazard(b)).length;

  let firstShiftWeight = 0;
  let secondShiftWeight = 0;

  bundles.filter(b => b.status === 'LOADED').forEach(b => {
    // Shifts are in plant time (6:00 AM to 4:30 PM is first shift), not UTC
    if (isFirstShift(b.updatedAt)) {
      firstShiftWeight += b.weight;
    } else {
      secondShiftWeight += b.weight;
    }
  });

  const firstShiftThroughput = Math.round((firstShiftWeight / 2000) * 10) / 10;
  const secondShiftThroughput = Math.round((secondShiftWeight / 2000) * 10) / 10;

  res.json({
    bendingCount,
    totalActiveJobs,
    stagedCount,
    loadedCount,
    rackedCount,
    rejectedCount,
    uvHazardsCount,
    firstShiftThroughput,
    secondShiftThroughput
  });
});

// Unknown API routes answer in JSON instead of falling through to the web app
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}.` });
});

// Malformed JSON bodies and unexpected errors answer in JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body is not valid JSON.' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'The request body is too large (100 KB maximum).' });
    return;
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

export { app };

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Tests import the app without opening a port
if (process.env.SKYHOOK_NO_LISTEN !== '1') {
  startServer();
}
