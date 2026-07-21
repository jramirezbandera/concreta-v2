// FEM 2D — límites DIBUJABLES del lienzo (px de pantalla, sin cámara).
//
// El encuadre (pan) se acota contra esto, no contra el bbox de nudos: lo que el
// usuario reconoce como "el dibujo" incluye las flechas de carga, sus etiquetas
// de valor, los glifos de apoyo, las bandas N/V/M con sus rótulos y las cadenas
// de cotas. Acotar sólo por nudos dejaría anotaciones periféricas fuera del
// alcance del encuadre.
//
// Se calcula la UNIÓN de las 5 vistas (modelo ∪ N ∪ V ∪ M ∪ δ) UNA vez por
// modelo: un rectángulo estable. Si cada vista acotara con los suyos, entrar en
// M recortaría tx/ty y al volver a Modelo el encuadre habría "saltado" — el
// usuario percibiría que la app se mueve sola.
//
// Vive aquí y no en transform.ts a propósito: necesita mirar cargas y tema, y
// transform.ts es la pieza pura compartida con el PDF (ver su cabecera).
//
//   ┌─ bbox de nudos (px) ─┐
//   │  + extensión real de cada glifo de carga (loadGeometry, la MISMA fuente
//   │    que dibuja canvasGlyphs y contra la que clica hitTest)
//   │  + banda de diagrama + rótulo, arriba y abajo (ampFor + LABEL_PAD)
//   │  + apoyos bajo los nudos, cadenas de cotas a izquierda y abajo
//   └─ = rectángulo navegable
//
// Puro: sin React, sin DOM.

import type { UnitSystem } from '../../lib/units/types';
import {
  DIAGRAM_LABEL_PAD,
  ampFor,
  computeLoadStackCounts,
  computeLoadStacks,
  fitMarginFor,
} from './canvasTheme';
import { labelHalfBox, loadGeometry, type PtPx } from './loadGeometry';
import { makeTransform, uniformInsets, type BoundsRect, type Transform2D } from './transform';
import type { Fem2DModel } from './types';

/** Glifo de apoyo bajo el nudo (triángulo + rayado + posibles rodillos). */
const SUPPORT_EXTENT_PX = 26;
/** Cadena de cotas X: eje bajo el nudo más bajo + marcas y chip de valor. */
const COTA_X_EXTENT_PX = 64;
/** Cadena de cotas Y: eje a la izquierda del nudo más a la izquierda. */
const COTA_Y_EXTENT_PX = 78;
/** Aire mínimo alrededor de todo (nunca pegar el dibujo al borde). */
const EDGE_PAD_PX = 8;

const growPoint = (b: BoundsRect, p: PtPx): void => {
  if (p.x < b.minX) b.minX = p.x;
  if (p.x > b.maxX) b.maxX = p.x;
  if (p.y < b.minY) b.minY = p.y;
  if (p.y > b.maxY) b.maxY = p.y;
};

const growBox = (b: BoundsRect, cx: number, cy: number, hw: number, hh: number): void => {
  growPoint(b, { x: cx - hw, y: cy - hh });
  growPoint(b, { x: cx + hw, y: cy + hh });
};

export interface DrawableBoundsInput {
  model: Fem2DModel;
  sx: (x: number) => number;
  sy: (y: number) => number;
  /** Viewport en px — fija la amplitud de banda de diagrama (ampFor). */
  width: number;
  height: number;
  system: UnitSystem;
}

/**
 * Rectángulo navegable en px del transform SIN cámara: la unión de lo que
 * cualquiera de las 5 vistas puede llegar a pintar para este modelo.
 */
export function getDrawableBounds(input: DrawableBoundsInput): BoundsRect {
  const { model, sx, sy, width, height, system } = input;

  const bounds: BoundsRect = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  // ── Nudos ────────────────────────────────────────────────────────────────
  for (const n of model.nodes) growPoint(bounds, { x: sx(n.x), y: sy(n.y) });

  // Modelo vacío: no hay dibujo que acotar. El bbox fantasma de makeTransform
  // (0-10 × 0-3) no es navegable — el llamante fuerza k=1 en ese caso.
  if (!Number.isFinite(bounds.minX)) {
    return { minX: 0, minY: 0, maxX: Math.max(1, width), maxY: Math.max(1, height) };
  }

  // ── Apoyos (bajo el nudo) y cadenas de cotas (izquierda + abajo) ─────────
  if (model.supports.length > 0) bounds.maxY += SUPPORT_EXTENT_PX;
  bounds.maxY += COTA_X_EXTENT_PX;
  bounds.minX -= COTA_Y_EXTENT_PX;

  // ── Cargas: extensión REAL de flechas, bandas y etiquetas ───────────────
  // Misma fuente que dibuja canvasGlyphs y contra la que clica hitTest, así que
  // el rectángulo no puede divergir de lo que se ve.
  const stacks = computeLoadStacks(model);
  const stackCounts = computeLoadStackCounts(model);
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  for (const load of model.loads) {
    const geom = loadGeometry({
      load,
      model,
      sx,
      sy,
      system,
      stackIndex: stacks.get(load.id) ?? 0,
      stackTotal: stackCounts.get(load.id) ?? 1,
      nodeById,
    });
    if (!geom) continue;
    if (geom.kind === 'arrow') {
      growPoint(bounds, geom.tail);
      growPoint(bounds, geom.head);
    } else {
      growPoint(bounds, geom.tail0);
      growPoint(bounds, geom.tail1);
      growPoint(bounds, geom.tip0);
      growPoint(bounds, geom.tip1);
    }
    const half = labelHalfBox(geom.text);
    growBox(bounds, geom.label.x, geom.label.y, half.hw, half.hh);
  }

  // ── Bandas de diagrama N/V/M/δ + sus rótulos ────────────────────────────
  // Se plotean perpendiculares a cada barra, así que en el peor caso alcanzan
  // la amplitud completa en cualquier dirección desde el modelo.
  const diagramReach = ampFor(width, height) + DIAGRAM_LABEL_PAD;
  bounds.minX -= diagramReach;
  bounds.maxX += diagramReach;
  bounds.minY -= diagramReach;
  bounds.maxY += diagramReach;

  return {
    minX: bounds.minX - EDGE_PAD_PX,
    minY: bounds.minY - EDGE_PAD_PX,
    maxX: bounds.maxX + EDGE_PAD_PX,
    maxY: bounds.maxY + EDGE_PAD_PX,
  };
}

/**
 * Transform base (autofit) + límites navegables del lienzo, con el MISMO margen
 * de ajuste que usan los dos lienzos. Un solo sitio donde se decide el encuadre
 * base, así que el módulo (que necesita los límites para los botones de zoom) y
 * los lienzos (que los necesitan para el gesto) no pueden discrepar.
 */
export function canvasBase(
  model: Fem2DModel,
  width: number,
  height: number,
  system: UnitSystem,
): { base: Transform2D; bounds: BoundsRect } {
  const base = makeTransform(model.nodes, width, height, uniformInsets(fitMarginFor(width, height)));
  return {
    base,
    bounds: getDrawableBounds({ model, sx: base.sx, sy: base.sy, width, height, system }),
  };
}
