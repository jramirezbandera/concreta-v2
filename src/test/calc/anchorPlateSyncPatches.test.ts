// shearPatch / edgeAxisPatch — escritura coherente del par legacy+direccional
// (VEd↔Vx/Vy, pedestal_cX/cY↔cX1..cY2). Saneamiento pre-IA 2026-07-13: antes
// la sincronización vivía duplicada en handlers de AnchorPlateInputs y una
// edición direccional que volvía a la simetría dejaba el legacy obsoleto
// (resolveEdges lo leía y el motor usaba el borde antiguo).
// Run: bun test src/test/calc/anchorPlateSyncPatches.test.ts

import { describe, expect, it } from 'vitest';
import { calcAnchorPlate, edgeAxisPatch, pedestalAxisPatch, shearPatch, validateAnchorPlate } from '../../lib/calculations/anchorPlate';
import { anchorPlateDefaults, type AnchorPlateInputs } from '../../data/defaults';

describe('shearPatch', () => {
  it('Vy=0 (caso escalar): VEd = Vx — exactamente lo que resolveShear lee como legacy', () => {
    expect(shearPatch(50, 0)).toEqual({ Vx: 50, Vy: 0, VEd: 50 });
  });

  it('Vy≠0 (direccional): VEd guarda la magnitud √(Vx²+Vy²)', () => {
    expect(shearPatch(30, 40)).toEqual({ Vx: 30, Vy: 40, VEd: 50 });
  });

  it('cortante nulo → todo a cero', () => {
    expect(shearPatch(0, 0)).toEqual({ Vx: 0, Vy: 0, VEd: 0 });
  });
});

describe('edgeAxisPatch', () => {
  it('simétrico: el legacy queda EXACTAMENTE en el valor del par (resolveEdges lo leerá)', () => {
    expect(edgeAxisPatch('x', 250, 250)).toEqual({ pedestal_cX1: 250, pedestal_cX2: 250, pedestal_cX: 250 });
    expect(edgeAxisPatch('y', 180, 180)).toEqual({ pedestal_cY1: 180, pedestal_cY2: 180, pedestal_cY: 180 });
  });

  it('asimétrico: el legacy queda en min(c1,c2) — eco conservador, resolveEdges lo ignora', () => {
    expect(edgeAxisPatch('x', 300, 150)).toEqual({ pedestal_cX1: 300, pedestal_cX2: 150, pedestal_cX: 150 });
    expect(edgeAxisPatch('y', 120, 400)).toEqual({ pedestal_cY1: 120, pedestal_cY2: 400, pedestal_cY: 120 });
  });
});

describe('regresión: volver a la simetría vía patch no resucita el legacy obsoleto', () => {
  // Escenario del bug: defaults con cX=cX1=cX2=200; el usuario abre el toggle
  // direccional, pone cX1=250/cX2=250 (vuelve a ser simétrico en otro valor).
  // Pre-saneamiento (setField suelto) pedestal_cX se quedaba en 200 y
  // resolveEdges — que con par simétrico prefiere el legacy — calculaba con
  // el borde antiguo.
  const viaPatch: AnchorPlateInputs = { ...anchorPlateDefaults, ...edgeAxisPatch('x', 250, 250) };
  const clean: AnchorPlateInputs = {
    ...anchorPlateDefaults, pedestal_cX: 250, pedestal_cX1: 250, pedestal_cX2: 250,
  };
  const stale: AnchorPlateInputs = {
    ...anchorPlateDefaults, pedestal_cX1: 250, pedestal_cX2: 250, // legacy se queda en 200
  };

  it('estado construido con el patch ≡ estado limpio con cX=250 en las tres claves', () => {
    expect(viaPatch.pedestal_cX).toBe(250);
    expect(calcAnchorPlate(viaPatch)).toEqual(calcAnchorPlate(clean));
  });

  it('el estado stale (pre-saneamiento) calculaba con el borde antiguo (200), no con 250', () => {
    // Documenta el comportamiento del motor que motiva el patch: con par
    // simétrico resolveEdges prefiere el legacy. El patch hace inalcanzable
    // este estado desde la UI y el asistente IA.
    const rStale = calcAnchorPlate(stale);
    const rLegacy200 = calcAnchorPlate({ ...anchorPlateDefaults });
    expect(rStale.checks).toEqual(rLegacy200.checks);
  });
});

// ─── El macizo, medido dos veces (2026-09-25) ────────────────────────────
// c (barra exterior → cara) y m (placa → cara) describen la misma cara: con
// la placa centrada c = e + m; descentrada, min(c1, c2) = e + m. El pilar 1
// del usuario tenía e = 100, m = 150 y c = 200, y nada lo avisaba.

const PED: AnchorPlateInputs = {
  ...anchorPlateDefaults,
  bar_edge_x: 100, plate_margin_x: 150,
  ...edgeAxisPatch('x', 250, 250),
};

describe('pedestalAxisPatch', () => {
  it('editar c deja las barras quietas y mueve el vuelo: m = c − e', () => {
    expect(pedestalAxisPatch('x', PED, { c1: 300, c2: 300 })).toEqual({
      pedestal_cX1: 300, pedestal_cX2: 300, pedestal_cX: 300, bar_edge_x: 100, plate_margin_x: 200,
    });
  });

  it('editar m mueve las caras del macizo: c = e + m', () => {
    expect(pedestalAxisPatch('x', PED, { m: 100 })).toEqual({
      pedestal_cX1: 200, pedestal_cX2: 200, pedestal_cX: 200, bar_edge_x: 100, plate_margin_x: 100,
    });
  });

  it('editar e mueve las barras dentro de un macizo fijo: c sigue a e', () => {
    expect(pedestalAxisPatch('x', PED, { e: 50 })).toEqual({
      pedestal_cX1: 200, pedestal_cX2: 200, pedestal_cX: 200, bar_edge_x: 50, plate_margin_x: 150,
    });
  });

  it('eje y: los mismos campos con su nombre', () => {
    const inp = { ...anchorPlateDefaults, bar_edge_y: 40, plate_margin_y: 150, ...edgeAxisPatch('y', 190, 190) };
    expect(pedestalAxisPatch('y', inp, { m: 200 })).toEqual({
      pedestal_cY1: 240, pedestal_cY2: 240, pedestal_cY: 240, bar_edge_y: 40, plate_margin_y: 200,
    });
  });

  it('placa descentrada: m y e desplazan las dos caras y conservan la asimetría', () => {
    const asim = { ...PED, bar_edge_x: 40, plate_margin_x: 110, ...edgeAxisPatch('x', 300, 150) };
    expect(pedestalAxisPatch('x', asim, { m: 160 })).toMatchObject({ pedestal_cX1: 350, pedestal_cX2: 200, plate_margin_x: 160 });
    // editar una cara recalcula el vuelo con la más cercana
    expect(pedestalAxisPatch('x', asim, { c2: 120 })).toMatchObject({ pedestal_cX1: 300, pedestal_cX2: 120, plate_margin_x: 80 });
  });

  it('el vuelo nunca es negativo (cara del macizo por dentro de la placa)', () => {
    expect(pedestalAxisPatch('x', PED, { c1: 80, c2: 80 })).toMatchObject({ plate_margin_x: 0 });
  });

  it('el estado incoherente del pilar 1 queda coherente con cualquier edición', () => {
    const pilar1 = { ...PED, ...edgeAxisPatch('x', 200, 200) };   // e + m = 250 ≠ 200
    expect(validateAnchorPlate(pilar1).some((w) => w.field === 'pedestal_cX')).toBe(true);
    for (const cambio of [{ e: 60 }, { m: 120 }, { c1: 260, c2: 260 }]) {
      const tras = { ...pilar1, ...pedestalAxisPatch('x', pilar1, cambio) };
      expect(validateAnchorPlate(tras).some((w) => w.field === 'pedestal_cX')).toBe(false);
    }
  });
});

describe('validateAnchorPlate — el macizo tiene que cuadrar', () => {
  it('pilar 1 (e = 100, m = 150, c = 200): aviso con las tres cifras, no fallo', () => {
    const w = validateAnchorPlate({ ...PED, ...edgeAxisPatch('x', 200, 200) }).find((x) => x.field === 'pedestal_cX')!;
    expect(w.severity).toBe('warn');
    expect(w.message).toContain('100 + 150 = 250');
    expect(w.message).toContain('cX = 200');
  });

  it('coherente (simétrico o descentrado con la cara cercana a e + m): sin aviso', () => {
    expect(validateAnchorPlate(PED).some((w) => w.field === 'pedestal_cX')).toBe(false);
    const asim = { ...PED, ...edgeAxisPatch('x', 600, 250) };
    expect(validateAnchorPlate(asim).some((w) => w.field === 'pedestal_cX')).toBe(false);
  });

  it('los defaults cuadran en los dos ejes (40 + 150 = 190)', () => {
    expect(validateAnchorPlate(anchorPlateDefaults).filter((w) => /macizo/.test(w.message))).toEqual([]);
  });
});
