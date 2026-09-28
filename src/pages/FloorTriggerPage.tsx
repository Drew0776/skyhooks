import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Bundle } from '../types';
import { buildFloorReport, floorReportFileName } from '../utils/floorReport';
import { gradePlacementViolation, gradeZoneViolation, isCoated, mixedSurfaceConflict } from '../yardRules';
import { Shuffle, Scissors, Wrench, Download, Play, CheckCircle2, Cpu, ArrowRight, Loader2 } from 'lucide-react';

export default function FloorTriggerPage() {
  const { bundles, showToast, refreshState, setSelectedBundleForModal } = useApp();
  const [selectedBender, setSelectedBender] = useState('Bender-New-Robo');
  const [activeMandrelAngle, setActiveMandrelAngle] = useState(90);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Filter bundles eligible for fabrication
  const shearBundles = bundles.filter(b => b.status === 'STAGED' || b.status === 'RACKED');
  const bendingBundles = bundles.filter(b => b.status === 'BENDING');

  const benderName = selectedBender.replace(/^Bender-/, '');
  // Why a bundle can't go to the chosen bender (the server would refuse it), shown in place of the send button
  const benderNote = (b: Bundle): string | null => {
    const other = mixedSurfaceConflict(b, selectedBender, bundles);
    if (other) return `${benderName} holds ${isCoated(other) ? 'coated' : 'black'} bar (${other.tagId})`;
    return gradeZoneViolation(b.grade, selectedBender) ? `not for ${b.grade.toLowerCase()} bar` : null;
  };

  // Interactive Mandrel Simulation Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Draw CNC Mandrel Wheel
    ctx.beginPath();
    ctx.arc(cx, cy, 35, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Mandrel Center Pin
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();

    // Rebar path being bent around mandrel
    const rad = (activeMandrelAngle * Math.PI) / 180;
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(cx - 100, cy + 35);
    ctx.lineTo(cx, cy + 35);
    
    // Curved bend around mandrel
    const bendX = cx + 35 * Math.sin(rad);
    const bendY = cy + 35 * Math.cos(rad);
    ctx.lineTo(bendX, bendY);
    ctx.stroke();

  }, [activeMandrelAngle]);

  const handleSendToBender = async (bundleId: string) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/bundles/${bundleId}/send-to-bender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorName: 'Floor Technician', benderId: selectedBender })
      });
      if (res.ok) {
        showToast(`Bundle queued for bending at ${selectedBender}`, 'success');
        await refreshState();
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.error || 'Failed to queue bundle', 'error');
      }
    } catch {
      showToast('Network error queuing bundle.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkBent = async (bundleId: string) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/bundles/${bundleId}/mark-bent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorName: 'Floor Technician' })
      });
      if (res.ok) {
        showToast('Fabrication complete! Bundle moved to staged queue.', 'success');
        await refreshState();
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.error || 'Failed to complete fabrication.', 'error');
      }
    } catch {
      showToast('Network error updating bundle.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      // Load the PDF library only when a report is exported
      const { jsPDF } = await import('jspdf');
      const doc = buildFloorReport(new jsPDF(), bundles);
      doc.save(floorReportFileName());
      showToast('PDF Report Exported!', 'success');
    } catch (err) {
      console.error('Error generating PDF:', err);
      showToast('Could not build the PDF report.', 'error');
    }
  };

  const runSimulation = () => {
    setIsSimulating(true);
    let angle = 0;
    const interval = setInterval(() => {
      angle += 5;
      if (angle > 135) {
        clearInterval(interval);
        setIsSimulating(false);
      }
      setActiveMandrelAngle(angle);
    }, 40);
  };

  return (
    <div className="space-y-6 font-mono pb-12" id="floor-trigger-page">
      {/* Title Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Shuffle className="h-6 w-6 text-amber-500" />
            <span>Fabrication Floor Stage Trigger & CNC Control</span>
          </h1>
          <p className="text-xs text-slate-400 font-sans mt-1">Sizing Shears • CNC Mandrel Benders • Batch Transit Optimization</p>
        </div>

        <button
          onClick={handleExportPDF}
          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 self-start md:self-auto shrink-0"
        >
          <Download className="h-4 w-4" />
          <span>Export Fabrication PDF Manifest</span>
        </button>
      </div>

      {/* Main Grid: CNC Bending Simulation & Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CNC Mandrel 3D Simulator */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-amber-500" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">CNC Mandrel Angle Simulator</h2>
            </div>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
              Ready
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center relative">
            <canvas ref={canvasRef} width={280} height={180} className="w-full max-w-[280px] h-[180px]" />
            <div className="text-[10px] text-slate-400 font-mono mt-2">
              Bend Angle: <strong className="text-amber-400">{activeMandrelAngle}°</strong>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div>
              <label className="text-[10px] uppercase text-slate-400 block mb-1">Target Mandrel Angle ({activeMandrelAngle}°)</label>
              <input aria-label="Target mandrel angle"
                type="range"
                min="0"
                max="180"
                value={activeMandrelAngle}
                onChange={e => setActiveMandrelAngle(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <button
              onClick={runSimulation}
              disabled={isSimulating}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Play className="h-4 w-4" />
              <span>{isSimulating ? 'Simulating CNC Cycle...' : 'Run Mandrel Test Cycle'}</span>
            </button>
          </div>
        </div>

        {/* Queued Fabrication Queues */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-indigo-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">Active Fabrication Floor Queue</h2>
            </div>
            <select aria-label="Bender"
              value={selectedBender}
              onChange={e => setSelectedBender(e.target.value)}
              className="bg-slate-950 border border-slate-800 p-1.5 rounded text-xs text-slate-200"
            >
              <option value="Bender-New-Robo">New-Robo CNC Bender</option>
              <option value="Bender-11-Bender">11-Bender (Heavy Bar)</option>
            </select>
          </div>

          {/* Active Bending Operations */}
          <div className="space-y-3">
            <h3 className="text-xxs text-amber-400 uppercase tracking-widest font-bold">Currently In Fabrication</h3>
            {bendingBundles.length === 0 ? (
              <div className="p-4 text-center text-muted text-xs border border-dashed border-slate-800 rounded-xl">
                No bundles currently undergoing bending at {selectedBender}.
              </div>
            ) : (
              bendingBundles.map(b => (
                <div key={b.id} className="p-3 bg-slate-950 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>Tag: {b.tagId}</span>
                      <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-mono">
                        Shape: {b.shapeCode || '00'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans">#{b.barSize} @ {b.length} ft ({b.weight} lbs)</p>
                  </div>

                  <button
                    onClick={() => handleMarkBent(b.id)}
                    disabled={isProcessing}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Mark Complete</span>
                  </button>
                </div>
              ))
            )}

            <h3 className="text-xxs text-slate-400 uppercase tracking-widest font-bold pt-4">Staged Ready for Fabrication Trigger</h3>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {shearBundles.map(b => (
                <div key={b.id} className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-slate-200">Tag: {b.tagId}</span>
                    <span className="text-slate-400 font-sans text-xxs ml-2">Location: {b.location}</span>
                  </div>

                  {benderNote(b) ? (
                    <span className="text-amber-300 text-xxs font-mono text-right shrink-0" title={gradePlacementViolation(b, selectedBender, bundles) || undefined}>
                      {benderNote(b)}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSendToBender(b.id)}
                      disabled={isProcessing}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1 rounded text-xxs transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <span>Send {b.tagId} to {benderName}</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
