/**
 * Una sección de la ficha: plegable y CONTROLADA. `CollapsibleSection` decide
 * ella sola si está abierta, y «Siguiente hueco» necesita abrir por código la
 * sección que contiene el campo al que va a saltar; por eso esta es propia del
 * módulo, con el mismo aspecto que la compartida y un chip con los huecos que
 * quedan dentro.
 */

import { useId, type ReactNode } from 'react';
import type { Hueco } from '../../lib/memoria/model';
import { contarHuecos } from '../../lib/memoria/huecos';

interface Props {
  id: string;
  numero?: string;
  titulo: string;
  refNorma?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Los huecos de ESTA sección, para el chip. */
  huecos?: Hueco[];
  /** Lo que se ve cerrada: «No procede: sin acero…», o un resumen. */
  summary?: ReactNode;
  /** Un apartado que no procede se ve, plegado, pero no abre. */
  procede?: boolean;
  /**
   * Da por revisados de una vez los datos de esta sección que vienen de otra
   * obra. Se enseña sólo cuando los hay, y lleva su deshacer: no es
   * obligatorio y no debe parecerlo.
   */
  onRevisar?: () => void;
  children: ReactNode;
}

function Chip({ huecos }: { huecos: Hueco[] }) {
  const c = contarHuecos(huecos);
  if (c.total === 0) return <span className="font-mono text-[10px] normal-case tracking-normal text-accent">al día</span>;
  const partes: string[] = [];
  if (c.faltan > 0) partes.push(`${c.faltan} ${c.faltan === 1 ? 'falta' : 'faltan'}`);
  if (c.heredados > 0) partes.push(`${c.heredados} por confirmar`);
  if (c.revisar > 0) partes.push(`${c.revisar} de otro sitio`);
  return <span className={`font-mono text-[10px] normal-case tracking-normal ${c.faltan > 0 ? 'text-state-fail' : 'text-state-warn'}`}>{partes.join(' · ')}</span>;
}

export function Seccion({ id, numero, titulo, refNorma, open, onOpenChange, huecos, summary, procede = true, onRevisar, children }: Props) {
  const contentId = useId();
  const abierta = procede && open;
  const porRevisar = huecos ? contarHuecos(huecos).heredados : 0;
  return (
    <section id={`seccion-${id}`} aria-label={titulo}>
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={contentId}
        disabled={!procede}
        onClick={() => onOpenChange(!open)}
        className="flex w-full cursor-pointer items-center justify-between border-b border-border-sub pt-2.25 pb-1.75 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled max-md:min-h-11 max-md:py-3 disabled:cursor-default"
      >
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="transition-transform duration-150" style={{ transform: abierta ? 'rotate(0deg)' : 'rotate(-90deg)' }} aria-hidden="true">
            <path d="M3 4l2 2 2-2" />
          </svg>
          {numero ? <span className="font-mono">{numero}</span> : null}
          {titulo}
        </span>
        <span className="flex items-center gap-3">
          {procede && huecos ? <Chip huecos={huecos} /> : null}
          {!procede ? <span className="font-mono text-[10px] normal-case tracking-normal text-text-disabled">no procede</span> : null}
          {refNorma && <span className="font-mono normal-case tracking-normal text-text-disabled">{refNorma}</span>}
        </span>
      </button>
      {abierta && (
        <div id={contentId} className="animate-[fadeIn_150ms_ease-out] py-2.5">
          {onRevisar && porRevisar > 0 && (
            <div className="mb-2.5 flex justify-end">
              <button
                type="button"
                onClick={onRevisar}
                className="rounded border border-border-main px-2.5 py-1 text-[11.5px] text-text-secondary transition-colors hover:text-text-primary"
                title="Vienen de otra obra. Darlos por revisados los deja como suyos; se puede deshacer."
              >
                Marcar como {porRevisar === 1 ? 'revisado' : 'revisados'} {porRevisar === 1 ? 'el dato' : `los ${porRevisar} datos`} de otra obra
              </button>
            </div>
          )}
          {children}
        </div>
      )}
      {!abierta && summary && <p className="mb-1 mt-1 font-mono text-[10.5px] leading-snug text-text-secondary">{summary}</p>}
    </section>
  );
}
