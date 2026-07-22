import React from 'react';
import { Route, Switch } from 'wouter';
import { AppProvider, useApp } from './context/AppContext';
import NavBar from './components/NavBar';
import BundleDetailModal from './components/BundleDetailModal';

import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import FloorTriggerPage from './pages/FloorTriggerPage';
import CraneCabPage from './pages/CraneCabPage';
import YardMapPage from './pages/YardMapPage';
import JobsPage from './pages/JobsPage';
import ExceptionsPage from './pages/ExceptionsPage';

function AppContent() {
  const { selectedBundleForModal, setSelectedBundleForModal, toast } = useApp();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950 flex flex-col antialiased">
      <NavBar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/floor" component={FloorTriggerPage} />
          <Route path="/crane" component={CraneCabPage} />
          <Route path="/yard-map" component={YardMapPage} />
          <Route path="/jobs" component={JobsPage} />
          <Route path="/exceptions" component={ExceptionsPage} />
          <Route>
            <LandingPage />
          </Route>
        </Switch>
      </main>

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce" id="global-toast-notification">
          <div className={`px-4 py-3 rounded-xl shadow-2xl border font-mono text-xs flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-slate-900 border-emerald-500/50 text-emerald-300'
              : toast.type === 'error'
              ? 'bg-slate-900 border-rose-500/50 text-rose-300'
              : 'bg-slate-900 border-amber-500/50 text-amber-300'
          }`}>
            <span className="h-2 w-2 rounded-full bg-current animate-ping"></span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Global Bundle Detail Modal */}
      {selectedBundleForModal && (
        <BundleDetailModal
          bundle={selectedBundleForModal}
          onClose={() => setSelectedBundleForModal(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
