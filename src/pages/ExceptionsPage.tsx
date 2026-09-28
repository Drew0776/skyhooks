import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AlertTriangle, ShieldCheck, CheckCircle2, Clock, FileSpreadsheet, Loader2 } from 'lucide-react';

export default function ExceptionsPage() {
  const { exceptions, bundles, showToast, refreshState, setSelectedBundleForModal } = useApp();
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [isResolving, setIsResolving] = useState<string | null>(null);

  const handleResolveException = async (exceptionId: string) => {
    const notes = resolutionNotes[exceptionId] || 'Resolved by Quality Inspector';
    setIsResolving(exceptionId);

    try {
      const res = await fetch(`/api/exceptions/${exceptionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorName: 'Quality Tech / Supervisor',
          resolutionNotes: notes
        })
      });

      if (res.ok) {
        showToast('Exception hold resolved successfully!', 'success');
        await refreshState();
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.error || 'Failed to resolve exception.', 'error');
      }
    } catch {
      showToast('Network error resolving exception.', 'error');
    } finally {
      setIsResolving(null);
    }
  };

  return (
    <div className="space-y-6 font-mono pb-12" id="exceptions-hold-page">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-rose-500" />
            <span>Floor Quality Holds & Exception Log</span>
          </h1>
          <p className="text-xs text-slate-400 font-sans mt-1">ASTM A775 holiday coating damage • UV storage limits • Interlock blocks</p>
        </div>
      </div>

      {/* Exception Cards */}
      <div className="space-y-4">
        {exceptions.map(ex => {
          const associatedBundle = bundles.find(b => b.tagId === ex.tagId);
          const isOpen = ex.status === 'OPEN';

          return (
            <div
              key={ex.id}
              className={`bg-slate-900 border rounded-2xl p-5 shadow-xl space-y-3 transition-colors ${
                isOpen ? 'border-rose-500/30' : 'border-slate-800/60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                    isOpen ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {ex.type}
                  </span>
                  <span className="font-bold text-white text-xs">Tag: {ex.tagId}</span>
                </div>

                <div className="flex items-center gap-2 text-xxs text-slate-400">
                  <Clock className="h-3.5 w-3.5 text-muted" />
                  <span>Logged: {new Date(ex.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs font-sans">
                <p className="text-slate-300 leading-relaxed">{ex.description}</p>
                <div className="text-xxs font-mono text-muted">
                  Logged by: <strong className="text-slate-300">{ex.loggedBy}</strong>
                </div>
              </div>

              {isOpen ? (
                <div className="pt-3 border-t border-slate-800/80 space-y-3">
                  <div>
                    <label className="text-[10px] text-slate-400 font-mono uppercase block mb-1">
                      Quality Technician Resolution Action
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Patch touch-up complete using epoxy liquid compound per ASTM A775..."
                      value={resolutionNotes[ex.id] || ''}
                      maxLength={500}
                      onChange={e => setResolutionNotes({ ...resolutionNotes, [ex.id]: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    {associatedBundle && (
                      <button
                        onClick={() => setSelectedBundleForModal(associatedBundle)}
                        className="text-xs text-amber-400 hover:underline font-mono cursor-pointer"
                      >
                        Inspect Bundle {associatedBundle.tagId}
                      </button>
                    )}

                    <button
                      onClick={() => handleResolveException(ex.id)}
                      disabled={isResolving === ex.id}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5 ml-auto"
                    >
                      {isResolving === ex.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      <span>Clear Quality Hold</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1 font-sans">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono">
                    <ShieldCheck className="h-4 w-4" />
                    <span>RESOLVED</span>
                  </div>
                  <p className="text-slate-400 text-xxs">{ex.resolutionNotes}</p>
                  <div className="text-[9px] text-muted font-mono">
                    Resolved by: {ex.resolvedBy} on {new Date(ex.resolvedAt!).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
