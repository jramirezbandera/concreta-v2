// Tests del adapter anchor-plate (src/lib/ai/modules/anchorPlate.ts, ola 2):
// sincronización de los campos LEGACY (VEd espejo de Vx/Vy; pedestal_cX/cY espejo
// del par por cara) vía shearPatch/edgeAxisPatch y SIN fila en la tabla de cambios;
// las dos reglas contraintuitivas (subir NEd o NEd_G "mejora" el cálculo); y el
// resumen de un motor SIN campo `error` cuyos warnings de severidad fail vuelcan
// el veredicto sin ser checks.
//
// current = anchorPlateDefaults: HEB-200 · N=200 (G=120) · Mx=45 · My=10 · V=50 ·
// placa 400×300×20 S275 · 4Ø20 B500S · prolongación recta · 2 rigidizadores ·
// HA-25 · macizo 200/200/200/200, canto 1000 · superficie rugosa.

import { describe, it, expect } from 'vitest';
import {
  anchorPlateAdapter,
  summarizeAnchorPlateResults,
  RIB_GATE_REASON,
  WASHER_GATE_REASON,
} from '../../lib/ai/modules/anchorPlate';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { anchorPlateDefaults, type AnchorPlateInputs } from '../../data/defaults';
import { calcAnchorPlate } from '../../lib/calculations/anchorPlate';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';

type Payload = Record<string, unknown>;

function plan(
  partial: Payload = {},
  current: AnchorPlateInputs = anchorPlateDefaults,
): AiApplyPlan<AnchorPlateInputs> {
  return anchorPlateAdapter.buildPlan({ warnings: [], ...partial }, current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<AnchorPlateInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<AnchorPlateInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<AnchorPlateInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('anchorPlate adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => anchorPlateAdapter.buildPlan([], anchorPlateDefaults, SYSTEM)).toThrow(AiError);
  });

  it('campo con tipo incorrecto → null (no aplica)', () => {
    const p = anchorPlateAdapter.buildPlan({ NEd_kN: '200' }, anchorPlateDefaults, SYSTEM);
    expect(p.fields.NEd).toBeUndefined();
  });
});

describe('anchorPlate adapter — perfil (validación cruzada familia↔tamaño)', () => {
  it('IPN existe en este módulo', () => {
    const p = plan({ sectionType: 'IPN', sectionSize: 200 });
    expect(p.fields.sectionType).toBe('IPN');
    expect(p.fields.sectionSize).toBe(200);
  });

  it('el tamaño se valida contra la familia FINAL del plan', () => {
    const p = plan({ sectionType: 'IPE', sectionSize: 1000 });
    expect(skipFor(p, 'Tamaño del perfil')?.reason).toContain('no está en el catálogo');
    expect(p.fields.sectionSize).toBeUndefined();
  });

  it('cambio de familia sin tamaño y con un tamaño vigente inválido → se ajusta al primero + warning', () => {
    const current: AnchorPlateInputs = { ...anchorPlateDefaults, sectionType: 'HEB', sectionSize: 1000 };
    const p = plan({ sectionType: 'IPE' }, current);
    expect(p.fields.sectionSize).toBeDefined();
    expect(p.warnings.some((w) => w.includes('se ajusta'))).toBe(true);
  });
});

describe('anchorPlate adapter — sincronización del CORTANTE legacy', () => {
  it('proponer Vx sincroniza VEd, pero SIN fila propia en la tabla de cambios', () => {
    const p = plan({ Vx_kN: 80 });
    expect(p.fields.Vx).toBe(80);
    expect(p.fields.VEd).toBe(80);            // espejo legacy, coherente con resolveShear
    expect(changeFor(p, 'Cortante Vx')).toBeDefined();
    expect(p.changes.some((c) => c.field === 'VEd')).toBe(false);
  });

  it('con cortante biaxial, VEd guarda la MAGNITUD', () => {
    const p = plan({ Vx_kN: 30, Vy_kN: 40 });
    expect(p.fields.Vx).toBe(30);
    expect(p.fields.Vy).toBe(40);
    expect(p.fields.VEd).toBeCloseTo(50, 6);  // hypot(30, 40)
  });

  it('proponer solo Vy completa el par con el Vx vigente', () => {
    const p = plan({ Vy_kN: 30 });
    expect(p.fields.Vx).toBe(anchorPlateDefaults.Vx);
    expect(p.fields.VEd).toBeCloseTo(Math.hypot(50, 30), 6);
  });

  it('sin tocar el cortante, el legacy no se toca', () => {
    expect(plan({ Mx_kNm: 60 }).fields.VEd).toBeUndefined();
  });
});

describe('anchorPlate adapter — sincronización de los BORDES del macizo', () => {
  it('proponer cX1/cX2 siembra el legacy pedestal_cX con el mínimo, sin fila de cambio', () => {
    const p = plan({ pedestal_cX1_mm: 400, pedestal_cX2_mm: 250 });
    expect(p.fields.pedestal_cX1).toBe(400);
    expect(p.fields.pedestal_cX2).toBe(250);
    expect(p.fields.pedestal_cX).toBe(250);
    expect(p.changes.some((c) => c.field === 'pedestal_cX')).toBe(false);
  });

  it('un par simétrico deja el legacy en ese mismo valor (lo que leerá resolveEdges)', () => {
    const p = plan({ pedestal_cY1_mm: 350, pedestal_cY2_mm: 350 });
    expect(p.fields.pedestal_cY).toBe(350);
  });

  it('tocar solo un borde completa el par con el vigente', () => {
    const p = plan({ pedestal_cX1_mm: 500 });
    expect(p.fields.pedestal_cX2).toBe(anchorPlateDefaults.pedestal_cX2);
    expect(p.fields.pedestal_cX).toBe(200);
  });
});

describe('anchorPlate adapter — gates', () => {
  it('la arandela sin anclaje de arandela+tuerca → skip', () => {
    expect(skipFor(plan({ washer_od_mm: 60 }), 'Ø exterior de la arandela')?.reason).toBe(WASHER_GATE_REASON);
  });

  it('bottom_anchorage="arandela_tuerca" en el mismo turno abre el gate', () => {
    const p = plan({ bottom_anchorage: 'arandela_tuerca', washer_od_mm: 60 });
    expect(p.fields.bottom_anchorage).toBe('arandela_tuerca');
    expect(p.fields.washer_od).toBe(60);
  });

  it('la geometría del rigidizador sin rigidizadores → skip', () => {
    const current: AnchorPlateInputs = { ...anchorPlateDefaults, rib_count: 0 };
    expect(skipFor(plan({ rib_h_mm: 150 }, current), 'Rigidizador — altura')?.reason).toBe(RIB_GATE_REASON);
  });
});

describe('anchorPlate adapter — catálogos y campos excluidos', () => {
  it('Ø14 no es un diámetro de barra de anclaje → skip', () => {
    expect(skipFor(plan({ bar_diam_mm: 14 }), 'Ø de las barras')?.reason).toContain('catálogo');
  });

  it('una disposición de 5 barras no existe → skip', () => {
    expect(skipFor(plan({ bar_nLayout: 5 }), 'Disposición de barras')?.reason).toContain('no es una disposición');
  });

  it('valor igual al actual → skip ALREADY (nunca se aplica en silencio)', () => {
    expect(skipFor(plan({ plate_t_mm: 20 }), 'Placa — espesor t')?.reason).toBe(ALREADY);
  });

  it('concrete_cracked y bar_spacing NO viajan al modelo (no los puede corregir / no los usa el motor)', () => {
    const snap = JSON.parse(anchorPlateAdapter.snapshot(anchorPlateDefaults));
    expect(snap.valores.concrete_cracked).toBeUndefined();
    expect(snap.valores.bar_spacing_x).toBeUndefined();
    expect(snap.valores.bar_spacing_y).toBeUndefined();
    expect(snap.valores.VEd_kN).toBeUndefined();     // legacy: solo viaja Vx/Vy
    expect(snap.valores.title).toBeUndefined();
  });

  it('defaults → 34 claves sin confirmar', () => {
    const snap = JSON.parse(anchorPlateAdapter.snapshot(anchorPlateDefaults));
    expect(snap.sin_confirmar).toHaveLength(34);
  });
});

describe('anchorPlate adapter — reglas de seguridad', () => {
  it('SUBIR el axil es riesgo: la compresión alivia la tracción de los anclajes', () => {
    const current: AnchorPlateInputs = { ...anchorPlateDefaults, NEd: 150 };
    expect(riskFor(plan({ NEd_kN: 400 }, current), 'NEd')?.why).toContain('SUBIR');
  });

  it('bajar el axil NO es riesgo (es el lado conservador aquí)', () => {
    const current: AnchorPlateInputs = { ...anchorPlateDefaults, NEd: 300 };
    expect(plan({ NEd_kN: 100 }, current).risks).toEqual([]);
  });

  it('inflar el axil cuasi-permanente es riesgo (regala fricción contra el cortante)', () => {
    const current: AnchorPlateInputs = { ...anchorPlateDefaults, NEd_G: 80 };
    expect(riskFor(plan({ NEd_G_kN: 200 }, current), 'NEd_G')?.why).toContain('fricción');
  });

  it('NEd,G mayor que NEd → warning', () => {
    const p = plan({ NEd_kN: 100, NEd_G_kN: 150 });
    expect(p.warnings.some((w) => w.includes('cuasi-permanente'))).toBe(true);
  });

  it('rebajar la MAGNITUD de un momento es riesgo; cambiarle el signo no', () => {
    const current: AnchorPlateInputs = { ...anchorPlateDefaults, Mx: 90 };
    expect(riskFor(plan({ Mx_kNm: 20 }, current), 'Mx')).toBeDefined();
    expect(plan({ Mx_kNm: -90 }, current).risks).toEqual([]);
  });

  it('agrandar el macizo o sus distancias a los bordes es riesgo', () => {
    const current: AnchorPlateInputs = { ...anchorPlateDefaults, pedestal_cX1: 150, pedestal_h: 600 };
    const p = plan({ pedestal_cX1_mm: 600, pedestal_h_mm: 1500 }, current);
    expect(riskFor(p, 'pedestal_cX1')).toBeDefined();
    expect(riskFor(p, 'pedestal_h')).toBeDefined();
  });

  it('declarar rugosa una superficie lisa es riesgo (μ pasa de 0.2 a 0.4)', () => {
    const current: AnchorPlateInputs = { ...anchorPlateDefaults, surface_type: 'smooth' };
    expect(riskFor(plan({ surface_type: 'roughened' }, current), 'surface_type')?.why).toContain('rozamiento');
  });

  it('lo contrario (rugosa → lisa) NO es riesgo: es el lado conservador', () => {
    expect(plan({ surface_type: 'smooth' }).risks).toEqual([]);
  });

  it('engordar la placa, las barras o el hormigón NUNCA es riesgo', () => {
    const current: AnchorPlateInputs = { ...anchorPlateDefaults, plate_t: 25 };
    expect(plan({ plate_t_mm: 35, bar_diam_mm: 25, fck_MPa: 35, bar_hef_mm: 400 }, current).risks).toEqual([]);
  });
});

describe('anchorPlate adapter — resumen (motor SIN campo error)', () => {
  it('sin ninguna solicitación → invalid, NUNCA verde', () => {
    const state: AnchorPlateInputs = { ...anchorPlateDefaults, NEd: 0, Mx: 0, My: 0, VEd: 0, Vx: 0, Vy: 0 };
    const r = calcAnchorPlate(state);
    expect(r.valid).toBe(false);
    expect(r.overallStatus).toBe('ok');   // la trampa: el motor dice 'ok' sin haber comprobado nada
    const s = summarizeAnchorPlateResults(r);
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('Sin solicitaciones');
  });

  it('extras: utilización máxima y modo del solver', () => {
    const s = summarizeAnchorPlateResults(calcAnchorPlate(anchorPlateDefaults));
    expect(s.text).toContain('Utilización máxima');
    expect(s.text).toContain('Solver:');
  });

  it('un warning de severidad "fail" vuelca el veredicto del resumen', () => {
    // fck < 20 MPa es una validación de entrada con severidad fail: fuerza
    // overallStatus a fail en pantalla SIN ser un check.
    const r = calcAnchorPlate({ ...anchorPlateDefaults, fck: 16 });
    expect(r.warnings.some((w) => w.severity === 'fail')).toBe(true);
    expect(r.overallStatus).toBe('fail');
    const s = summarizeAnchorPlateResults(r);
    expect(s.verdict).toBe('fail');
    expect(s.text).toContain('Validación de entrada');
  });

  it('una placa que incumple se resume como fail', () => {
    const s = summarizeAnchorPlateResults(calcAnchorPlate({ ...anchorPlateDefaults, Mx: 400 }));
    expect(s.verdict).toBe('fail');
  });
});
