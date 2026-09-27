import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import SupervisorHandoffWizard from '../components/SupervisorHandoffWizard';
import { Shield, Sparkles, Activity, Layers, HardHat, AlertTriangle, ArrowRight, MessageSquare, Tag, Clock } from 'lucide-react';
import { Link } from 'wouter';

export default function LandingPage() {
  const { bundles, jobs, exceptions, shiftMessages, activityEvents, setSelectedBundleForModal, setIsAiModalOpen } = useApp();
  const [isHandoffOpen, setIsHandoffOpen] = useState(false);

  const openExceptions = exceptions.filter(e => e.status === 'OPEN');
  const activeJobs = jobs.filter(j => j.completedBundles < j.totalBundles);
  const totalTonnage = Math.round(bundles.reduce((sum, b) => sum + b.weight, 0) / 2000);

  return (
    <div className="space-y-6 font-mono pb-12" id="landing-overview-page">
      {/* Hero Facility Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">
                Simcote Manufacturing • Saint Paul Plant
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md">
                1st Shift Active
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">SkyHook Industrial Logistics Command</h1>
            <p className="text-xs text-slate-400 font-sans mt-1">Real-time overhead gantry tracking, rebar fabrication stage routing, & ASTM coating compliance</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              <Sparkles className="h-4 w-4 animate-pulse" />
              <span>Launch AI Co-Pilot</span>
            </button>

            <button
              onClick={() => setIsHandoffOpen(true)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
            >
              <Shield className="h-4 w-4" />
              <span>Supervisor Shift Handoff</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xxs uppercase tracking-wider mb-1">
              <span>Total Active Inventory</span>
              <Layers className="h-4 w-4 text-muted" />
            </div>
            <div className="text-xl font-black text-white">{bundles.length} <span className="text-xs font-normal text-slate-400">Bundles</span></div>
            <div className="text-[10px] text-muted mt-1">{totalTonnage} Tons On Floor</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xxs uppercase tracking-wider mb-1">
              <span>Active Orders</span>
              <HardHat className="h-4 w-4 text-muted" />
            </div>
            <div className="text-xl font-black text-amber-400">{activeJobs.length} <span className="text-xs font-normal text-slate-400">In Progress</span></div>
            <div className="text-[10px] text-muted mt-1">{jobs.length} Total Registered</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xxs uppercase tracking-wider mb-1">
              <span>Floor Exceptions</span>
              <AlertTriangle className="h-4 w-4 text-muted" />
            </div>
            <div className="text-xl font-black text-rose-400">{openExceptions.length} <span className="text-xs font-normal text-slate-400">Open Holds</span></div>
            <div className="text-[10px] text-muted mt-1">Requires Supervisor Review</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xxs uppercase tracking-wider mb-1">
              <span>Shift Telemetry Stream</span>
              <Activity className="h-4 w-4 text-emerald-400 animate-pulse" />
            </div>
            <div className="text-xl font-black text-emerald-400">LIVE <span className="text-xs font-normal text-slate-400">SSE Stream</span></div>
            <div className="text-[10px] text-muted mt-1">{activityEvents.length} Events Logged</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Activity Stream + Shift Handoff Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Activity Stream */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-amber-500" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Live Real-Time Yard Telemetry Activity Stream</h2>
            </div>
            <Link href="/yard-map" className="text-xs text-amber-400 hover:underline flex items-center gap-1">
              <span>View Yard Map</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-[420px] pr-1">
            {activityEvents.map((evt) => (
              <div key={evt.id} className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs space-y-1 hover:border-slate-700 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-[10px]">
                      {evt.action}
                    </span>
                    <button
                      onClick={() => {
                        const b = bundles.find(item => item.tagId === evt.tagId);
                        if (b) setSelectedBundleForModal(b);
                      }}
                      className="font-bold text-slate-200 hover:text-amber-400 cursor-pointer flex items-center gap-1"
                    >
                      <Tag className="h-3 w-3 text-muted" />
                      <span>{evt.tagId}</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-muted flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="text-slate-300 font-sans text-xs flex items-center gap-2 pt-0.5">
                  <span className="text-slate-400">{evt.fromLocation}</span>
                  <ArrowRight className="h-3 w-3 text-muted shrink-0" />
                  <span className="text-emerald-400 font-mono font-bold">{evt.toLocation}</span>
                </div>

                {evt.details && (
                  <p className="text-[11px] text-slate-400 font-sans pt-1 border-t border-slate-900">
                    {evt.details} — <span className="text-muted">{evt.operatorName}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Shift Handoff Messages & Notes Log */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Shift Supervisor Logs</h2>
            </div>
            <button
              onClick={() => setIsHandoffOpen(true)}
              className="text-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-lg cursor-pointer"
            >
              + Add Log
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[420px] pr-1" tabIndex={0} role="region" aria-label="Shift supervisor logs">
            {shiftMessages.map((msg) => (
              <div key={msg.id} className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300">{msg.sender}</span>
                  <span className="text-[10px] text-muted">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">{msg.content}</p>
                <div className="text-[9px] text-muted uppercase tracking-wider font-mono">{msg.shift}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isHandoffOpen && <SupervisorHandoffWizard onClose={() => setIsHandoffOpen(false)} />}
    </div>
  );
}
