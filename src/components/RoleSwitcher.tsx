import React from 'react';
import { useApp } from '../context/AppContext';
import { Role } from '../types';
import { UserCheck, Shield, HardHat, Scissors, Wrench } from 'lucide-react';

export default function RoleSwitcher() {
  const { currentRole, setCurrentRole } = useApp();

  const roles: { role: Role; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { role: 'ADMIN', label: 'Supervisor / Admin', icon: Shield },
    { role: 'CRANE_OPERATOR', label: 'Crane Cab Op', icon: HardHat },
    { role: 'SHEAR_OPERATOR', label: 'Shear Operator', icon: Scissors },
    { role: 'BENDER', label: 'CNC Bender Tech', icon: Wrench },
  ];

  return (
    <div className="relative inline-block text-left" id="role-switcher-component">
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
        {roles.map((r) => {
          const Icon = r.icon;
          const isSelected = currentRole === r.role;
          return (
            <button
              key={r.role}
              onClick={() => setCurrentRole(r.role)}
              title={r.label}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono tracking-wider transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{r.role.replace('_', ' ')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
