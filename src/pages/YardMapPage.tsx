import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import AiAssistantModal from '../components/AiAssistantModal';
import { Map, Sparkles, Layers, Shield, Navigation, AlertTriangle, ArrowRight } from 'lucide-react';

export default function YardMapPage() {
  const { bundles, setSelectedBundleForModal, setIsAiModalOpen } = useApp();
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const zones: Record<string, { name: string; x: number; y: number; w: number; h: number; type: 'epoxy' | 'black' | 'fab' | 'door' }> = {
    'Crane-NW': { name: 'GANTRY NW', x: 32, y: 52, w: 135, h: 60, type: 'epoxy' },
    'Rack J-04': { name: 'RACK J-04', x: 180, y: 52, w: 135, h: 60, type: 'epoxy' },
    'Rack J-12': { name: 'RACK J-12', x: 328, y: 52, w: 135, h: 60, type: 'epoxy' },
    'Door-1': { name: 'DOOR-1 BAY', x: 106, y: 125, w: 135, h: 65, type: 'door' },
    'Door-2': { name: 'DOOR-2 BAY', x: 254, y: 125, w: 135, h: 65, type: 'door' },
    'Crane-NE': { name: 'GANTRY NE', x: 833, y: 52, w: 135, h: 60, type: 'epoxy' },
    'Rack K-1': { name: 'RACK K-1', x: 685, y: 52, w: 135, h: 60, type: 'epoxy' },
    'Coat-Station': { name: 'COAT TUNNEL', x: 32, y: 242, w: 215, h: 50, type: 'fab' },
    'Shear-North': { name: 'SHEAR NORTH', x: 267, y: 242, w: 220, h: 50, type: 'fab' },
    'Shear-Center': { name: 'SHEAR CENTER', x: 512, y: 242, w: 220, h: 50, type: 'fab' },
    'Shear-South': { name: 'SHEAR SOUTH', x: 757, y: 242, w: 215, h: 50, type: 'fab' },
    'Raw-SW': { name: 'STOCK SW', x: 32, y: 345, w: 135, h: 65, type: 'black' },
    'Crane-SW': { name: 'CRANE SW', x: 180, y: 345, w: 135, h: 65, type: 'black' },
    'Door-7': { name: 'DOOR-7 BAY', x: 180, y: 422, w: 135, h: 65, type: 'door' },
    'Door-8': { name: 'DOOR-8 BAY', x: 328, y: 422, w: 135, h: 65, type: 'door' },
    'Bender-New-Robo': { name: 'NEW-ROBO CNC', x: 601, y: 422, w: 135, h: 65, type: 'fab' },
    'Bender-11-Bender': { name: '11-BENDER', x: 749, y: 422, w: 135, h: 65, type: 'fab' }
  };

  const zoneBundles = selectedZone ? bundles.filter(b => b.location === selectedZone) : [];

  return (
    <div className="space-y-6 font-mono pb-12" id="yard-map-blueprint-page">
      {/* Title Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Map className="h-6 w-6 text-amber-500" />
            <span>Interactive Yard Blueprint Floorplan</span>
          </h1>
          <p className="text-xs text-slate-400 font-sans mt-1">Saint Paul Plant • Real-time sector density & material isolation zones</p>
        </div>

        <button
          type="button"
          onClick={() => setIsAiModalOpen(true)}
          className="px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all cursor-pointer flex items-center gap-2 self-start md:self-auto shrink-0"
        >
          <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
          <span>AI Route Advisory</span>
        </button>
      </div>

      {/* Main SVG Blueprint Canvas */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Epoxy Sector
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> Black Steel Sector
            </span>
            <span className="flex items-center gap-1 text-indigo-400">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500"></span> Fab Equipment
            </span>
          </div>
          <span className="text-slate-500">Click any sector to inspect bundles</span>
        </div>

        <div className="overflow-x-auto bg-slate-950 rounded-xl p-4 border border-slate-800">
          <svg viewBox="0 0 1000 520" className="w-full h-auto min-w-[700px] text-xs">
            {/* Sector Background Grid */}
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            </pattern>
            <rect width="1000" height="520" fill="url(#grid)" />

            {/* Zone Rectangles */}
            {Object.entries(zones).map(([id, zone]) => {
              const bCount = bundles.filter(b => b.location === id).length;
              const isSelected = selectedZone === id;

              let fillColor = 'rgba(15, 23, 42, 0.8)';
              let strokeColor = '#334155';

              if (zone.type === 'epoxy') strokeColor = '#10b981';
              else if (zone.type === 'black') strokeColor = '#f59e0b';
              else if (zone.type === 'fab') strokeColor = '#6366f1';
              else if (zone.type === 'door') strokeColor = '#3b82f6';

              if (isSelected) {
                fillColor = 'rgba(245, 158, 11, 0.2)';
                strokeColor = '#fbbf24';
              }

              return (
                <g key={id} onClick={() => setSelectedZone(id)} className="cursor-pointer group">
                  <rect
                    x={zone.x}
                    y={zone.y}
                    width={zone.w}
                    height={zone.h}
                    rx="8"
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? "2.5" : "1.5"}
                    className="transition-all duration-200 group-hover:stroke-amber-400"
                  />
                  <text
                    x={zone.x + zone.w / 2}
                    y={zone.y + zone.h / 2 - 4}
                    fill="#e2e8f0"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="font-mono"
                  >
                    {zone.name}
                  </text>
                  <text
                    x={zone.x + zone.w / 2}
                    y={zone.y + zone.h / 2 + 12}
                    fill={bCount > 0 ? '#10b981' : '#64748b'}
                    fontSize="9"
                    textAnchor="middle"
                    className="font-mono"
                  >
                    {bCount} {bCount === 1 ? 'Bundle' : 'Bundles'}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Selected Sector Bundle Inspector */}
      {selectedZone && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase">
              Sector Inspection: <span className="text-amber-400">{selectedZone}</span>
            </h3>
            <button onClick={() => setSelectedZone(null)} className="text-xs text-slate-400 hover:text-white cursor-pointer">
              Close
            </button>
          </div>

          {zoneBundles.length === 0 ? (
            <p className="text-xs text-slate-500 font-sans p-4 text-center">No bundles currently stored in sector "{selectedZone}".</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {zoneBundles.map(b => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBundleForModal(b)}
                  className="p-3 bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-xl text-xs space-y-1 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between font-bold text-white">
                    <span>Tag: {b.tagId}</span>
                    <span className={b.grade === 'Epoxy' ? 'text-emerald-400' : 'text-amber-400'}>{b.grade}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-sans">
                    #{b.barSize} @ {b.length} ft • {b.weight.toLocaleString()} lbs
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
