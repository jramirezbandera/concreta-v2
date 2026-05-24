import { useEffect, useRef, useState } from 'react';
import { useNavigation } from 'react-router';
import { moduleRegistry } from '../../data/moduleRegistry';

// Top-of-viewport progress bar driven by react-router's navigation state.
// Anti-flash: only appears after 80ms in 'loading' (cached chunks don't
// trigger it). Escalates at 10s and 20s so a stuck navigation doesn't leave
// a shimmer running forever.

type Phase = 'idle' | 'loading' | 'long' | 'stuck';

const ANTI_FLASH_MS = 80;
const LONG_MS = 10_000;
const STUCK_MS = 20_000;
const FADE_OUT_MS = 150;

function routeLabel(pathname: string | undefined): string {
  if (!pathname) return 'Cargando';
  const mod = moduleRegistry.find((m) => m.route === pathname);
  return mod ? `Cargando ${mod.label}` : 'Cargando';
}

export function RouteProgressBar() {
  const navigation = useNavigation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [reducedMotion, setReducedMotion] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stuckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const clearTimers = () => {
      if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
      if (longTimer.current) { clearTimeout(longTimer.current); longTimer.current = null; }
      if (stuckTimer.current) { clearTimeout(stuckTimer.current); stuckTimer.current = null; }
      if (hideTimer.current)  { clearTimeout(hideTimer.current);  hideTimer.current  = null; }
    };

    if (navigation.state === 'loading') {
      clearTimers();
      showTimer.current = setTimeout(() => setPhase('loading'), ANTI_FLASH_MS);
      longTimer.current = setTimeout(() => setPhase('long'), LONG_MS);
      stuckTimer.current = setTimeout(() => setPhase('stuck'), STUCK_MS);
    } else {
      clearTimers();
      // Fade-out: brief delay before fully hiding to allow CSS transition.
      hideTimer.current = setTimeout(() => setPhase('idle'), FADE_OUT_MS);
    }
    return clearTimers;
  }, [navigation.state]);

  if (phase === 'idle') return null;

  const label =
    phase === 'long' || phase === 'stuck'
      ? 'La carga está tardando más de lo normal'
      : routeLabel(navigation.location?.pathname);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
    >
      <span className="sr-only">{label}</span>
      {phase === 'stuck' ? (
        <div className="pointer-events-auto flex h-full items-center justify-end gap-2 bg-bg-surface/95 px-3 py-2">
          <span className="text-xs text-text-secondary">{label}</span>
          <button
            type="button"
            onClick={() => typeof window !== 'undefined' && window.location.reload()}
            className="text-xs text-accent hover:text-accent-hover underline"
          >
            Recargar
          </button>
        </div>
      ) : (
        <div
          className={[
            'h-full w-full',
            reducedMotion
              ? 'animate-pulse bg-accent'
              : 'bg-gradient-to-r from-transparent via-accent to-transparent bg-[length:40%_100%] bg-no-repeat animate-route-progress',
          ].join(' ')}
          style={{ opacity: 0.85 }}
        />
      )}
    </div>
  );
}
