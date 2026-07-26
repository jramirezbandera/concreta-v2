// Bloque de «esto no se puede calcular» para un panel de resultados.
//
// Ocupa el panel entero con el ambiente de fallo (degradado + filete rojo
// arriba, el mismo `ambientStyle('fail')` que visten los veredictos): un
// modelo irresoluble no es una comprobación que falla, es la ausencia de
// comprobaciones, y tiene que leerse distinto de un INCUMPLE.

import type { JSX } from 'react';
import { TriangleAlert } from 'lucide-react';
import { ambientStyle } from '../checks';

interface Props {
  /** Titular corto en mayúsculas ("Modelo no resoluble"). */
  title: string;
  /** Causa principal, en prosa. */
  message?: string;
  /** Causas adicionales; se listan debajo. */
  details?: string[];
  /** Qué hacer para salir del estado. */
  hint?: string;
}

export function ErrorAmbient({ title, message, details = [], hint }: Props): JSX.Element {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6" style={ambientStyle('fail')}>
      <div className="flex flex-col items-start gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-state-fail">
          <TriangleAlert size={12} aria-hidden="true" />
          {title}
        </p>
        {message && <p className="text-[12px] leading-relaxed text-text-primary">{message}</p>}
        {details.length > 0 && (
          <ul className="list-disc pl-4.5 text-[11px] leading-snug text-text-secondary flex flex-col gap-1">
            {details.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        {hint && <p className="mt-2 text-[11px] italic leading-snug text-text-disabled">{hint}</p>}
      </div>
    </div>
  );
}
