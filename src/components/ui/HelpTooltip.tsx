import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/**
 * Tooltip de ayuda por campo. Un icono ⓘ que, al hover o foco, muestra un texto
 * de explicación en un portal a `body` (no se recorta dentro de paneles con
 * scroll). Cierra con Escape, al hacer scroll/resize, y al salir el ratón/foco.
 *
 * Diseño (DESIGN.md): SIN sombra — eleva por superficie + borde (`bg-surface` +
 * `border-main` + `rounded` 4px). Icono `text-secondary` → `accent` en hover,
 * stroke-only, nunca en círculo. Solo-hover/foco; el tap táctil es una mejora
 * posterior (ver TODOS.md).
 *
 *     [ 300 ] mm  ⓘ ← hover/focus
 *                 └── portal a body ──┐
 *                  ┌──────────────────┴───┐
 *                  │ Ancho de la sección.  │
 *                  │ EC3 §6.2.5            │ ← refText (2ª línea, dim)
 *                  └──────────────────────┘
 */
interface HelpTooltipProps {
  /** Texto de ayuda. Vacío/undefined → no renderiza nada (ni el icono). */
  text?: string;
  /** Referencia normativa opcional (2ª línea, atenuada). */
  refText?: string;
  /** Nombre del campo para el aria-label del icono (ej. "Lcr longitud crítica"). */
  fieldLabel?: string;
}

const GAP = 6; // px entre icono y tooltip
const MARGIN = 8; // px mínimos al borde del viewport
const MAX_W = 260; // px

export function HelpTooltip({ text, refText, fieldLabel }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  // `null` mientras no se ha medido — el tooltip se renderiza oculto hasta
  // tener posición, para no parpadear en una esquina antes del flip/clamp.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  // Cierre mientras está abierto: Escape, scroll (capture, para atrapar el
  // scroll del panel que vive por debajo), y resize. El portal vive en `body`,
  // así que sin esto el tooltip quedaría descolgado al hacer scroll.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Medir-luego-posicionar: el texto español envuelve, así que no se puede
  // asumir el alto/ancho. Render oculto → medir → flip vertical + clamp horizontal.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !tipRef.current) return;
    const icon = btnRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();

    let left = icon.left + icon.width / 2 - tip.width / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - tip.width - MARGIN));

    let top = icon.bottom + GAP;
    if (top + tip.height > window.innerHeight - MARGIN) {
      top = icon.top - tip.height - GAP; // flip arriba si no cabe abajo
    }
    setPos({ top: Math.max(MARGIN, top), left });
  }, [open]);

  if (!text) return null;

  const aria = fieldLabel ? `Ayuda: ${fieldLabel}` : 'Ayuda';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={aria}
        aria-describedby={open ? tipId : undefined}
        // Evita que el clic robe el foco / dispare el label asociado al input.
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => {
          setPos(null);
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          setPos(null);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center p-1 -m-1 shrink-0 text-text-secondary hover:text-accent focus:text-accent outline-none focus-visible:text-accent transition-colors cursor-help"
      >
        <Info size={13} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos ? pos.top : 0,
              left: pos ? pos.left : 0,
              maxWidth: MAX_W,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="z-50 bg-bg-surface border border-border-main rounded px-2.5 py-1.5 text-[12px] leading-snug text-text-primary pointer-events-none"
          >
            {text}
            {refText && (
              <span className="block mt-1 text-[11px] font-mono text-text-secondary">
                {refText}
              </span>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
