/**
 * Primitivas de dibujo compartidas por los cuatro lienzos de Viento y nieve:
 * flechas, cotas, suelo, rótulos y la planta pequeña que sitúa la dirección
 * del viento. Las puntas de flecha y los patrones vienen de `useMarcadores`;
 * los colores, de `paleta.ts` (variables del tema).
 */

import type { KeyboardEvent, ReactNode } from 'react';
import { COLOR, dec, FUENTE_MONO, FUENTE_SANS } from './paleta';
import type { Punta } from './Marcadores';

interface RotuloProps {
  x: number;
  y: number;
  children: ReactNode;
  tam?: number;
  color?: string;
  mono?: boolean;
  peso?: 400 | 500 | 600;
  ancla?: 'start' | 'middle' | 'end';
}

/** Texto del dibujo: sans por defecto, mono para los números. */
export function Rotulo({ x, y, children, tam = 11, color = COLOR.secundario, mono = false, peso = 400, ancla = 'start' }: RotuloProps) {
  return (
    <text x={x} y={y} fontSize={tam} fill={color} fontWeight={peso} textAnchor={ancla} style={{ fontFamily: mono ? FUENTE_MONO : FUENTE_SANS }}>
      {children}
    </text>
  );
}

/** Cabecera de un bloque del dibujo: mayúsculas pequeñas, como los section headers de la app. */
export function Cabecera({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <text x={x} y={y} fontSize={10} fill={COLOR.atenuado} fontWeight={600} letterSpacing="0.08em" style={{ fontFamily: FUENTE_SANS, textTransform: 'uppercase' as const }}>
      {children}
    </text>
  );
}

interface FlechaProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  punta: string;
  color?: string;
  grosor?: number;
  discontinua?: boolean;
}

/** Segmento con punta en el extremo (x2, y2). */
export function Flecha({ x1, y1, x2, y2, punta, color = COLOR.accent, grosor = 1.5, discontinua = false }: FlechaProps) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={grosor} markerEnd={punta} strokeDasharray={discontinua ? '4 3' : undefined} />;
}

/** Cota horizontal entre x1 y x2, con el texto encima. */
export function CotaH({ x1, x2, y, texto, color = COLOR.cota }: { x1: number; x2: number; y: number; texto: string; color?: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={1} />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke={color} strokeWidth={1} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke={color} strokeWidth={1} />
      <Rotulo x={(x1 + x2) / 2} y={y - 5} tam={10} color={COLOR.cotaTexto} mono ancla="middle">
        {texto}
      </Rotulo>
    </g>
  );
}

/** Cota vertical entre y1 e y2, con el texto a un lado. */
export function CotaV({ x, y1, y2, texto, lado = 'derecha', color = COLOR.cota }: { x: number; y1: number; y2: number; texto: string; lado?: 'derecha' | 'izquierda'; color?: string }) {
  const derecha = lado === 'derecha';
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={1} />
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} stroke={color} strokeWidth={1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} stroke={color} strokeWidth={1} />
      <Rotulo x={derecha ? x + 6 : x - 6} y={(y1 + y2) / 2 + 3} tam={10} color={COLOR.cotaTexto} mono ancla={derecha ? 'start' : 'end'}>
        {texto}
      </Rotulo>
    </g>
  );
}

/** Línea de rasante con el rayado de tierra debajo. */
export function Suelo({ x1, x2, y, patron }: { x1: number; x2: number; y: number; patron: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={COLOR.seccion} strokeWidth={1.25} />
      <rect x={x1} y={y} width={x2 - x1} height={7} fill={patron} />
    </g>
  );
}

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
