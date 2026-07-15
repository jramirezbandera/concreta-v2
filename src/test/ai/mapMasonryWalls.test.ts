// Tests del adapter de muros de fábrica (src/lib/ai/modules/masonryWalls.ts, ola 4):
// gates por modo/método sobre el estado FINAL, la terna de Tabla 4.4 todo-o-nada,
// el espejo del γ del Anejo C (campo derivado, sin fila en `changes`), el snapshot
// con las plantas como contexto de SOLO LECTURA, y las dos capas de seguridad —
// la escalar (t, L, los tres γ) y el riesgo SINTÉTICO sobre la fábrica resuelta.
//
// current = defaultMasonryState(): Tabla 4.4 · macizo · fb 10 · fm 5 (f_k = 4) ·
// γ_M 2.5 · γ_G 1.35 · γ_Q 1.5 · L 6000 mm · t 240 mm · 4 plantas de ejemplo.

import { describe, it, expect } from 'vitest';
import {
  masonryWallsAdapter,
  summarizeMasonryResults,
  ANEJO_C_INERT_REASON,
  CUSTOM_INERT_REASON,
  MANUAL_INERT_REASON,
  TABLA_INERT_REASON,
} from '../../lib/ai/modules/masonryWalls';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { decorateSnapshot } from '../../lib/ai/pendingSnapshot';
import {
  blankMasonryState,
  calcularEdificio,
  defaultMasonryState,
  overallStatus,
  type MasonryWallState,
} from '../../lib/calculations/masonryWalls';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';
const DEF: MasonryWallState = defaultMasonryState();
const CUSTOM_MANUAL: MasonryWallState = { ...DEF, fabricaModo: 'custom', customMethod: 'manual' };
const CUSTOM_ANEJO: MasonryWallState = { ...DEF, fabricaModo: 'custom', customMethod: 'anejoC' };

type Payload = Record<string, unknown>;

function plan(partial: Payload = {}, current: MasonryWallState = DEF): AiApplyPlan<MasonryWallState> {
  return masonryWallsAdapter.buildPlan({ warnings: [], ...partial }, current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<MasonryWallState>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<MasonryWallState>, label: string) =>
  p.skipped.find((s) => s.label.startsWith(label));
const riskFor = (p: AiApplyPlan<MasonryWallState>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('masonry adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => masonryWallsAdapter.buildPlan([], DEF, SYSTEM)).toThrow(AiError);
  });

  it('tipos incorrectos → se ignoran (no aplican)', () => {
    const p = masonryWallsAdapter.buildPlan({ t_cm: '24', pieza: 7 }, DEF, SYSTEM);
    expect(p.fields.t).toBeUndefined();
    expect(p.fields.pieza).toBeUndefined();
  });
});

describe('masonry adapter — unidades (estado en mm, payload en m/cm)', () => {
  it('L_m 5.5 → 5500 mm; t_cm 30 → 300 mm', () => {
    const p = plan({ L_m: 5.5, t_cm: 30 });
    expect(p.fields.L).toBe(5500);
    expect(p.fields.t).toBe(300);
  });

  it('el valor vigente se salta como ALREADY', () => {
    const p = plan({ L_m: 6, t_cm: 24 });
    expect(skipFor(p, 'L ·')?.reason).toBe(ALREADY);
    expect(skipFor(p, 't ·')?.reason).toBe(ALREADY);
  });

  it('fuera de rango → skip', () => {
    const p = plan({ L_m: 0.1, t_cm: 2, gamma_M: 0 });
    expect(p.fields.L).toBeUndefined();
    expect(p.fields.t).toBeUndefined();
    expect(p.fields.gamma_M).toBeUndefined();
    expect(skipFor(p, 't ·')?.reason).toContain('fuera del rango');
  });
});

describe('masonry adapter — catálogos de Tabla 4.4', () => {
  it('pieza fuera de catálogo → skip', () => {
    const p = plan({ pieza: 'ladrillo' });
    expect(p.fields.pieza).toBeUndefined();
    expect(skipFor(p, 'Pieza')?.reason).toContain('no está en el catálogo');
  });

  it('fb y fm no tabulados → skip', () => {
    const p = plan({ fb_MPa: 7, fm_MPa: 3 });
    expect(p.fields.fb).toBeUndefined();
    expect(p.fields.fm).toBeUndefined();
    expect(skipFor(p, 'fb ·')?.reason).toContain('no está tabulado');
  });
});

describe('masonry adapter — la terna (pieza, fb, fm) se aplica ENTERA o no se aplica', () => {
  it('fb solo, sin su fm: la celda no existe → no se aplica NINGUNO de los dos', () => {
    // macizo fb=20 solo admite fm 10 o 15; el fm vigente es 5 → celda nula.
    const p = plan({ fb_MPa: 20 });
    expect(p.fields.fb).toBeUndefined();
    const reason = skipFor(p, 'fb ·')?.reason ?? '';
    expect(reason).toContain('10, 15');           // dice qué fm SÍ valen
    expect(reason).toContain('entera o no se aplica');
  });

  it('fb y fm coherentes → se aplican los dos', () => {
    const p = plan({ fb_MPa: 20, fm_MPa: 10 });
    expect(p.fields.fb).toBe(20);
    expect(p.fields.fm).toBe(10);
  });

  it('pieza sin celda para el fb vigente → skip (junta delgada no admite fb=5)', () => {
    const current: MasonryWallState = { ...DEF, fb: 5, fm: 2.5 };
    const p = plan({ pieza: 'macizo_junta_delgada' }, current);
    expect(p.fields.pieza).toBeUndefined();
    expect(skipFor(p, 'Pieza')?.reason).toContain('NINGUNA celda');
  });

  it('pieza que sí tiene celda con el fb/fm vigentes → se aplica', () => {
    const p = plan({ pieza: 'macizo_junta_delgada' });   // fb=10, fm=5 → f_k = 3
    expect(p.fields.pieza).toBe('macizo_junta_delgada');
  });
});

describe('masonry adapter — gates de modo y método (sobre el estado FINAL)', () => {
  it('en Tabla 4.4 los campos de la fábrica personalizada son inertes', () => {
    const p = plan({ fk_MPa: 6, anejoC_fb_MPa: 12, custom_method: 'anejoC' });
    expect(p.fields.fk_custom).toBeUndefined();
    expect(p.fields.anejoC_fb).toBeUndefined();
    expect(skipFor(p, 'f_k directo')?.reason).toBe(TABLA_INERT_REASON);
    expect(skipFor(p, 'Método')?.reason).toBe(TABLA_INERT_REASON);
  });

  it('en Personalizada la terna de Tabla 4.4 es inerte', () => {
    const p = plan({ pieza: 'perforado', fb_MPa: 20, fm_MPa: 10 }, CUSTOM_MANUAL);
    expect(p.fields.pieza).toBeUndefined();
    expect(skipFor(p, 'Pieza')?.reason).toBe(CUSTOM_INERT_REASON);
  });

  it('en Personalizada · f_k directo, los datos del Anejo C son inertes', () => {
    const p = plan({ anejoC_tipo_muro: 'una_hoja_hueco', anejoC_fm_MPa: 4 }, CUSTOM_MANUAL);
    expect(p.fields.anejoC_tipoMuro).toBeUndefined();
    expect(skipFor(p, 'Tipo de muro')?.reason).toBe(ANEJO_C_INERT_REASON);
  });

  it('en Personalizada · Anejo C, el f_k directo es inerte', () => {
    const p = plan({ fk_MPa: 6 }, CUSTOM_ANEJO);
    expect(p.fields.fk_custom).toBeUndefined();
    expect(skipFor(p, 'f_k directo')?.reason).toBe(MANUAL_INERT_REASON);
  });

  it('GATE SOBRE EL ESTADO FINAL: el modo y el f_k viajan en el mismo turno', () => {
    // Con el gate leído del estado VIGENTE (tabla), el f_k se habría descartado.
    // El método ya era 'manual' en el estado, así que solo cambia el modo.
    const p = plan({ fabrica_modo: 'custom', custom_method: 'manual', fk_MPa: 6 });
    expect(p.fields.fabricaModo).toBe('custom');
    expect(skipFor(p, 'Método')?.reason).toBe(ALREADY);
    expect(p.fields.fk_custom).toBe(6);
  });

  it('GATE SOBRE EL ESTADO FINAL: modo + método + datos del Anejo C en el mismo turno', () => {
    const p = plan({ fabrica_modo: 'custom', custom_method: 'anejoC', anejoC_fb_MPa: 12 });
    expect(p.fields.fabricaModo).toBe('custom');
    expect(p.fields.customMethod).toBe('anejoC');
    expect(p.fields.anejoC_fb).toBe(12);   // inerte si el gate mirase el estado vigente
  });

  it('la eq. C.1 avisa cuando el tope de fm entra en juego', () => {
    const p = plan({ anejoC_fb_MPa: 4, anejoC_fm_MPa: 8 }, CUSTOM_ANEJO);
    expect(p.fields.anejoC_fm).toBe(8);
    expect(p.warnings.some((w) => w.includes('0.75·fb'))).toBe(true);
  });
});

describe('masonry adapter — espejo del γ del Anejo C (campo derivado)', () => {
  it('cambiar el tipo de muro re-estima γ SIN fila propia, con aviso', () => {
    const p = plan({ anejoC_tipo_muro: 'una_hoja_hueco' }, CUSTOM_ANEJO);
    expect(p.fields.anejoC_tipoMuro).toBe('una_hoja_hueco');
    expect(p.fields.gamma_custom).toBe(12);              // GAMMA_ESTIMADO
    expect(p.fields.gamma_custom_edited).toBe(false);
    expect(changeFor(p, 'γ · peso específico de la fábrica')).toBeUndefined();
    expect(p.warnings.some((w) => w.includes('re-estima'))).toBe(true);
  });

  it('un γ explícito gana al auto-estimado y queda marcado como dato del usuario', () => {
    // Sin el flag, el siguiente cambio de tipo de muro en la UI pisaría el γ.
    const p = plan({ anejoC_tipo_muro: 'una_hoja_hueco', gamma_fabrica_kNm3: 16 }, CUSTOM_ANEJO);
    expect(p.fields.gamma_custom).toBe(16);
    expect(p.fields.gamma_custom_edited).toBe(true);
    expect(changeFor(p, 'γ · peso específico de la fábrica')).toBeDefined();
  });

  it('en Tabla 4.4 el γ lo fija la pieza: no se puede escribir', () => {
    const p = plan({ gamma_fabrica_kNm3: 12 });
    expect(p.fields.gamma_custom).toBeUndefined();
    expect(skipFor(p, 'γ ·')?.reason).toContain('lo fija la pieza');
  });
});

describe('masonry adapter — snapshot', () => {
  it('valores en unidades humanas y sin_confirmar completo en el estado de fábrica', () => {
    const snap = JSON.parse(masonryWallsAdapter.snapshot(DEF)) as {
      valores: Record<string, unknown>;
      sin_confirmar: string[];
    };
    expect(snap.valores.L_m).toBe(6);
    expect(snap.valores.t_cm).toBe(24);
    expect(snap.valores.fabrica_modo).toBe('tabla');
    expect(snap.sin_confirmar).toContain('t_cm');
    expect(snap.sin_confirmar).toContain('gamma_M');
  });

  it('un valor tocado sale de sin_confirmar', () => {
    const snap = JSON.parse(masonryWallsAdapter.snapshot({ ...DEF, t: 300 })) as {
      sin_confirmar: string[];
    };
    expect(snap.sin_confirmar).not.toContain('t_cm');
  });

  it('las plantas viajan como CONTEXTO de solo lectura, con la bandera de plantilla', () => {
    const snap = JSON.parse(masonryWallsAdapter.snapshot(blankMasonryState())) as {
      valores: { plantas: unknown[]; plantas_por_defecto: boolean };
    };
    expect(snap.valores.plantas).toHaveLength(1);
    expect(snap.valores.plantas_por_defecto).toBe(true);   // plantilla de la app, no datos del usuario
    const ejemplo = JSON.parse(masonryWallsAdapter.snapshot(DEF)) as {
      valores: { plantas: { huecos: unknown[]; puntuales: unknown[] }[] };
    };
    expect(ejemplo.valores.plantas[0].huecos.length).toBeGreaterThan(0);
    expect(ejemplo.valores.plantas[0].puntuales.length).toBeGreaterThan(0);
  });

  it('las plantas NO son proponibles: no están en el payload schema', () => {
    const props = (masonryWallsAdapter.payloadSchema as { properties: Record<string, unknown> }).properties;
    expect(props.plantas).toBeUndefined();
    expect((masonryWallsAdapter.payloadSchema as { additionalProperties: boolean }).additionalProperties).toBe(false);
  });

  it('decorateSnapshot NO se lleva por delante el contexto (por eso va dentro de `valores`)', () => {
    // pendingSnapshot reconstruye el objeto con valores/sin_confirmar/pendientes:
    // una clave hermana de primer nivel desaparecería tras la primera propuesta.
    const decorado = decorateSnapshot(
      masonryWallsAdapter.snapshot(DEF),
      { t_cm: 30, warnings: [] },
      new Set(['L_m']),
    );
    const snap = JSON.parse(decorado) as {
      valores: { plantas: unknown[]; plantas_por_defecto: boolean };
      sin_confirmar: string[];
      pendientes_de_aplicar: Record<string, unknown>;
    };
    expect(snap.valores.plantas).toHaveLength(4);
    expect(snap.valores.plantas_por_defecto).toBe(true);
    expect(snap.pendientes_de_aplicar.t_cm).toBe(30);
    expect(snap.sin_confirmar).not.toContain('t_cm');
    expect(snap.sin_confirmar).not.toContain('L_m');
  });
});

describe('masonry adapter — seguridad escalar (lo existente es DATO)', () => {
  it('engordar el espesor MEDIDO es riesgo', () => {
    const medido: MasonryWallState = { ...DEF, t: 300 };
    const p = plan({ t_cm: 40 }, medido);
    expect(riskFor(p, 't')).toBeDefined();
    expect(riskFor(p, 't')?.why).toContain('medida de obra');
  });

  it('con t en su valor de fábrica NO hay riesgo (gate anti-ruido: es el primer dato)', () => {
    const p = plan({ t_cm: 40 }, DEF);
    expect(p.fields.t).toBe(400);
    expect(riskFor(p, 't')).toBeUndefined();
  });

  it('alargar el muro MEDIDO es riesgo', () => {
    const medido: MasonryWallState = { ...DEF, L: 5000 };
    expect(riskFor(plan({ L_m: 8 }, medido), 'L')).toBeDefined();
  });

  it('bajar un coeficiente parcial es riesgo AUNQUE esté en su valor de fábrica', () => {
    const p = plan({ gamma_M: 1.7, gamma_G: 1.0 }, DEF);
    expect(riskFor(p, 'gamma_M')).toBeDefined();
    expect(riskFor(p, 'gamma_G')).toBeDefined();
  });

  it('subir γ_M no es riesgo (va del lado seguro)', () => {
    expect(riskFor(plan({ gamma_M: 3.0 }, DEF), 'gamma_M')).toBeUndefined();
  });
});

describe('masonry adapter — riesgo SINTÉTICO sobre la fábrica resuelta', () => {
  // La fábrica ya caracterizada (fb/fm distintos del default): a partir de aquí
  // subirle la resistencia es reescribir el ensayo, no aportar un dato.
  const ENSAYADA: MasonryWallState = { ...DEF, fb: 15, fm: 10 };   // f_k = 6

  it('subir f_k por fb+fm dispara UNA sola fila de riesgo', () => {
    const p = plan({ fb_MPa: 25, fm_MPa: 15 }, ENSAYADA);   // f_k 6 → 10
    expect(p.fields.fb).toBe(25);
    expect(riskFor(p, 'fk_fabrica')).toBeDefined();
    expect(p.risks).toHaveLength(1);                        // sin doble-reporte fb/fm
  });

  it('subir fm sin que f_k se mueva NO es riesgo (el falso positivo de la regla por campo)', () => {
    // perforado fb=10: fm 5 y fm 7.5 dan los dos f_k = 4.
    const current: MasonryWallState = { ...DEF, pieza: 'perforado' };
    const p = plan({ fm_MPa: 7.5 }, current);
    expect(p.fields.fm).toBe(7.5);
    expect(p.risks).toHaveLength(0);
  });

  it('subir f_k cambiando de MODO sobre un formulario virgen también dispara', () => {
    // Cláusula (b) del gate: un cambio de modo nunca es "rellenar el formulario".
    const p = plan({ fabrica_modo: 'custom', custom_method: 'manual', fk_MPa: 10 }, DEF);
    expect(riskFor(p, 'fk_fabrica')).toBeDefined();
  });

  it('aligerar la fábrica (γ) es riesgo: el peso propio es demanda', () => {
    const p = plan({ pieza: 'bloque_hueco' }, ENSAYADA);   // γ 18 → 12; f_k 6 → 4
    expect(p.fields.pieza).toBe('bloque_hueco');
    expect(riskFor(p, 'gamma_fabrica')).toBeDefined();
    expect(riskFor(p, 'fk_fabrica')).toBeUndefined();      // la resistencia BAJA: no hay trampa
  });

  it('el γ aligerado por el auto-estimado del Anejo C también se marca (no tiene fila en changes)', () => {
    const p = plan({ anejoC_tipo_muro: 'una_hoja_hueco' }, CUSTOM_ANEJO);   // γ 18 → 12
    expect(riskFor(p, 'gamma_fabrica')).toBeDefined();
  });

  it('sobre un formulario virgen, declarar la fábrica NO es riesgo', () => {
    const p = plan({ fb_MPa: 25, fm_MPa: 15 }, DEF);       // f_k 4 → 10, pero nadie la había fijado
    expect(p.risks).toHaveLength(0);
  });
});

describe('masonry adapter — resumen de resultados', () => {
  const resumen = (s: MasonryWallState) => summarizeMasonryResults(calcularEdificio(s));

  it('estado inválido → veredicto invalid, con el motivo y el arreglo', () => {
    const r = resumen({ ...DEF, t: 10 });
    expect(r.verdict).toBe('invalid');
    expect(r.text).toContain('CÁLCULO NO VÁLIDO');
    expect(r.text).toContain('50 mm');       // reason
    expect(r.text).toContain('12 cm');       // fix
  });

  it('el veredicto del chat es el del badge de la pantalla', () => {
    const st = { ...DEF };
    const res = calcularEdificio(st);
    if (res.invalid) throw new Error('fixture inválida');
    expect(resumen(st).verdict).toBe(overallStatus(res.plantas).v);
  });

  it('cita el machón crítico y el η de cada planta', () => {
    const r = resumen(DEF);
    expect(r.text).toContain('Machón crítico');
    expect(r.text).toContain('η máximo por planta');
    expect(r.text).toContain('Cubierta');
  });

  it('la banda ámbar de λ va como aviso, NUNCA como comprobación', () => {
    // t = 120 mm con H = 3 m → λ = 25 en cubierta: la pantalla lo marca en ámbar,
    // pero el motor dice CUMPLE. Si entrara como CheckRow, volcaría el veredicto.
    const st: MasonryWallState = {
      ...DEF, t: 120,
      plantas: DEF.plantas.map((p) => ({ ...p, q_G: 1, q_Q: 0.3, huecos: [], puntuales: [] })),
    };
    const res = calcularEdificio(st);
    if (res.invalid) throw new Error('fixture inválida');
    const cubierta = res.plantas[res.plantas.length - 1];
    expect(cubierta.lambda).toBeCloseTo(25, 1);
    const r = summarizeMasonryResults(res);
    expect(r.verdict).toBe(overallStatus(res.plantas).v);
    expect(r.text).toContain('banda alta de esbeltez');
  });
});
