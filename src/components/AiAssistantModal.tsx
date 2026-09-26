import React, { useState } from 'react';
import { Bot, Sparkles, Send, MapPin, AlertTriangle, ArrowRight, Loader2, X, RefreshCw } from 'lucide-react';

interface AiAssistantModalProps {
  onClose: () => void;
  defaultOrigin?: string;
  defaultDest?: string;
}

export default function AiAssistantModal({ onClose, defaultOrigin = '', defaultDest = '' }: AiAssistantModalProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'route' | 'anomalies'>('chat');

  // Query Chat States
  const [queryPrompt, setQueryPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    { role: 'assistant', text: 'Hello Operator! I am SkyHook AI powered by Gemini 3.6 Flash. Ask me anything about bundle locations, ASTM specs, active jobs, or shift handoffs.' }
  ]);
  const [isQuerying, setIsQuerying] = useState(false);

  // Route Analysis States
  const [originId, setOriginId] = useState(defaultOrigin || 'Crane-NW');
  const [destinationId, setDestinationId] = useState(defaultDest || 'Door-1');
  const [bundleTagId, setBundleTagId] = useState('TG-101');
  const [routeResult, setRouteResult] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  // Log Anomaly Analysis States
  const [logAnalysis, setLogAnalysis] = useState<string | null>(null);
  const [isAnalyzingLogs, setIsAnalyzingLogs] = useState(false);

  const handleSendQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryPrompt.trim() || isQuerying) return;

    const userText = queryPrompt;
    setChatHistory(prev => [...prev, { role: 'user', text: userText }]);
    setQueryPrompt('');
    setIsQuerying(true);

    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userText })
      });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(prev => [...prev, { role: 'assistant', text: data.answer }]);
      } else {
        const err = await res.json().catch(() => ({}));
        setChatHistory(prev => [...prev, { role: 'assistant', text: err.error || 'Error contacting AI intelligence service.' }]);
      }
    } catch {
      setChatHistory(prev => [...prev, { role: 'assistant', text: 'Network connection failure.' }]);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleOptimizeRoute = async () => {
    if (!originId || !destinationId || isRouting) return;
    setIsRouting(true);
    setRouteResult(null);

    try {
      const res = await fetch('/api/ai/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originId, destinationId, bundleTagId })
      });
      if (res.ok) {
        const data = await res.json();
        setRouteResult(data.recommendation);
      } else {
        const err = await res.json().catch(() => ({}));
        setRouteResult(err.error || 'Failed to run route analysis.');
      }
    } catch {
      setRouteResult('Network error running route analysis.');
    } finally {
      setIsRouting(false);
    }
  };

  const handleAnalyzeLogs = async () => {
    if (isAnalyzingLogs) return;
    setIsAnalyzingLogs(true);
    setLogAnalysis(null);

    try {
      const res = await fetch('/api/ai/analyze-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setLogAnalysis(data.analysis);
      } else {
        const err = await res.json().catch(() => ({}));
        setLogAnalysis(err.error || 'Failed to analyze shift logs.');
      }
    } catch {
      setLogAnalysis('Network error contacting AI analytics engine.');
    } finally {
      setIsAnalyzingLogs(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" id="ai-assistant-modal-container">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                SkyHook AI Co-Pilot
                <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-normal">
                  Gemini 3.6 Flash
                </span>
              </h2>
              <p className="text-[10px] text-slate-400 font-sans">Industrial yard logistics & safety intelligence model</p>
            </div>
          </div>
          <button onClick={onClose} id="ai-modal-close-button" className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 p-1 gap-1">
          <button
            onClick={() => setActiveTab('chat')}
            id="ai-tab-chat"
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'chat' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="h-3.5 w-3.5" /> Yard Assistant Chat
          </button>
          <button
            onClick={() => setActiveTab('route')}
            id="ai-tab-route"
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'route' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" /> Gantry Route Optimizer
          </button>
          <button
            onClick={() => setActiveTab('anomalies')}
            id="ai-tab-anomalies"
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'anomalies' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Anomaly & Risk Detector
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/20">
          {/* TAB 1: YARD ASSISTANT CHAT */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-[380px]">
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-3">
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div className={`p-3 rounded-xl max-w-[80%] text-xs font-sans whitespace-pre-wrap leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-amber-500/20 border border-amber-500/30 text-slate-100 font-mono'
                        : 'bg-slate-900 border border-slate-800 text-slate-300'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isQuerying && (
                  <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    <span>Gemini is analyzing live yard telemetry...</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendQuery} className="flex gap-2 shrink-0">
                <input
                  type="text"
                  value={queryPrompt}
                  onChange={(e) => setQueryPrompt(e.target.value)}
                  placeholder="e.g. Which bundles are currently staged at Shear North?"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-hidden"
                />
                <button
                  type="submit"
                  disabled={!queryPrompt.trim() || isQuerying}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Ask</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: ROUTE OPTIMIZER */}
          {activeTab === 'route' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Origin Zone</label>
                  <input
                    type="text"
                    value={originId}
                    onChange={(e) => setOriginId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Destination Zone</label>
                  <input
                    type="text"
                    value={destinationId}
                    onChange={(e) => setDestinationId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Bundle Tag</label>
                  <input
                    type="text"
                    value={bundleTagId}
                    onChange={(e) => setBundleTagId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs text-slate-200"
                  />
                </div>
              </div>

              <button
                onClick={handleOptimizeRoute}
                disabled={isRouting}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isRouting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                <span>{isRouting ? 'Evaluating Gantry Safety...' : 'Run AI Route Optimization'}</span>
              </button>

              {routeResult && (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs font-sans text-slate-300 leading-relaxed whitespace-pre-wrap max-h-[250px] overflow-y-auto">
                  {routeResult}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ANOMALY & RISK DETECTOR */}
          {activeTab === 'anomalies' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase">Scan Shift Intelligence & Logs</h3>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5">Detect equipment risks, shear blade wear, and ASTM UV warnings</p>
                </div>
                <button
                  onClick={handleAnalyzeLogs}
                  disabled={isAnalyzingLogs}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {isAnalyzingLogs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  <span>{isAnalyzingLogs ? 'Analyzing...' : 'Run AI Scan'}</span>
                </button>
              </div>

              {logAnalysis ? (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs font-sans text-slate-300 leading-relaxed whitespace-pre-wrap max-h-[280px] overflow-y-auto">
                  {logAnalysis}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                  Click 'Run AI Scan' above to analyze active shift messages and exception holds.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
