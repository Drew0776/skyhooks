import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Bundle, Job, Operator, Exception, ShiftMessage, ActivityEvent, Role } from '../types';
import { RECONNECTED_EVENT } from '../components/ConnectionBanner';

interface ToastInfo {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  bundles: Bundle[];
  jobs: Job[];
  operators: Operator[];
  exceptions: Exception[];
  shiftMessages: ShiftMessage[];
  activityEvents: ActivityEvent[];
  currentRole: Role;
  setCurrentRole: (role: Role) => void;
  selectedBundleForModal: Bundle | null;
  setSelectedBundleForModal: (bundle: Bundle | null) => void;
  toast: ToastInfo | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  refreshState: () => Promise<void>;
  isAiModalOpen: boolean;
  setIsAiModalOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [shiftMessages, setShiftMessages] = useState<ShiftMessage[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [currentRole, setCurrentRole] = useState<Role>('ADMIN');
  const [selectedBundleForModal, setSelectedBundleForModal] = useState<Bundle | null>(null);
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToast({ id, type, message });
    setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev));
    }, 4500);
  };

  const fetchAllData = async () => {
    try {
      const [bRes, jRes, oRes, eRes, mRes, aRes] = await Promise.all([
        fetch('/api/bundles'),
        fetch('/api/jobs'),
        fetch('/api/operators'),
        fetch('/api/exceptions'),
        fetch('/api/shift-messages'),
        fetch('/api/activity')
      ]);

      if (bRes.ok) setBundles(await bRes.json());
      if (jRes.ok) setJobs(await jRes.json());
      if (oRes.ok) setOperators(await oRes.json());
      if (eRes.ok) setExceptions(await eRes.json());
      if (mRes.ok) setShiftMessages(await mRes.json());
      if (aRes.ok) setActivityEvents(await aRes.json());
    } catch (err) {
      console.error('Error fetching state:', err);
    }
  };

  useEffect(() => {
    fetchAllData();
    // After the server was unreachable (a restart resets the yard), reload everything rather than keep stale state
    window.addEventListener(RECONNECTED_EVENT, fetchAllData);

    // Setup Server-Sent Events (SSE) for real-time state synchronization
    const eventSource = new EventSource('/api/updates');

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'update' && parsed.data) {
          if (parsed.data.bundles) setBundles(parsed.data.bundles);
          if (parsed.data.jobs) setJobs(parsed.data.jobs);
          if (parsed.data.exceptions) setExceptions(parsed.data.exceptions);
          if (parsed.data.shiftMessages) setShiftMessages(parsed.data.shiftMessages);
          if (parsed.data.activityEvents) setActivityEvents(parsed.data.activityEvents);
        }
      } catch (err) {
        console.error('SSE JSON error:', err);
      }
    };

    return () => {
      eventSource.close();
      window.removeEventListener(RECONNECTED_EVENT, fetchAllData);
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        bundles,
        jobs,
        operators,
        exceptions,
        shiftMessages,
        activityEvents,
        currentRole,
        setCurrentRole,
        selectedBundleForModal,
        setSelectedBundleForModal,
        toast,
        showToast,
        refreshState: fetchAllData,
        isAiModalOpen,
        setIsAiModalOpen
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
