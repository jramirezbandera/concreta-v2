// FUGA 1 de la auditoría (2026-07-14) — el gate anti-ruido se desarmaba cuando el
// valor REAL del usuario coincidía con el default de fábrica.
//
// Los defaults de Concreta son, por diseño, los valores MÁS COMUNES: un pilar
// existente de 30×30, un muro de un pie (240 mm), ψ₂ = 0.3 de vivienda, β = 1.0
// biarticulado, el NF a 2 m. El gate decidía "está establecido" mirando SOLO
// `current[field] !== defaults[field]`, así que en todos esos casos —los más
// probables— concluía "nadie lo ha tocado" y dejaba pasar la rebaja SIN fila roja
// y sin checkbox de confirmación. Los dos módulos de REHABILITACIÓN, cuya tesis
// entera es "lo medido es un dato", tenían el guardarraíl desarmado en su caso
// más frecuente.
//
// El arreglo añade la segunda vía de "establecido": las claves que el modelo ya
// trató en TURNOS ANTERIORES del hilo (AiChatModal.confirmedKeysRef → buildPlan →
// detectSafetyRisks). Estos tests recorren los adapters REALES por la misma puerta
// que el modal, y cada uno prueba las DOS caras: sin memoria (silencio, como antes)
// y con memoria (riesgo, la fuga cerrada).
//
// La invariante que restaura: si el asistente considera el valor establecido (no lo
// re-pregunta porque ya no está en `sin_confirmar`), rebajarlo ES un riesgo.

import { describe, it, expect } from 'vitest';
import { empresalladoAdapter } from '../../lib/ai/modules/empresillado';
import { masonryWallsAdapter } from '../../lib/ai/modules/masonryWalls';
import { retainingWallAdapter } from '../../lib/ai/modules/retainingWall';
import { steelBeamsAdapter } from '../../lib/ai/modules/steelBeams';
import { empresalladoDefaults, retainingWallDefaults, steelBeamDefaults } from '../../data/defaults';
import { defaultMasonryState } from '../../lib/calculations/masonryWalls';

const SI = 'si' as const;

/** Payload: solo las claves que interesan; el resto de un payload real son null. */
const p = (o: Record<string, unknown>) => ({ ...o, warnings: [] });

describe('empresillado — el pilar EXISTENTE de 30×30 (= el default)', () => {
  // empresalladoDefaults: bc = hc = 30 cm. Es la medida más común de un pilar
  // existente, así que el caso "el usuario tiene justo un 30×30" es el NORMAL.
  const current = { ...empresalladoDefaults };
  const engordar = p({ bc_cm: 40, hc_cm: 40 });

  it('sin memoria del hilo: el pilar se engorda a 40×40 sin una sola fila roja', () => {
    // Comportamiento DELIBERADO en la primera extracción: el usuario está
    // aportando la medida de su pilar, no debilitando un dato establecido.
    const plan = empresalladoAdapter.buildPlan(engordar, current, SI);
    expect(plan.fields.bc).toBe(40);
    expect(plan.fields.hc).toBe(40);
    expect(plan.risks).toEqual([]);
  });

  it('con bc/hc ya tratados en el hilo: DOS riesgos (la fuga, cerrada)', () => {
    // Turno 1: "pilar existente de 30×30" → el modelo lo propone (y queda en
    // `confirmed`). Turno 2: "haz que cumpla" → lo engorda a 40×40. AQUÍ es donde
    // antes se colaba: mismo cambio, mismo estado, cero riesgos.
    const plan = empresalladoAdapter.buildPlan(
      engordar, current, SI, new Set(['bc_cm', 'hc_cm']),
    );
    expect(plan.risks.map((r) => r.field).sort()).toEqual(['bc', 'hc']);
    expect(plan.risks[0].before).toBe('30 cm');
    expect(plan.risks[0].after).toBe('40 cm');
    expect(plan.risks[0].why).toContain('EXISTENTE');
  });

  it('el pilar de 35×35 (≠ default) ya avisaba antes y sigue avisando', () => {
    const medido = { ...empresalladoDefaults, bc: 35, hc: 35 };
    expect(empresalladoAdapter.buildPlan(engordar, medido, SI).risks).toHaveLength(2);
  });
});

describe('muros de fábrica — el muro de un pie (t = 240 mm = el default)', () => {
  const current = defaultMasonryState();
  const engordar = p({ t_cm: 40 }); // un pie → 40 cm de recrecido imaginario

  it('sin memoria del hilo: el muro engorda de 24 a 40 cm sin fila roja', () => {
    const plan = masonryWallsAdapter.buildPlan(engordar, current, SI);
    expect(plan.fields.t).toBe(400);
    expect(plan.risks).toEqual([]);
  });

  it('con t ya tratado en el hilo: RIESGO', () => {
    const plan = masonryWallsAdapter.buildPlan(engordar, current, SI, new Set(['t_cm']));
    expect(plan.risks).toHaveLength(1);
    expect(plan.risks[0].field).toBe('t');
    expect(plan.risks[0].why).toContain('EXISTENTE');
  });

  it('el riesgo SINTÉTICO de la fábrica también respeta la memoria del hilo', () => {
    // La fábrica vigente es la de fábrica (macizo, fb=10, fm=5 ⇒ f_k = 4), así que
    // el gate propio de fabricaRisks la daba por "no caracterizada". Pero si el
    // modelo ya confirmó la pieza y las resistencias en un turno anterior, subir fb
    // ES inflar una fábrica ensayada.
    const subirFb = p({ fb_MPa: 20, fm_MPa: 10 }); // f_k sube de 4 a ~6.5
    expect(masonryWallsAdapter.buildPlan(subirFb, current, SI).risks).toEqual([]);

    const conMemoria = masonryWallsAdapter.buildPlan(
      subirFb, current, SI, new Set(['pieza', 'fb_MPa', 'fm_MPa']),
    );
    expect(conMemoria.risks).toHaveLength(1);
    expect(conMemoria.risks[0].field).toBe('fk_fabrica');
  });
});

describe('muros de contención — el NF a 2 m (= el default)', () => {
  // Subir hw por encima de la altura del muro hace h_wet = 0 y BORRA el empuje
  // hidrostático entero, sin tocar `hasWater` (que sí está protegido con trueIsSafer).
  const current = { ...retainingWallDefaults, hasWater: true };
  const hundirNF = p({ hw_m: 9 });

  it('sin memoria del hilo: el NF se hunde a 9 m sin fila roja', () => {
    expect(retainingWallAdapter.buildPlan(hundirNF, current, SI).risks).toEqual([]);
  });

  it('con hw ya tratado en el hilo: RIESGO', () => {
    const plan = retainingWallAdapter.buildPlan(hundirNF, current, SI, new Set(['hw_m']));
    expect(plan.risks.map((r) => r.field)).toContain('hw');
  });
});

describe('vigas de acero — el ancho tributario en su default (3.0 m)', () => {
  // bTrib multiplica la carga lineal de la viga: partirlo por dos parte la
  // demanda por dos. 3.0 m es una separación entre vigas de lo más corriente, así
  // que el usuario con bTrib real = 3.0 tenía el campo sin red.
  //
  // (qk NO sirve para este test: además de la regla de riesgo tiene un guardarraíl
  // que RECHAZA —un qk por debajo de la sobrecarga de la categoría en vigor es una
  // contradicción comprobable, mapExtraction.ts—, así que la rebaja ni siquiera
  // llega a aplicarse. Dos capas, y la de arriba corta antes.)
  const current = { ...steelBeamDefaults };
  const rebajar = p({ bTrib_m: 1.5 });

  it('sin memoria del hilo: bTrib baja de 3.0 a 1.5 m sin fila roja', () => {
    const plan = steelBeamsAdapter.buildPlan(rebajar, current, SI);
    expect(plan.fields.bTrib).toBe(1.5);
    expect(plan.risks).toEqual([]);
  });

  it('con bTrib ya tratado en el hilo: RIESGO', () => {
    const plan = steelBeamsAdapter.buildPlan(rebajar, current, SI, new Set(['bTrib_m']));
    expect(plan.risks.map((r) => r.field)).toContain('bTrib');
  });
});
