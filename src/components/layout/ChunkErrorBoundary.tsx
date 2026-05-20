import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  reloading: boolean;
  error: Error | null;
}

// Catches `ChunkLoadError` / "Failed to fetch dynamically imported module"
// errors that fire when a deploy renames a lazy chunk while a user is on the
// stale HTML. Hard-reload recovers them onto the fresh chunk set; non-chunk
// errors bubble up untouched.
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { reloading: false, error: null };

  // Pure: classify the error for the render path.
  static getDerivedStateFromError(error: Error): State {
    if (isChunkLoadError(error)) return { reloading: true, error: null };
    return { reloading: false, error };
  }

  // Side effect: fire reload once. React invokes getDerivedStateFromError
  // twice in dev mode by design, so reload() lives here instead.
  componentDidCatch(error: Error) {
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  render() {
    if (this.state.error) throw this.state.error;
    // While reloading, render nothing so the just-throwing child doesn't
    // re-mount and throw again before the page reload completes.
    if (this.state.reloading) return null;
    return this.props.children;
  }
}

function isChunkLoadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  if (e.name === 'ChunkLoadError') return true;
  const msg = e.message ?? '';
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Importing a module script failed')
  );
}
