import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Briefcase, Tag, Search, Filter, Layers, Eye, ShieldCheck } from 'lucide-react';

export default function JobsPage() {
  const { bundles, jobs, setSelectedBundleForModal } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<'ALL' | 'Epoxy' | 'Black'>('ALL');

  const filteredBundles = bundles.filter(b => {
    const matchesSearch = b.tagId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.jobId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrade = selectedGrade === 'ALL' || b.grade === selectedGrade;
    return matchesSearch && matchesGrade;
  });

  return (
    <div className="space-y-6 font-mono pb-12" id="jobs-bundles-page">
      {/* Title Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-amber-500" />
            <span>Active Job Orders & Rebar Bundle Registry</span>
          </h1>
          <p className="text-xs text-slate-400 font-sans mt-1">Simcote Manufacturing • Complete inventory & shape code traceability</p>
        </div>
      </div>

      {/* Active Jobs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map(job => (
          <div key={job.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                Job #{job.id}
              </span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                job.grade === 'Epoxy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {job.grade} Steel
              </span>
            </div>

            <div>
              <h2 className="text-sm font-bold text-white font-sans">{job.customerName}</h2>
              <p className="text-xs text-slate-400 font-sans">{job.projectName}</p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xxs text-slate-400">
                <span>Fabrication Progress</span>
                <span className="text-amber-400 font-bold">{job.completedBundles} / {job.totalBundles} Bundles</span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-amber-500 h-full transition-all duration-500"
                  style={{ width: `${(job.completedBundles / job.totalBundles) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="text-xxs text-muted flex justify-between pt-2 border-t border-slate-800/80">
              <span>Target Delivery: {job.deliveryDate}</span>
              <span>{(job.totalWeightLbs / 2000).toFixed(1)} Tons</span>
            </div>
          </div>
        ))}
      </div>

      {/* Bundle Inventory Search & Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-amber-500" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Rebar Bundle Master Inventory</h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="h-3.5 w-3.5 text-muted absolute left-3 top-2.5" />
              <input aria-label="Search bundles"
                type="text"
                placeholder="Search Tag, Job, Location..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-hidden"
              />
            </div>

            <select aria-label="Grade"
              value={selectedGrade}
              onChange={e => setSelectedGrade(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 p-1.5 rounded-lg text-xs text-slate-200"
            >
              <option value="ALL">All Grades</option>
              <option value="Epoxy">Epoxy Coating</option>
              <option value="Black">Black Bar</option>
            </select>
          </div>
        </div>

        {/* Bundle Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xxs uppercase tracking-wider">
                <th className="py-2.5 px-3">Tag ID</th>
                <th className="py-2.5 px-3">Job ID</th>
                <th className="py-2.5 px-3">Mark</th>
                <th className="py-2.5 px-3">Size & Length</th>
                <th className="py-2.5 px-3">Grade</th>
                <th className="py-2.5 px-3">Weight</th>
                <th className="py-2.5 px-3">Location</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredBundles.map(b => (
                <tr key={b.id} className="hover:bg-slate-950/60 transition-colors">
                  <td className="py-3 px-3 font-bold text-amber-400">{b.tagId}</td>
                  <td className="py-3 px-3 font-mono text-slate-400">{b.jobId}</td>
                  <td className="py-3 px-3 font-mono text-slate-200">{b.mark}</td>
                  <td className="py-3 px-3">#{b.barSize} @ {b.length} ft</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-xxs font-bold ${
                      b.grade === 'Epoxy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {b.grade}
                    </span>
                  </td>
                  <td className="py-3 px-3">{b.weight.toLocaleString()} lbs</td>
                  <td className="py-3 px-3 text-slate-400">{b.location}</td>
                  <td className="py-3 px-3">
                    <span className="text-xxs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono uppercase">
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => setSelectedBundleForModal(b)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors cursor-pointer inline-flex items-center gap-1 text-xxs"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>3D Profile</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
