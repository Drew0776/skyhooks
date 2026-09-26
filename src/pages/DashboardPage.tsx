import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { isUvHazard, UV_GUIDANCE } from '../yardRules';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { LayoutDashboard, Sun, ShieldAlert, Award, TrendingUp, Layers, CheckCircle } from 'lucide-react';

interface DashboardStats {
  bendingCount: number;
  totalActiveJobs: number;
  stagedCount: number;
  loadedCount: number;
  rackedCount: number;
  rejectedCount: number;
  uvHazardsCount: number;
  firstShiftThroughput: number;
  secondShiftThroughput: number;
}

export default function DashboardPage() {
  const { bundles, jobs, setSelectedBundleForModal } = useApp();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Error loading dashboard stats:', err));
  }, [bundles]);

  const epoxyCount = bundles.filter(b => b.grade === 'Epoxy').length;
  const blackCount = bundles.filter(b => b.grade === 'Black').length;

  const gradeRatioData = [
    { name: 'Epoxy Steel (A775/A934)', value: epoxyCount, color: '#10b981' },
    { name: 'Black Bar (Uncoated)', value: blackCount, color: '#f59e0b' }
  ];

  const jobTonnageData = jobs.map(j => ({
    name: j.id,
    customer: j.customerName,
    weightTons: Math.round(j.totalWeightLbs / 2000),
    completed: j.completedBundles,
    total: j.totalBundles
  }));

  // Same rule the server uses: epoxy in an outdoor zone for 25+ days
  const uvHazardBundles = bundles.filter(b => isUvHazard(b));

  return (
    <div className="space-y-6 font-mono pb-12" id="dashboard-analytics-page">
      {/* Title Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-amber-500" />
            <span>Shift Throughput & Executive Analytics</span>
          </h1>
          <p className="text-xs text-slate-400 font-sans mt-1">Simcote Manufacturing • Real-time tonnage breakdown and ASTM compliance health</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xxs uppercase mb-2">
            <span>1st Shift Throughput</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{stats?.firstShiftThroughput || 0} <span className="text-xs font-normal text-slate-400">Tons</span></div>
          <p className="text-[10px] text-muted font-sans mt-1">Target: 35 Tons / shift</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xxs uppercase mb-2">
            <span>2nd Shift Throughput</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white">{stats?.secondShiftThroughput || 0} <span className="text-xs font-normal text-slate-400">Tons</span></div>
          <p className="text-[10px] text-muted font-sans mt-1">Target: 25 Tons / shift</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xxs uppercase mb-2">
            <span>ASTM UV Exposure Warnings</span>
            <Sun className="h-4 w-4 text-amber-500 animate-spin" />
          </div>
          <div className="text-2xl font-black text-amber-400">{uvHazardBundles.length} <span className="text-xs font-normal text-slate-400">Bundles</span></div>
          <p className="text-[10px] text-muted font-sans mt-1">25+ Days Outdoor Storage</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xxs uppercase mb-2">
            <span>Quality Compliance Rate</span>
            <Award className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">99.2%</div>
          <p className="text-[10px] text-muted font-sans mt-1">Under 2% coating damage threshold</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Jobs Tonnage Breakdown Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-4 border-b border-slate-800 pb-3">
            Active Job Tonnage (Tons)
          </h2>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jobTonnageData}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
                <Bar dataKey="weightTons" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Steel Grade Ratio Donut Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-4 border-b border-slate-800 pb-3">
            Epoxy vs. Black Bar Volume
          </h2>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gradeRatioData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {gradeRatioData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
                <Legend formatter={(value) => <span className="text-slate-300 text-xs font-sans">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ASTM UV Hazard Alert Panel */}
      {uvHazardBundles.length > 0 && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-400">
            <ShieldAlert className="h-5 w-5" />
            <h2 className="text-xs font-bold uppercase tracking-wider">ASTM Outdoor Storage Risk Flags</h2>
          </div>
          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            Epoxy bundles outdoors for 25+ days need covering soon. {UV_GUIDANCE}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {uvHazardBundles.map(b => (
              <div
                key={b.id}
                onClick={() => setSelectedBundleForModal(b)}
                className="p-3 bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-xl text-xs space-y-1 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between font-bold text-white">
                  <span>Tag: {b.tagId}</span>
                  <span className="text-amber-400 text-[10px]">{b.location}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-sans">
                  Staged at: {new Date(b.stagedAt!).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
