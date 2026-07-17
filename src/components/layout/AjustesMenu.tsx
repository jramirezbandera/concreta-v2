// Menú "Ajustes" de la topbar (rediseño 2026-07-17). Descongestiona la barra
// recogiendo los controles ocasionales — Unidades, Tema y Copiar enlace — tras
// un desplegable de engranaje, de modo que la barra queda con las acciones
// primarias (Asistente IA, Calculadora, Exportar PDF).
//
// A11y: cierra con Escape y con clic fuera; el disparador expone aria-expanded.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Link2, SlidersHorizontal } from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';
import { UnitSystemToggle } from '../units/UnitSystemToggle';
import { useUnitSystem } from '../../lib/units/useUnitSystem';

interface AjustesMenuProps {
  /** Copia el enlace del cálculo (el mismo handler que usaba la topbar). */
  onCopyLink: () => void;
}

export function AjustesMenu({ onCopyLink }: AjustesMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // La fila de Unidades solo se muestra si el módulo permite conmutar unidades
  // (algunos las fijan): así no queda una etiqueta "Unidades" sin control.
  const { toggleDisabled } = useUnitSystem();

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Ajustes"
        aria-label="Ajustes"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        <span className="hidden lg:inline">Ajustes</span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Ajustes"
          className="absolute right-0 top-full mt-1.5 w-56 rounded-md border border-border-main bg-bg-surface z-50 overflow-hidden"
          style={{ boxShadow: '0 12px 30px -12px rgba(0,0,0,0.45)' }}
        >
          {!toggleDisabled && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-sub text-[12.5px] text-text-primary">
              <span>Unidades</span>
              <UnitSystemToggle />
            </div>
          )}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-sub text-[12.5px] text-text-primary">
            <span>Tema</span>
            <ThemeToggle />
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCopyLink();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <Link2 size={14} className="text-text-secondary" aria-hidden="true" />
            Copiar enlace
          </button>
        </div>
      )}
    </div>
  );
}
