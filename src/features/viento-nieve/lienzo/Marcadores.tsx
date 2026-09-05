/**
 * Puntas de flecha y patrones (tierra, nieve) de un lienzo, con el id que le
 * da `useMarcadores`. En la página pueden convivir varios SVG y un
 * `url(#flecha)` compartido pintaría la punta del vecino: por eso cada lienzo
 * declara los suyos.
 */

import { COLOR, mezcla } from './paleta';

export type Punta = 'accent' | 'presion' | 'cota' | 'fallo' | 'atenuado';

const COLOR_PUNTA: Record<Punta, string> = {
  accent: COLOR.accent,
  presion: COLOR.presion,
  cota: COLOR.cota,
  fallo: COLOR.fallo,
  atenuado: COLOR.atenuado,
};

export function Marcadores({ id }: { id: string }) {
  return (
    <defs>
      {(Object.keys(COLOR_PUNTA) as Punta[]).map((p) => (
        <marker key={p} id={`${id}-${p}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={COLOR_PUNTA[p]} />
        </marker>
      ))}
      <pattern id={`${id}-suelo`} width="8" height="8" patternUnits="userSpaceOnUse">
        <line x1="0" y1="8" x2="8" y2="0" stroke={COLOR.cota} strokeWidth="1" />
      </pattern>
      <pattern id={`${id}-nieve`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill={mezcla(COLOR.accent, 10)} />
        <line x1="0" y1="0" x2="0" y2="6" stroke={mezcla(COLOR.accent, 55)} strokeWidth="1.2" />
      </pattern>
    </defs>
  );
}
