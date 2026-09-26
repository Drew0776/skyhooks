import React, { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';
import { AppProvider, useApp } from './context/AppContext';
import NavBar from './components/NavBar';
import BundleDetailModal from './components/BundleDetailModal';

// Each console screen loads on demand, so the first page doesn't download every screen's code
const LandingPage = lazy(() => import('./pages/LandingPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const FloorTriggerPage = lazy(() => import('./pages/FloorTriggerPage'));
const CraneCabPage = lazy(() => import('./pages/CraneCabPage'));
const YardMapPage = lazy(() => import('./pages/YardMapPage'));
const JobsPage = lazy(() => import('./pages/JobsPage'));
const ExceptionsPage = lazy(() => import('./pages/ExceptionsPage'));

function ScreenLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] font-mono text-xs text-slate-500" role="status" aria-live="polite">
      Loading console...
    </div>
  );
}

function AppContent() {
  const { selectedBundleForModal, setSelectedBundleForModal, toast } = useApp();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950 flex flex-col antialiased">
      <NavBar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Suspense fallback={<ScreenLoader />}>
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
        </Suspense>
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
