import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { Bundle, Job, Operator, Exception, ShiftMessage, ActivityEvent, TrailerSize } from './src/types';
import { INITIAL_BUNDLES, INITIAL_JOBS, INITIAL_OPERATORS, INITIAL_EXCEPTIONS, INITIAL_SHIFT_MESSAGES, INITIAL_ACTIVITY } from './src/seedData';

// Store state in-memory so modifications persist during runtime
let bundles: Bundle[] = [...INITIAL_BUNDLES];
let jobs: Job[] = [...INITIAL_JOBS];
let operators: Operator[] = [...INITIAL_OPERATORS];
let exceptions: Exception[] = [...INITIAL_EXCEPTIONS];
let shiftMessages: ShiftMessage[] = [...INITIAL_SHIFT_MESSAGES];
let activityEvents: ActivityEvent[] = [...INITIAL_ACTIVITY];

// Initialize Google GenAI Client with User-Agent header per AI Studio telemetry guidelines
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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
  bundleLength: number
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

  const targetBundle = bundlesData.find(b => b.location === originId);
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
function logActivity(tagId: string, operatorName: string, action: string, fromLoc: string, toLoc: string, details?: string) {
  const newEvent: ActivityEvent = {
    id: `AC-${Date.now()}`,
    timestamp: new Date().toISOString(),
    tagId,
    operatorName,
    action,
    fromLocation: fromLoc,
    toLocation: toLoc,
    details
  };
  activityEvents.unshift(newEvent);
  return newEvent;
}

const app = express();
app.use(express.json());

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

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

// --- GEMINI AI ENDPOINTS ---

// 1. Natural Language Yard Query Endpoint
app.post('/api/ai/query', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'A valid text prompt is required.' });
    return;
  }

  try {
    const yardContext = {
      totalBundles: bundles.length,
      bundlesSummary: bundles.map(b => ({
        tagId: b.tagId,
        mark: b.mark,
        grade: b.grade,
        barSize: b.barSize,
        length: b.length,
        weight: b.weight,
        status: b.status,
        location: b.location,
        jobId: b.jobId,
        specification: b.specification
      })),
      jobsSummary: jobs.map(j => ({
        id: j.id,
        customerName: j.customerName,
        projectName: j.projectName,
        progress: `${j.completedBundles}/${j.totalBundles}`
      })),
      openExceptions: exceptions.filter(e => e.status === 'OPEN').map(e => ({
        tagId: e.tagId,
        type: e.type,
        description: e.description
      }))
    };

    const systemInstruction = `You are SkyHook AI, an industrial yard logistics and rebar manufacturing assistant for Simcote Manufacturing Inc.
    Answer user queries clearly and concisely using the provided real-time plant floor data.
    Rule checklist:
    - Epoxy rebar (ASTM A775/A934) goes to NW/NE sectors and Door 1-3/North-End.
    - Black non-epoxy rebar is strictly restricted to SW sectors (Door 7-8).
    - Coating damage > 2% triggers automatic ASTM rejection.
    - Keep answers structured, professional, and directly actionable for crane operators and floor supervisors.`;

    const fullPrompt = `${systemInstruction}\n\n[LIVE YARD DATA]\n${JSON.stringify(yardContext, null, 2)}\n\n[USER QUERY]\n${prompt}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: fullPrompt
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

  try {
    const bundle = bundles.find(b => b.tagId === bundleTagId || b.location === originId);
    const obstructions = getBackendRouteObstructions(originId, destinationId, 'ALL', bundles, {}, 8, 3, 30);

    const prompt = `Analyze this gantry crane transit route for Simcote Manufacturing:
    Origin: ${originId} (${zoneCoords[originId]?.label || 'Unknown'})
    Destination: ${destinationId} (${zoneCoords[destinationId]?.label || 'Unknown'})
    Target Bundle: ${bundle ? `Tag ${bundle.tagId}, ${bundle.grade} steel, #${bundle.barSize}, ${bundle.weight} lbs, Spec: ${bundle.specification}` : 'Empty Trolley Transit'}
    Detected Technical Obstructions: ${JSON.stringify(obstructions)}

    Provide an operational breakdown with:
    1. Risk Assessment (CRITICAL, MODERATE, LOW)
    2. Step-by-Step Operator Guidance for Gantry Positioning
    3. Material Safety & ASTM Compliance Verification
    Keep the output concise, formatted in markdown bullet points.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt
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
  try {
    const analysisPayload = {
      recentActivities: activityEvents.slice(0, 15),
      openExceptions: exceptions.filter(e => e.status === 'OPEN'),
      shiftMessages: shiftMessages.slice(0, 10),
      outdoorEpoxyHazards: bundles.filter(b => {
        if (b.grade !== 'Epoxy') return false;
        if (!b.stagedAt) return false;
        const days = (Date.now() - new Date(b.stagedAt).getTime()) / (1000 * 60 * 60 * 24);
        return days >= 25;
      }).map(b => ({ tagId: b.tagId, location: b.location, stagedAt: b.stagedAt }))
    };

    const prompt = `Analyze the following industrial shift logs and floor exceptions for Simcote Manufacturing:
    ${JSON.stringify(analysisPayload, null, 2)}

    Identify:
    1. Operational Bottlenecks or Equipment Wear Risks (e.g. shear blade dullness, crane congestion)
    2. ASTM Compliance & UV Hazard Flag Risks
    3. Supervisor Key Action Points for Next Shift Handoff
    Be concise and write in structured industrial bullet points.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt
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
  const { originId, destinationId, materialClass, windSpeed, ropeSway, bundleLength, operatorName } = req.body;
  if (!originId || !destinationId) {
    res.status(400).json({ error: 'Origin and destination sector IDs are required.' });
    return;
  }

  const obstructions = getBackendRouteObstructions(
    originId,
    destinationId,
    materialClass || 'ALL',
    bundles,
    {},
    windSpeed || 8,
    ropeSway || 3,
    bundleLength || 30
  );

  const criticalIssues = obstructions.filter(obs => obs.type === 'CRITICAL');
  if (criticalIssues.length > 0) {
    res.status(400).json({
      error: `CRITICAL INTERLOCK TRIGGERED: Safety bypass prohibited. Movement from "${originId}" to "${destinationId}" blocked due to: ${criticalIssues.map(c => c.reason).join(', ')}`
    });
    return;
  }

  const targetBundle = bundles.find(b => b.location === originId);
  if (targetBundle) {
    const existingBundles = bundles.filter(b => b.location === destinationId && b.id !== targetBundle.id);
    if (existingBundles.length > 0) {
      const newShipping = new Date(targetBundle.shippingDate).getTime();
      const conflict = existingBundles.find(e => new Date(e.shippingDate).getTime() < newShipping);
      if (conflict) {
        res.status(400).json({
          error: `CRITICAL DYNAMIC SLOTTING VIOLATION: Stacking bundle ${targetBundle.tagId} (ships ${new Date(targetBundle.shippingDate).toLocaleDateString()}) on top of bundle ${conflict.tagId} (ships sooner: ${new Date(conflict.shippingDate).toLocaleDateString()}) at ${destinationId} is blocked to prevent extra crane picks and epoxy scraping.`
        });
        return;
      }
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
      `Operational route executed successfully. Dynamic safety buffer cleared.`
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
    const damagePct = Number(qualityAudit.coatingDamagePct);
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
    id: `EX-${Date.now()}`,
    timestamp: new Date().toISOString(),
    tagId,
    operatorName,
    type,
    description: finalDescription,
    status: 'OPEN',
    qualityAudit: qualityAudit ? {
      coatingDamagePct: Number(qualityAudit.coatingDamagePct),
      damagedFootSection: qualityAudit.damagedFootSection,
      inspectorName: operatorName,
      inspectionDate: new Date().toISOString().split('T')[0]
    } : undefined
  };
  
  exceptions.unshift(newEx);
  notifyClients();
  res.status(201).json(newEx);
});

app.post('/api/exceptions/:exceptionId/resolve', (req, res) => {
  const { exceptionId } = req.params;
  const { resolvedBy } = req.body;
  const ex = exceptions.find(e => e.id === exceptionId);
  if (!ex) {
    res.status(404).json({ error: 'Exception not found' });
    return;
  }
  ex.status = 'RESOLVED';
  ex.resolvedAt = new Date().toISOString();
  ex.resolvedBy = resolvedBy || 'ADMIN';
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
    id: `SM-${Date.now()}`,
    sender,
    content,
    timestamp: new Date().toISOString(),
    shift
  };
  shiftMessages.unshift(newMessage);
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

  if (bundle.grade === 'Black' && location !== 'Raw-SW' && location !== 'Coat-Station' && !location.includes('Shear') && !location.includes('Bender') && !location.includes('Door-7') && !location.includes('Door-8') && !location.includes('Rack J-19') && !location.includes('Rack J-20') && !location.includes('Rack J-21') && !location.includes('Rack J-22') && !location.includes('Rack J-23') && !location.includes('Rack J-24') && !location.includes('Rack J-25') && !location.includes('Rack L-6') && !location.includes('Rack L-7') && !location.includes('Rack L-8') && !location.includes('Rack L-9') && !location.includes('Rack L-10')) {
    res.status(400).json({ error: 'CRITICAL: Black (non-epoxy) bar is SW-only. Cannot stage in North/East/SE areas.' });
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

  if (bundle.grade === 'Black' && craneId !== 'Crane-SW') {
    res.status(400).json({ error: 'CRITICAL: Black (non-epoxy) bar can only be moved in the SW zone (Crane-SW).' });
    return;
  }

  const oldLoc = bundle.location;
  bundle.location = craneId || 'Crane-SW';
  bundle.updatedAt = new Date().toISOString();

  logActivity(bundle.tagId, operatorName || 'Crane Operator', 'PICKUP', oldLoc, bundle.location, `Picked up by ${craneId}`);
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

  if (bundle.grade === 'Black') {
    const isSwArea = location.includes('Door-7') || location.includes('Door-8') ||
                     location.includes('Rack J-19') || location.includes('Rack J-20') ||
                     location.includes('Rack J-21') || location.includes('Rack J-22') ||
                     location.includes('Rack J-23') || location.includes('Rack J-24') ||
                     location.includes('Rack J-25') || location.includes('Rack L-6') ||
                     location.includes('Rack L-7') || location.includes('Rack L-8') ||
                     location.includes('Rack L-9') || location.includes('Rack L-10') ||
                     location === 'Raw-SW';
    if (!isSwArea) {
      res.status(400).json({ error: 'CRITICAL: Black (non-epoxy) bar cannot be dropped outside the SW zone.' });
      return;
    }
  }

  if (bundle.grade === 'Epoxy') {
    const isBlackRack = /Rack\s+J-(19|20|21|22|23|24|25)/.test(location) || /Rack\s+L-(6|7|8|9|10)/.test(location);
    if (isBlackRack) {
      res.status(400).json({ error: 'CRITICAL: Epoxy bar cannot be stored in Black-bar SW racks.' });
      return;
    }
  }

  const existingBundles = bundles.filter(b => b.location === location && b.id !== bundle.id);
  if (existingBundles.length > 0) {
    const newShipping = new Date(bundle.shippingDate).getTime();
    const conflict = existingBundles.find(e => new Date(e.shippingDate).getTime() < newShipping);
    if (conflict) {
      res.status(400).json({
        error: `CRITICAL DYNAMIC SLOTTING VIOLATION: Stacking bundle ${bundle.tagId} (ships ${new Date(bundle.shippingDate).toLocaleDateString()}) on top of bundle ${conflict.tagId} (ships sooner: ${new Date(conflict.shippingDate).toLocaleDateString()}) at ${location} is blocked to prevent extra crane picks and epoxy scraping.`
      });
      return;
    }
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

  const oldLoc = bundle.location;
  bundle.location = benderId || 'Bender-New-Robo';
  bundle.status = 'BENDING';
  bundle.updatedAt = new Date().toISOString();

  logActivity(bundle.tagId, operatorName || 'Shear Operator', 'BENDING_START', oldLoc, bundle.location, `Sent to bender ${benderId}`);
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

  if (bundle.grade === 'Black') {
    if (door !== 'Door-7' && door !== 'Door-8') {
      res.status(400).json({ error: 'CRITICAL: Black (non-epoxy) bar must be shipped from SW loading doors (Door-7 or Door-8).' });
      return;
    }
  } else {
    if (door === 'Door-7' || door === 'Door-8') {
      res.status(400).json({ error: 'CRITICAL: Epoxy bar must be shipped from NW/NE doors (Door-1, Door-2, Door-3, North-End).' });
      return;
    }
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

      bundle.location = location;
      bundle.status = 'STAGED';
      bundle.updatedAt = new Date().toISOString();

      logActivity(bundle.tagId, operatorName || 'Shear Operator', 'STAGED', oldLoc, bundle.location, `Bulk staged at ${bundle.location}`);
      results.push(bundle);
    } else if (action === 'SEND_TO_FABRICATION') {
      let benderId = bundle.grade === 'Black' ? 'Bender-11-Bender' : 'Bender-New-Robo';

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

function isOutdoorZone(zoneId: string): boolean {
  if (!zoneId) return false;
  const zid = zoneId.toLowerCase();
  return zid.includes('rack') || zid.includes('door') || zid.includes('north-end') || zid.includes('stock') || zid.includes('raw') || zid.includes('crane');
}

app.get('/api/dashboard', (req, res) => {
  const bendingCount = bundles.filter(b => b.status === 'BENDING').length;
  const totalActiveJobs = jobs.filter(j => j.completedBundles < j.totalBundles).length;
  const stagedCount = bundles.filter(b => b.status === 'STAGED').length;
  const loadedCount = bundles.filter(b => b.status === 'LOADED').length;
  const rackedCount = bundles.filter(b => b.status === 'RACKED').length;
  const rejectedCount = bundles.filter(b => b.status === 'REJECTED').length;

  const uvHazardsCount = bundles.filter(b => {
    if (b.grade !== 'Epoxy' || !b.stagedAt) return false;
    if (!isOutdoorZone(b.location)) return false;
    const days = (Date.now() - new Date(b.stagedAt).getTime()) / (1000 * 60 * 60 * 24);
    return days >= 25;
  }).length;

  let firstShiftWeight = 0;
  let secondShiftWeight = 0;

  bundles.filter(b => b.status === 'LOADED').forEach(b => {
    const date = new Date(b.updatedAt);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
    if (hour >= 6 && hour < 16.5) {
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

startServer();
