import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one screen's crash from blanking the whole console: the nav stays up, so the operator can
 * open another screen (the boundary is keyed by route, so moving on clears it) or reload.
 */
export default class ScreenErrorBoundary extends React.Component<Props, State> {
  declare props: Readonly<Props>; // this project's React types don't surface props on class components
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-10 max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 text-center font-mono">
        <AlertCircle className="mx-auto mb-3 h-6 w-6 text-rose-400" aria-hidden="true" />
        <h1 className="mb-2 text-sm font-bold text-white">This screen hit an error</h1>
        <p className="mb-5 text-xs leading-relaxed text-slate-400">
          Something on this screen couldn't be displayed (the details are in the browser console). The rest of the
          console still works: pick another screen above, or reload.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>Reload this screen</span>
        </button>
      </div>
    );
  }
}
