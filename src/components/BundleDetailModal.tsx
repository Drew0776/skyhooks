import React, { useRef, useEffect } from 'react';
import { Bundle } from '../types';
import { X, ShieldCheck, Tag, Weight, Ruler, Layers, Calendar, Cpu } from 'lucide-react';

interface BundleDetailModalProps {
  bundle: Bundle;
  onClose: () => void;
}

export default function BundleDetailModal({ bundle, onClose }: BundleDetailModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Geometry visualization based on shapeCode
    const strokeColor = bundle.grade === 'Epoxy' ? '#10b981' : '#f59e0b';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    if (bundle.shapeCode === '11') {
      // Closed stirrup / rectangle
      const w = 120;
      const h = 100;
      ctx.beginPath();
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

      // Overlap hooks
      ctx.beginPath();
      ctx.moveTo(cx + w / 2, cy - h / 2);
      ctx.lineTo(cx + w / 2 - 25, cy - h / 2 + 25);
      ctx.stroke();
    } else if (bundle.shapeCode === '21') {
      // L-Hook / 90 degree bend
      ctx.beginPath();
      ctx.moveTo(cx - 80, cy - 60);
      ctx.lineTo(cx - 80, cy + 50);
      ctx.lineTo(cx + 80, cy + 50);
      ctx.stroke();
    } else if (bundle.shapeCode === '51') {
      // Spiral
      ctx.beginPath();
      let r = 10;
      for (let a = 0; a < Math.PI * 8; a += 0.1) {
        r += 0.8;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      // Straight bar (00)
      ctx.beginPath();
      ctx.moveTo(cx - 110, cy);
      ctx.lineTo(cx + 110, cy);
      ctx.stroke();

      // End cap marks
      ctx.beginPath();
      ctx.arc(cx - 110, cy, 5, 0, Math.PI * 2);
      ctx.arc(cx + 110, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
    }
  }, [bundle]);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" id="bundle-detail-modal">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl font-mono">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg border ${
              bundle.grade === 'Epoxy' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}>
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-wide">{bundle.tagId}</h2>
              <p className="text-xs text-slate-400 font-sans">Job Order: {bundle.jobId} • Mark {bundle.mark}</p>
            </div>
          </div>
          <button onClick={onClose} id="bundle-modal-close" className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Visual Profile Canvas */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center relative">
            <div className="absolute top-3 left-3 text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-amber-500" />
              <span>3D Bending Geometry Profile • Shape Code {bundle.shapeCode || '00'}</span>
            </div>
            <canvas ref={canvasRef} width={400} height={180} className="w-full max-w-[400px] h-[180px]" />
          </div>

          {/* Specifications Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
              <span className="text-[10px] text-slate-500 block uppercase">Steel Grade</span>
              <span className={`font-bold mt-1 block ${bundle.grade === 'Epoxy' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {bundle.grade} Steel
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
              <span className="text-[10px] text-slate-500 block uppercase">Bar Size & Length</span>
              <span className="text-slate-200 font-bold mt-1 block">
                #{bundle.barSize} @ {bundle.length} ft
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
              <span className="text-[10px] text-slate-500 block uppercase">Weight & Count</span>
              <span className="text-slate-200 font-bold mt-1 block">
                {bundle.weight.toLocaleString()} lbs ({bundle.pieces} pcs)
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
              <span className="text-[10px] text-slate-500 block uppercase">Specification</span>
              <span className="text-slate-200 font-bold mt-1 block">
                {bundle.specification.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Traceability & Certs */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-500" />
              <span>Mill Cert & Traceability References</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400 font-sans pt-1">
              <div><strong className="text-slate-200 font-mono">Heat Cert #:</strong> {bundle.heatNumber || 'H-98841'}</div>
              <div><strong className="text-slate-200 font-mono">Coating Thickness:</strong> {bundle.coatingThicknessMils ? `${bundle.coatingThicknessMils} mils` : 'N/A (Black)'}</div>
              <div><strong className="text-slate-200 font-mono">Current Location:</strong> {bundle.location}</div>
              <div><strong className="text-slate-200 font-mono">Target Delivery:</strong> {bundle.shippingDate}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
