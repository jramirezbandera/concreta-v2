/**
 * Primitivas de dibujo compartidas por los lienzos de la app: rótulos,
 * cabeceras, flechas, cotas y la línea de rasante. Las puntas de flecha y los
 * patrones vienen de `useMarcadores`; los colores, de `paleta.ts` (variables
 * del tema).
 *
 * Lo que sabe de un módulo concreto NO vive aquí: la planta que sitúa la
 * dirección del viento está en `features/viento-nieve/lienzo/primitivas.tsx`.
 */

import type { ReactNode } from 'react';
import { COLOR, FUENTE_MONO, FUENTE_SANS } from './paleta';

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
