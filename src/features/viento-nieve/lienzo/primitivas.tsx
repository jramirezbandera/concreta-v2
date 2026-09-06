/**
 * Lo que este módulo añade a las primitivas comunes de los lienzos
 * (`components/canvas/primitivas.tsx`): la planta pequeña que sitúa la
 * dirección del viento, que habla de «según X» y «según Y» y por eso no es de
 * nadie más.
 *
 * Re-exporta las genéricas para que los cuatro dibujos del módulo sigan
 * pidiéndoselas a un solo sitio.
 */

import type { KeyboardEvent } from 'react';
import { Flecha, Rotulo } from '../../../components/canvas/primitivas';
import { COLOR, dec } from './paleta';
import type { Punta } from '../../../components/canvas/Marcadores';

export { Rotulo, Cabecera, Flecha, CotaH, CotaV, Suelo } from '../../../components/canvas/primitivas';

interface LocalizadorProps {
  x: number;
  y: number;
  dimensiones: { x: number; y: number };
  /** Eje de la cumbrera, si hay cubierta a dos aguas. */
  cumbrera: 'x' | 'y' | null;
  direccion: 'x' | 'y';
  punta: (p: Punta) => string;
  /** Si se pasa, las flechas de cada dirección son botones. */
  onDireccion?: (d: 'x' | 'y') => void;
  /** Rótulo de cada dirección («según Y · 215,8 kN»). */
  rotulos?: { x: string; y: string };
  /** Píxeles por metro del dibujito; con 20 × 12 m y 9 px/m salen 180 × 108 px. */
  escala?: number;
}

/**
 * La planta del edificio en pequeño, con las flechas del viento según X (por
 * la izquierda) y según Y (por arriba). La dirección activa va en acento; la
 * otra, atenuada. Con `onDireccion`, cada juego de flechas es un botón: es la
 * copia en el dibujo de los botones del pie del lienzo, no la única forma de
 * cambiar de dirección.
 */
export function PlantaLocalizador({ x, y, dimensiones, cumbrera, direccion, punta, onDireccion, rotulos, escala = 9 }: LocalizadorProps) {
  const w = Math.max(1, dimensiones.x) * escala;
  const h = Math.max(1, dimensiones.y) * escala;
  const activo = (d: 'x' | 'y') => d === direccion;
  const color = (d: 'x' | 'y') => (activo(d) ? COLOR.accent : COLOR.atenuado);
  const teclado = (d: 'x' | 'y') => (ev: KeyboardEvent<SVGGElement>) => {
    if (!onDireccion) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onDireccion(d);
    }
  };
  const boton = (d: 'x' | 'y') =>
    onDireccion
      ? { role: 'button' as const, tabIndex: 0, 'aria-label': `Viento según ${d.toUpperCase()}`, 'aria-pressed': activo(d), onClick: () => onDireccion(d), onKeyDown: teclado(d), style: { cursor: 'pointer' } }
      : {};

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={COLOR.fondo} stroke={COLOR.seccion} strokeWidth={1.25} />
      {cumbrera === 'x' && <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={COLOR.cota} strokeWidth={1} strokeDasharray="4 3" />}
      {cumbrera === 'y' && <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={COLOR.cota} strokeWidth={1} strokeDasharray="4 3" />}
      <Rotulo x={x + w / 2} y={y + h - 5} tam={9.5} color={COLOR.atenuado} mono ancla="middle">
        {dec(dimensiones.x, 0)} × {dec(dimensiones.y, 0)} m
      </Rotulo>
      <g {...boton('y')}>
        {[0.25, 0.5, 0.75].map((k) => (
          <Flecha key={k} x1={x + w * k} y1={y - 26} x2={x + w * k} y2={y - 4} punta={punta(activo('y') ? 'accent' : 'atenuado')} color={color('y')} grosor={activo('y') ? 2 : 1.25} />
        ))}
        {rotulos && (
          <Rotulo x={x + w + 10} y={y - 12} tam={11} color={color('y')} mono peso={activo('y') ? 600 : 400}>
            {rotulos.y}
          </Rotulo>
        )}
      </g>
      <g {...boton('x')}>
        {[0.25, 0.5, 0.75].map((k) => (
          <Flecha key={k} x1={x - 30} y1={y + h * k} x2={x - 6} y2={y + h * k} punta={punta(activo('x') ? 'accent' : 'atenuado')} color={color('x')} grosor={activo('x') ? 2 : 1.25} />
        ))}
        {rotulos && (
          <Rotulo x={x - 30} y={y + h + 18} tam={11} color={color('x')} mono peso={activo('x') ? 600 : 400}>
            {rotulos.x}
          </Rotulo>
        )}
      </g>
    </g>
  );
}
