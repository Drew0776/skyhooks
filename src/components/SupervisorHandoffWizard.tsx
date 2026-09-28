import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, CheckCircle, ArrowRight, Shield, AlertTriangle, MessageSquare, Loader2 } from 'lucide-react';
import { useDialog } from '../utils/useDialog';

interface SupervisorHandoffWizardProps {
  onClose: () => void;
}

export default function SupervisorHandoffWizard({ onClose }: SupervisorHandoffWizardProps) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const { exceptions, showToast, refreshState } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [handoffNotes, setHandoffNotes] = useState('');
  const [supervisorName, setSupervisorName] = useState('Dave Miller');
  const [targetShift, setTargetShift] = useState<'2nd Shift' | '1st Shift'>('2nd Shift');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openExceptions = exceptions.filter(e => e.status === 'OPEN');

  const handleSubmitHandoff = async () => {
    if (!handoffNotes.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/shift-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: `${supervisorName} (${targetShift === '2nd Shift' ? '1st' : '2nd'} Shift Supervisor)`,
          content: `[SHIFT HANDOFF NOTES]: ${handoffNotes}`,
          shift: targetShift
        })
      });

      if (res.ok) {
        showToast('Shift handoff completed and logged to activity stream!', 'success');
        await refreshState();
        onClose();
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.error || 'Failed to log handoff note.', 'error');
      }
    } catch {
      showToast('Network error submitting handoff.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" ref={dialogRef} id="supervisor-handoff-wizard" role="dialog" aria-modal="true" aria-label="Supervisor shift handoff">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl font-mono">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Supervisor Handoff Wizard</h2>
              <p className="text-[10px] text-slate-400 font-sans">Step {step} of 3: {step === 1 ? 'Review Open Exceptions' : step === 2 ? 'Supervisor Notes' : 'Confirm Handoff'}</p>
            </div>
          </div>
          <button onClick={onClose} id="handoff-modal-close" aria-label="Close handoff wizard" className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>Active exceptions require supervisor acknowledgment before shift completion.</span>
              </div>

              <div className="space-y-2 max-h-[220px] overflow-y-auto" tabIndex={0} role="region" aria-label="Open exceptions">
                {openExceptions.length === 0 ? (
                  <div className="p-6 text-center text-emerald-400 text-xs border border-emerald-500/20 bg-emerald-500/5 rounded-xl flex items-center justify-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>No open exceptions pending! Clean floor handoff.</span>
                  </div>
                ) : (
                  openExceptions.map(ex => (
                    <div key={ex.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-400">{ex.type}</span>
                        <span className="text-[10px] text-muted">Tag: {ex.tagId}</span>
                      </div>
                      <p className="text-slate-300 font-sans text-xxs leading-relaxed">{ex.description}</p>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Acknowledge & Continue</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="handoff-supervisor" className="text-[10px] text-slate-400 uppercase block mb-1">Outgoing Supervisor Name</label>
                <input
                  id="handoff-supervisor"
                  type="text"
                  value={supervisorName}
                  maxLength={50}
                  onChange={e => setSupervisorName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs text-slate-200"
                />
              </div>

              <div>
                <label htmlFor="handoff-shift" className="text-[10px] text-slate-400 uppercase block mb-1">Incoming Shift</label>
                <select
                  id="handoff-shift"
                  value={targetShift}
                  onChange={e => setTargetShift(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs text-slate-200"
                >
                  <option value="2nd Shift">2nd Shift (Afternoon / Evening)</option>
                  <option value="1st Shift">1st Shift (Morning)</option>
                </select>
              </div>

              <div>
                <label htmlFor="handoff-notes" className="text-[10px] text-slate-400 uppercase block mb-1">Operational Shift Notes & Crane Clearances</label>
                <textarea
                  id="handoff-notes"
                  rows={4}
                  value={handoffNotes}
                  maxLength={950}
                  onChange={e => setHandoffNotes(e.target.value)}
                  placeholder="e.g., Northwest gantry lube complete. 20 tons #5 epoxy staged at Shear Center for the bridge overpass job..."
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs text-slate-200 font-sans focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-lg text-xs cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!handoffNotes.trim()}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>Review Summary</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
                <div className="text-slate-400">Supervisor: <strong className="text-white">{supervisorName}</strong></div>
                <div className="text-slate-400">Target Shift: <strong className="text-amber-400">{targetShift}</strong></div>
                <div className="text-slate-400">Open Exceptions: <strong className="text-white">{openExceptions.length}</strong></div>
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[10px] text-muted uppercase block mb-1">Shift Notes:</span>
                  <p className="text-slate-300 font-sans text-xs italic">"{handoffNotes}"</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-lg text-xs cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={handleSubmitHandoff}
                  disabled={isSubmitting}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  <span>{isSubmitting ? 'Logging Handoff...' : 'Finalize Shift Handoff'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
