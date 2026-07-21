// FEM 2D — geometría (en píxeles) de los glifos de carga.
//
// UNA sola fuente para dónde caen las flechas, la banda y la etiqueta de valor
// de cada carga: canvasGlyphs DIBUJA a partir de ella y hitTest CLICA contra
// ella. Antes cada uno rehacía la misma cuenta por su lado ("mirrors
// canvasGlyphs exactly") y era cuestión de tiempo que divergieran.
//
// Puro: sin React, sin DOM — testeable directamente.

import { formatQuantity } from '../../lib/units/format';
import type { UnitSystem } from '../../lib/units/types';
import { POINT_ARROW_LEN, POINT_STACK_GAP, UDL_BAND_PX, loadMagnitude } from './canvasTheme';
import type { Fem2DLoad, Fem2DModel, Fem2DNode } from './types';

export interface PtPx {
  x: number;
  y: number;
}

interface GeomCommon {
  /** Ancla de la etiqueta de valor (línea base del texto, anclado al centro). */
  label: PtPx;
  /** Texto EXACTO que se pinta (misma llamada a formatQuantity que el glifo). */
  text: string;
}

/** Carga puntual (en nudo o sobre barra): una flecha tail → head. */
export interface LoadArrowGeom extends GeomCommon {
  kind: 'arrow';
  tail: PtPx;
  head: PtPx;
}

/** Carga distribuida: banda entre el raíl de cola y la línea de puntas. */
export interface LoadBandGeom extends GeomCommon {
  kind: 'band';
  /** Raíl de cola (origen de las flechas) en los dos extremos del tramo. */
  tail0: PtPx;
  tail1: PtPx;
  /** Línea de puntas (donde acaban las flechas) en los mismos dos extremos.
   *  Para la capa 0 coincide con el eje de la barra; para la capa k, con el
   *  raíl de cola de la capa k−1 — así cada capa apunta contra la anterior. */
  tip0: PtPx;
  tip1: PtPx;
}

export type LoadGeom = LoadArrowGeom | LoadBandGeom;

export interface LoadGeometryInput {
  load: Fem2DLoad;
  model: Fem2DModel;
  sx: (x: number) => number;
  sy: (y: number) => number;
  system: UnitSystem;
  /** Capa dentro de las cargas que comparten destino (computeLoadStacks). */
  stackIndex: number;
  /** Cuántas capas hay en ese destino (computeLoadStackCounts). Por defecto 1. */
  stackTotal?: number;
  /** Índice de nudos ya construido (evita rehacerlo por carga). */
  nodeById?: Map<string, Fem2DNode>;
}

/** Dirección de mundo (unitaria) → dirección de pantalla (invierte y). */
function toScreenDir(wx: number, wy: number): { dx: number; dy: number } | null {
  const mag = Math.hypot(wx, wy);
  if (mag < 1e-9) return null;
  return { dx: wx / mag, dy: -wy / mag };
}

/**
 * Geometría del glifo de una carga, o null cuando NO se dibuja nada: carga de
 * magnitud cero, o barra/nudo destino inexistente. Una carga que no se pinta
 * tampoco debe capturar clics.
 */
export function loadGeometry(input: LoadGeometryInput): LoadGeom | null {
  const { load, model, sx, sy, system, stackIndex, stackTotal = 1 } = input;
  const nodeById = input.nodeById ?? new Map(model.nodes.map((n) => [n.id, n]));

  if (load.kind === 'node') {
    const n = nodeById.get(load.node);
    const dir = toScreenDir(load.Fx, load.Fy);
    if (!n || !dir) return null;
    return arrowGeom(sx(n.x), sy(n.y), dir, Math.hypot(load.Fx, load.Fy), stackIndex, system);
  }

  const m = model.members.find((mm) => mm.id === load.member);
  if (!m) return null;
  const a = nodeById.get(m.i);
  const b = nodeById.get(m.j);
  if (!a || !b) return null;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ex = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };     // dirección de la barra
  const ey = { x: -ex.y, y: ex.x };                          // +y local

  // Componentes de la carga en ejes de mundo ('local' → mundo vía ex/ey).
  const worldVec = (cx: number, cy: number, frame: 'global' | 'local') =>
    frame === 'global' ? { x: cx, y: cy } : { x: cx * ex.x + cy * ey.x, y: cx * ex.y + cy * ey.y };

  if (load.kind === 'point-member') {
    const w = worldVec(load.Fx, load.Fy, load.frame);
    const dir = toScreenDir(w.x, w.y);
    if (!dir) return null;
    const px = a.x + ex.x * L * load.pos;
    const py = a.y + ex.y * L * load.pos;
    return arrowGeom(sx(px), sy(py), dir, Math.hypot(w.x, w.y), stackIndex, system);
  }

  // ── UDL: banda de flechas paralela a la barra ──────────────────────────────
  const w = worldVec(load.wx, load.wy, load.frame);
  const dir = toScreenDir(w.x, w.y);
  if (!dir) return null;
  const from = load.from ?? 0;
  const to = load.to ?? 1;
  const band = UDL_BAND_PX;
  const tipOff = stackIndex * band;          // puntas: separación desde la barra
  const topOff = tipOff + band;              // colas: una banda más afuera
  const p0m = { x: sx(a.x + ex.x * L * from), y: sy(a.y + ex.y * L * from) };
  const p1m = { x: sx(a.x + ex.x * L * to), y: sy(a.y + ex.y * L * to) };
  const push = (p: PtPx, off: number): PtPx => ({ x: p.x - dir.dx * off, y: p.y - dir.dy * off });

  const midX = (p0m.x + p1m.x) / 2;
  const midY = (p0m.y + p1m.y) / 2;
  // La etiqueta se aparta de TODA la pila de bandas (no solo de su capa): con
  // g + q sobre un mismo dintel, el "15 kN/m" de g caía dentro de las flechas
  // de q. El ·15 separa los dos números entre sí. Una única carga (total 1)
  // mantiene los 24 px de siempre.
  const labelOff = stackTotal * band + 8 + stackIndex * 15;
  // En una barra muy inclinada (un pilar) la etiqueta perpendicular aterriza
  // justo donde va el "3.20 m" de la cadena de cotas en Y: ambas abrazan el
  // punto medio por fuera. Se corre una quinta parte hacia j para librarla.
  const segDx = p1m.x - p0m.x;
  const segDy = p1m.y - p0m.y;
  const segLen = Math.hypot(segDx, segDy) || 1;
  const steep = Math.abs(segDy) > Math.abs(segDx);
  const along = steep ? Math.min(30, segLen * 0.22) : 0;

  return {
    kind: 'band',
    tip0: push(p0m, tipOff),
    tip1: push(p1m, tipOff),
    tail0: push(p0m, topOff),
    tail1: push(p1m, topOff),
    label: {
      x: midX - dir.dx * labelOff + (segDx / segLen) * along,
      y: midY - dir.dy * labelOff + (segDy / segLen) * along - 2,
    },
    text: formatQuantity(loadMagnitude(load), 'linearLoad', system),
  };
}

/** Flecha puntual: la punta se clava en el destino y la cola se aleja por capas. */
function arrowGeom(
  hx: number,
  hy: number,
  dir: { dx: number; dy: number },
  mag: number,
  stackIndex: number,
  system: UnitSystem,
): LoadArrowGeom {
  const stackOff = stackIndex * (POINT_ARROW_LEN + POINT_STACK_GAP);
  const tail = {
    x: hx - dir.dx * (POINT_ARROW_LEN + stackOff),
    y: hy - dir.dy * (POINT_ARROW_LEN + stackOff),
  };
  return {
    kind: 'arrow',
    tail,
    head: { x: hx, y: hy },
    label: { x: tail.x - dir.dx * 4, y: tail.y - dir.dy * 4 - 2 },
    text: formatQuantity(mag, 'force', system),
  };
}

// ── Caja de la etiqueta (para clicar el texto) ───────────────────────────────
//
// ValueLabel pinta 9 px monoespaciados anclados al CENTRO, con la línea base en
// label.y. La caja se estima por número de caracteres (≈5.4 px/carácter), como
// ya hace el reparto de etiquetas del DiagramLayer. Es una aproximación: cerca
// del borde del lienzo ValueLabel voltea el anclaje y la caja real se desplaza
// media anchura — irrelevante para clicar, y nunca al revés (la caja no crece).

/** Centro de la caja del texto a partir del ancla de línea base. */
export function labelBoxCenter(label: PtPx): PtPx {
  return { x: label.x, y: label.y - 3.5 };
}

/** Semiejes de la caja del texto (px). */
export function labelHalfBox(text: string): { hw: number; hh: number } {
  return { hw: 4 + text.length * 2.9, hh: 8 };
}

/** ¿El punto (px, py) cae dentro de la etiqueta de este glifo? */
export function hitsLoadLabel(geom: LoadGeom, px: number, py: number): boolean {
  const c = labelBoxCenter(geom.label);
  const { hw, hh } = labelHalfBox(geom.text);
  return Math.abs(px - c.x) <= hw && Math.abs(py - c.y) <= hh;
}
