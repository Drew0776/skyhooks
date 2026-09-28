import React, { useState } from 'react';
import { WIND_LOCKOUT_MPH, formatShipDate, gradePlacementViolation, gradeZoneViolation, isCoated, mixedSurfaceConflict, slottingConflict, slottingViolationMessage } from '../yardRules';
import { useApp } from '../context/AppContext';
import { HardHat, Compass, Anchor, AlertTriangle, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';

export default function CraneCabPage() {
  const { bundles, showToast, refreshState } = useApp();
  const [selectedCrane, setSelectedCrane] = useState<'Crane-NW' | 'Crane-NE' | 'Crane-SW' | 'Crane-SE'>('Crane-NW');
  const [originSector, setOriginSector] = useState('Coat-Station');
  const [destSector, setDestSector] = useState('Door-2');
  const [windSpeed, setWindSpeed] = useState(8); // mph
  const [ropeSway, setRopeSway] = useState(2); // degrees
  const [isExecuting, setIsExecuting] = useState(false);

  const [carryId, setCarryId] = useState('');
  const originBundles = bundles.filter(b => b.location === originSector);
  // Bundle to carry: the one picked, or the first bundle resting at the origin
  const targetBundle = originBundles.find(b => b.id === carryId) || originBundles[0];
  const windLocked = windSpeed >= WIND_LOCKOUT_MPH;
  const slotConflict = targetBundle ? slottingConflict(targetBundle, destSector, bundles) : undefined;
  // Why the carried bundle can't go to a drop zone, shown in the menu before the operator picks it
  const dropNote = (zone: string): string | null => {
    if (!targetBundle) return null;
    if (gradeZoneViolation(targetBundle.grade, zone)) return 'wrong zone for this bar';
    const other = mixedSurfaceConflict(targetBundle, zone, bundles);
    if (other) return `holds ${isCoated(other) ? 'coated' : 'black'} bar`;
    const buried = slottingConflict(targetBundle, zone, bundles);
    return buried ? `${buried.tagId} ships sooner` : null;
  };
  const dropOption = (zone: string, label: string) => {
    const note = dropNote(zone);
    return <option key={zone} value={zone}>{note ? `${label} (${note})` : label}</option>;
  };
  // The same zoning and ships-first checks the server runs, shown before the operator commits
  const placementIssue = targetBundle
    ? gradePlacementViolation(targetBundle, destSector, bundles) ?? (slotConflict ? slottingViolationMessage(targetBundle, slotConflict, destSector) : null)
    : null;

  const handleExecuteRoute = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch('/api/gantry/execute-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originId: originSector,
          destinationId: destSector,
          bundleId: targetBundle?.id,
          windSpeed,
          ropeSway,
          operatorName: `Gantry Operator (${selectedCrane})`
        })
      });

      const data = await res.json().catch(() => null);
      if (res.ok) {
        showToast(data?.message || 'Route executed successfully!', 'success');
        await refreshState();
      } else {
        showToast(data?.error || 'Gantry Interlock Violation', 'error');
      }
    } catch {
      showToast('Network error executing route.', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6 font-mono pb-12" id="crane-cab-page">
      {/* Heavy Gantry Crane Cab Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold">
              HEAVY GANTRY CAB CONSOLE
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
              Interlocks Active
            </span>
          </div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <HardHat className="h-6 w-6 text-amber-500" />
            <span>Overhead Crane Command & Slew Console</span>
          </h1>
          <p className="text-xs text-slate-400 font-sans mt-1">Gantry slewer • Material grade isolation • Automated slotting checks</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Active Gantry:</label>
          <select aria-label="Active gantry"
            value={selectedCrane}
            onChange={e => setSelectedCrane(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 p-2 rounded-lg text-xs text-amber-400 font-bold"
          >
            <option value="Crane-NW">Crane-NW (Epoxy North)</option>
            <option value="Crane-NE">Crane-NE (Epoxy East)</option>
            <option value="Crane-SW">Crane-SW (Black Bar SW)</option>
            <option value="Crane-SE">Crane-SE (Gantry SE)</option>
          </select>
        </div>
      </div>

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Environmental Telemetry & Safety Sensors */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-3 flex items-center gap-2">
            <Compass className="h-4 w-4 text-amber-500" />
            <span>Cab Telemetry & Anemometer</span>
          </h2>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <span>Wind Velocity Anemometer</span>
                <span className="text-amber-400 font-bold">{windSpeed} MPH</span>
              </div>
              <input aria-label="Wind speed in mph"
                type="range"
                min="0"
                max="35"
                value={windSpeed}
                onChange={e => setWindSpeed(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <span className={`text-[10px] ${windLocked ? 'text-rose-400 font-bold' : 'text-muted'}`}>{windLocked ? `Wind lockout: gantry travel is blocked at ${WIND_LOCKOUT_MPH}+ MPH` : `${WIND_LOCKOUT_MPH}+ MPH locks out outdoor gantry travel`}</span>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <span>Hoist Rope Sway Angle <span className="text-muted">(logged with each move)</span></span>
                <span className="text-amber-400 font-bold">{ropeSway}°</span>
              </div>
              <input aria-label="Hoist rope sway angle in degrees"
                type="range"
                min="0"
                max="10"
                value={ropeSway}
                onChange={e => setRopeSway(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
            <span className="text-[10px] text-muted uppercase block">Material Grade Rule:</span>
            <p className="text-slate-300 font-sans text-xxs leading-relaxed">
              {selectedCrane === 'Crane-SW'
                ? '⚠️ Crane-SW is the only crane allowed to lift black bar, and only within the SW zone.'
                : '✅ Epoxy Bar Gantry active. Restricted from Black Bar racks.'}
            </p>
          </div>
        </div>

        {/* Route Execution & Slew Controls */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 flex flex-col">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-3 flex items-center gap-2">
            <Anchor className="h-4 w-4 text-emerald-400" />
            <span>Overhead Gantry Transit Execution</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Pickup Origin Zone</label>
              <select aria-label="Pickup origin zone"
                value={originSector}
                onChange={e => setOriginSector(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs text-slate-200"
              >
                <option value="Coat-Station">Coat-Station</option>
                <option value="Shear-North">Shear-North</option>
                <option value="Rack J-04">Rack J-04</option>
                <option value="Rack J-12">Rack J-12</option>
                <option value="Raw-SW">Raw-SW (Black Bar)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Target Drop Zone</label>
              <select aria-label="Target drop zone"
                value={destSector}
                onChange={e => setDestSector(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs text-slate-200"
              >
                {dropOption('Door-1', 'Door-1 (Epoxy Flatbed)')}
                {dropOption('Door-2', 'Door-2 (Epoxy Flatbed)')}
                {dropOption('Door-7', 'Door-7 (Black Bar Door)')}
                {dropOption('Rack K-1', 'Rack K-1')}
                {dropOption('Rack K-2', 'Rack K-2')}
              </select>
            </div>
          </div>

          {/* Active Bundle Pick Preview */}
          {originBundles.length > 1 && (
            <div>
              <label htmlFor="carry-bundle" className="text-[10px] text-slate-400 uppercase block mb-1">Bundle To Carry</label>
              <select
                id="carry-bundle"
                value={targetBundle?.id || ''}
                onChange={e => setCarryId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs text-slate-200"
              >
                {originBundles.map(b => (
                  <option key={b.id} value={b.id}>{b.tagId} · {b.grade} #{b.barSize} · {b.specification.replace('ASTM_', 'ASTM ')}</option>
                ))}
              </select>
            </div>
          )}

          {placementIssue && (
            <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-mono">
              {placementIssue}
            </div>
          )}

          {targetBundle ? (
            <div className="p-4 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-emerald-400">
                <span>Bundle Ready: {targetBundle.tagId}</span>
                <span>{targetBundle.grade} Steel</span>
              </div>
              <div className="text-[11px] text-slate-300 font-sans">
                Weight: {targetBundle.weight.toLocaleString()} lbs • Spec: {targetBundle.specification.replace('ASTM_', 'ASTM ')} • Ships: {formatShipDate(targetBundle.shippingDate)}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-950/60 border border-dashed border-slate-800 rounded-xl text-muted text-xs">
              No bundle currently staged at origin "{originSector}". Trolley will execute idle traverse.
            </div>
          )}

          <button
            onClick={handleExecuteRoute}
            disabled={isExecuting || windLocked || !!placementIssue}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 mt-auto disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            <span>{isExecuting ? 'Executing Overhead Transit...' : windLocked ? 'Wind Lockout' : placementIssue ? 'Move Blocked' : 'Execute Gantry Move'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
