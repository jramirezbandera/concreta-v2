/**
 * Un número con su rótulo encima, que es lo que cabe en la columna de datos.
 *
 * Nació dentro de `TiempoEquivalente.tsx` y se sacó aquí al llegar los
 * elementos de los anejos C y D, que teclean quince números por ficha. El borde
 * rojo de `requerido` es el mismo hueco que pinta el resto del módulo: sin ese
 * dato la tabla no dice nada y no se inventa un número.
 */

import { INPUT } from './estilos';

const NUM = `${INPUT} max-w-[74px]`;

export function Campo({
  rotulo,
  unidad,
  valor,
  aria,
  paso = '0.1',
  requerido = false,
  simbolo = false,
  ancho,
  onCambiar,
}: {
  rotulo: string;
  unidad: string;
  valor: number | null;
  aria: string;
  paso?: string;
  requerido?: boolean;
  /**
   * El rótulo es un símbolo y va tal cual, sin versalitas: «μfi» en mayúsculas
   * sale «MFI», que ya no es el mismo símbolo, y «as» sale «AS».
   */
  simbolo?: boolean;
  /** Clase de ancho, para los campos que no caben en los 74 px de serie. */
  ancho?: string;
  onCambiar: (v: number | null) => void;
}) {
  const falta = requerido && (valor === null || valor <= 0);
  return (
    <label className="flex flex-col gap-0.5">
      <span className={`text-[10px] text-text-disabled ${simbolo ? '' : 'uppercase'}`}>
        {rotulo} <span className="normal-case">{unidad}</span>
      </span>
      <input
        type="number"
        step={paso}
        min="0"
        value={valor ?? ''}
        aria-label={aria}
        className={ancho ? `${INPUT} ${ancho}` : NUM}
        style={falta ? { borderColor: 'var(--color-state-fail)' } : undefined}
        onChange={(e) => onCambiar(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  );
}
