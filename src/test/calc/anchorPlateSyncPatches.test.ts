// shearPatch / edgeAxisPatch — escritura coherente del par legacy+direccional
// (VEd↔Vx/Vy, pedestal_cX/cY↔cX1..cY2). Saneamiento pre-IA 2026-07-13: antes
// la sincronización vivía duplicada en handlers de AnchorPlateInputs y una
// edición direccional que volvía a la simetría dejaba el legacy obsoleto
// (resolveEdges lo leía y el motor usaba el borde antiguo).
// Run: bun test src/test/calc/anchorPlateSyncPatches.test.ts

import { describe, expect, it } from 'vitest';
import { calcAnchorPlate, edgeAxisPatch, shearPatch } from '../../lib/calculations/anchorPlate';
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
