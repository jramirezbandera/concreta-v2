import { useState, useId, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /**
   * Optional normative reference shown right-aligned next to the section
   * label (e.g. "DB-SE-F §5.2"). Used by modules that document the article
   * backing each input block.
   */
  refNorma?: string;
  /**
   * Resumen de una línea que se enseña bajo la cabecera SOLO cuando la sección
   * está cerrada («Burgos · eólica B · 860 m»): el usuario ve lo que hay dentro
   * sin abrirla. Lo estrena Viento y nieve; los módulos que no lo pasan no
   * cambian.
   */
  summary?: ReactNode;
}

export function CollapsibleSection({ label, children, defaultOpen = true, refNorma, summary }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled pt-2.25 pb-1.75 max-md:min-h-11 max-md:py-3 border-b border-border-sub mb-2.5 mt-3 first:mt-0 cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="transition-transform duration-150"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            aria-hidden="true"
          >
            <path d="M3 4l2 2 2-2" />
          </svg>
          {label}
        </span>
        {refNorma && <span className="font-mono normal-case tracking-normal text-text-disabled">{refNorma}</span>}
      </button>
      {open && <div id={contentId} className="animate-[fadeIn_150ms_ease-out]">{children}</div>}
      {!open && summary && <p className="-mt-1 mb-1 font-mono text-[10.5px] leading-snug text-text-secondary">{summary}</p>}
    </div>
  );
}
