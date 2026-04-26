import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Calculator } from './Calculator';
import { CalcLauncher } from './CalcLauncher';
import { showToast } from '../ui/Toast';
import {
  CalculatorContext,
  type CalculatorContextValue,
  type FocusedTarget,
} from './calculator-context';

type EditableInput = HTMLInputElement | HTMLTextAreaElement;

interface CalculatorProviderProps {
  children: ReactNode;
}

// Resolve a human-readable label for an input. The codebase's <InputLabel>
// component already sets `title="<sym> <descShort>"` on its <label>, so that
// is the cleanest source. Fallbacks: label.textContent, aria-label, placeholder.
function resolveInputLabel(input: EditableInput): string {
  const id = input.id;
  if (id) {
    let lbl: HTMLLabelElement | null = null;
    try {
      lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    } catch {
      lbl = null;
    }
    if (lbl) {
      if (lbl.title) return lbl.title.trim();
      const t = lbl.textContent?.trim();
      if (t) return t;
    }
  }
  const aria = input.getAttribute('aria-label');
  if (aria) return aria.trim();
  if (input.placeholder) return input.placeholder.trim();
  return id || 'campo';
}

// Set a value on a React-controlled input by reaching past React's bookkeeping
// (calling the native value setter) and then dispatching the input event so
// the component's onChange fires.
function setReactInputValue(input: EditableInput, value: string) {
  const proto = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// Mount once at the app shell. Owns open/minimized state, exposes context to
// any child (e.g. Topbar's button), and binds the global C/Esc shortcuts.
export function CalculatorProvider({ children }: CalculatorProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [focusedTarget, setFocusedTarget] = useState<FocusedTarget | null>(null);
  // Mirror state in a ref so the insert callback always sees the latest target
  // without forcing every consumer to re-render on every focus change.
  const focusedRef = useRef<FocusedTarget | null>(null);

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

  // Track the last focused module input — anywhere in the document, except
  // inside the calculator panel itself (the panel is marked with
  // data-concreta-calc so we can exclude it).
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const isInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
      if (!isInput) return;
      // Skip non-editable inputs (buttons, checkboxes, the like).
      if (t instanceof HTMLInputElement) {
        const type = t.type.toLowerCase();
        if (['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'hidden'].includes(type)) {
          return;
        }
      }
      // Skip inputs inside the calculator panel.
      if (t.closest('[data-concreta-calc]')) return;
      const next: FocusedTarget = {
        element: t as EditableInput,
        label: resolveInputLabel(t as EditableInput),
      };
      focusedRef.current = next;
      setFocusedTarget(next);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const insertValue = useCallback((value: number) => {
    const target = focusedRef.current;
    if (target && target.element.isConnected) {
      try {
        setReactInputValue(target.element, String(value));
        target.element.focus();
        showToast(`Insertado en ${target.label}`, { autoDismiss: 1500 });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    navigator.clipboard?.writeText(String(value));
    showToast('Copiado al portapapeles', { autoDismiss: 1500 });
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

  const ctx: CalculatorContextValue = { open, close, toggle, isOpen, focusedTarget, insertValue };

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
