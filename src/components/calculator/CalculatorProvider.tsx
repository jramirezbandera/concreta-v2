import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Calculator } from './Calculator';
import { CalcLauncher } from './CalcLauncher';

interface CalculatorContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
}

const CalculatorContext = createContext<CalculatorContextValue>({
  open: () => {},
  close: () => {},
  toggle: () => {},
  isOpen: false,
});

// eslint-disable-next-line react-refresh/only-export-components
export function useCalculator() {
  return useContext(CalculatorContext);
}

interface CalculatorProviderProps {
  children: ReactNode;
}

// Mount once at the app shell. Owns open/minimized state, exposes context to
// any child (e.g. Topbar's button), and binds the global C/Esc shortcuts.
export function CalculatorProvider({ children }: CalculatorProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const open = useCallback(() => { setIsOpen(true); setMinimized(false); }, []);
  const close = useCallback(() => { setIsOpen(false); setMinimized(false); }, []);
  const minimize = useCallback(() => { setMinimized(true); }, []);
  const toggle = useCallback(() => {
    setIsOpen((v) => {
      if (v) return false;
      setMinimized(false);
      return true;
    });
  }, []);

  // Keyboard: C toggles, Esc closes. Skip when typing in an input/textarea/select
  // or contenteditable element so it doesn't fight with module input fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable;

      if (e.key === 'Escape' && isOpen && !minimized) {
        e.preventDefault();
        close();
        return;
      }
      if (!isEditable && (e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, minimized, close, toggle]);

  const ctx: CalculatorContextValue = { open, close, toggle, isOpen };

  return (
    <CalculatorContext.Provider value={ctx}>
      {children}
      <Calculator
        open={isOpen && !minimized}
        onClose={close}
        onMinimize={minimize}
      />
      {isOpen && minimized && <CalcLauncher onClick={() => setMinimized(false)} />}
    </CalculatorContext.Provider>
  );
}
