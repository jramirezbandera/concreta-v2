// Tests del adapter forjados (src/lib/ai/modules/forjados.ts, ola 2):
// gates con patch atómico (variant, tipologia), campos inertes por variante (los
// dos juegos de armado son disjuntos), catálogo propio de la parrilla maciza,
// exclusión de loadType/psi2Custom (invisibles en la UI), y la trampa de los
// infoChecks — que NO son `neutral` y NO cuentan para el veredicto.
//
// current = forjadosDefaults: reticular 30+5 · continuo-interior · L=5 m · HA-25
// B500S · XC1 · sin cercos · vano Md=35 · apoyo Md=25 · VEd=22.

import { describe, it, expect } from 'vitest';
import {
  forjadosAdapter,
  summarizeForjadoResults,
  MACIZA_ARMADO_REASON,
  MACIZA_INERT_REASON,
  PRESET_GEOM_REASON,
  RETICULAR_ARMADO_REASON,
  STIRRUPS_GATE_REASON,
} from '../../lib/ai/modules/forjados';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { AiError } from '../../lib/ai/types';
import { forjadosDefaults, type ForjadosInputs } from '../../data/defaults';
import { calcForjados } from '../../lib/calculations/rcSlabs';

const SYSTEM = 'si' as const;
const ALREADY = 'Ya coincide con el valor actual';
const MACIZA: ForjadosInputs = { ...forjadosDefaults, variant: 'maciza' };

type Payload = Record<string, unknown>;

function plan(
  partial: Payload = {},
  current: ForjadosInputs = forjadosDefaults,
): AiApplyPlan<ForjadosInputs> {
  return forjadosAdapter.buildPlan({ warnings: [], ...partial }, current, SYSTEM);
}

const changeFor = (p: AiApplyPlan<ForjadosInputs>, label: string) =>
  p.changes.find((c) => c.label === label);
const skipFor = (p: AiApplyPlan<ForjadosInputs>, label: string) =>
  p.skipped.find((s) => s.label === label);
const riskFor = (p: AiApplyPlan<ForjadosInputs>, field: string) =>
  p.risks.find((r) => r.field === field);

describe('forjados adapter — parseo defensivo', () => {
  it('payload no-objeto → AiError', () => {
    expect(() => forjadosAdapter.buildPlan([], forjadosDefaults, SYSTEM)).toThrow(AiError);
  });

  it('stirrupsEnabled con tipo incorrecto → null (no aplica)', () => {
    const p = forjadosAdapter.buildPlan({ stirrupsEnabled: 'si' }, forjadosDefaults, SYSTEM);
    expect(p.fields.stirrupsEnabled).toBeUndefined();
  });
});

describe('forjados adapter — gate de la variante', () => {
  it('cambiar de variante avisa de que se reinicia el armado', () => {
    const p = plan({ variant: 'maciza' });
    expect(p.fields.variant).toBe('maciza');
    expect(p.warnings.some((w) => w.includes('reinicia'))).toBe(true);
  });

  it('en maciza, tipología / capa / nervio / intereje son inertes', () => {
    const p = plan({ tipologia: '35+5', hFlange_mm: 60, bWeb_mm: 140, intereje_mm: 700 }, MACIZA);
    expect(skipFor(p, 'Tipología')?.reason).toBe(MACIZA_INERT_REASON);
    expect(skipFor(p, 'Capa de compresión h_f')?.reason).toBe(MACIZA_INERT_REASON);
    expect(skipFor(p, 'Ancho de nervio b_w')?.reason).toBe(MACIZA_INERT_REASON);
    expect(p.fields.hFlange).toBeUndefined();
  });

  it('el canto SÍ es editable en maciza', () => {
    expect(plan({ h_mm: 250 }, MACIZA).fields.h).toBe(250);
  });

  it('proponer maciza en el mismo turno hace inerte el armado reticular', () => {
    const p = plan({ variant: 'maciza', base_sup_nBars: 4 });
    expect(skipFor(p, 'Montaje superior — nº barras')?.reason).toBe(RETICULAR_ARMADO_REASON);
  });
});

describe('forjados adapter — gate de la tipología', () => {
  it('con una tipología comercial, la geometría la fija el preset → skip', () => {
    const p = plan({ h_mm: 400, bWeb_mm: 150 });
    expect(skipFor(p, 'Canto h')?.reason).toBe(PRESET_GEOM_REASON);
    expect(skipFor(p, 'Ancho de nervio b_w')?.reason).toBe(PRESET_GEOM_REASON);
    expect(p.fields.h).toBeUndefined();
  });

  it('tipologia="custom" en el mismo turno desbloquea la geometría', () => {
    const p = plan({ tipologia: 'custom', h_mm: 400, bWeb_mm: 150 });
    expect(p.fields.tipologia).toBe('custom');
    expect(p.fields.h).toBe(400);
    expect(p.fields.bWeb).toBe(150);
  });

  it('tipología fuera del catálogo → skip', () => {
    expect(skipFor(plan({ tipologia: '50+5' }), 'Tipología')?.reason).toContain('no está en el catálogo');
  });

  it('una tipología comercial avisa de la geometría que arrastra (se aplica sin fila propia)', () => {
    const p = plan({ tipologia: '35+10' });
    expect(p.fields.tipologia).toBe('35+10');
    expect(p.warnings.some((w) => w.includes('canto 450 mm') && w.includes('capa 100 mm'))).toBe(true);
  });

  it('tipologia="custom" no avisa: no arrastra geometría', () => {
    expect(plan({ tipologia: 'custom' }).warnings).toEqual([]);
  });
});

describe('forjados adapter — armado por variante', () => {
  it('en reticular, la parrilla maciza es inerte', () => {
    const p = plan({ base_sup_phi_mac_mm: 12, base_sup_s_mac_mm: 150 });
    expect(skipFor(p, 'Parrilla superior — Ø')?.reason).toBe(MACIZA_ARMADO_REASON);
    expect(skipFor(p, 'Parrilla superior — separación')?.reason).toBe(MACIZA_ARMADO_REASON);
  });

  it('la parrilla maciza tiene catálogo PROPIO: Ø25 no vale', () => {
    expect(skipFor(plan({ base_sup_phi_mac_mm: 25 }, MACIZA), 'Parrilla superior — Ø')?.reason)
      .toContain('no es un diámetro de parrilla');
  });

  it('Ø0 vale en un refuerzo maciza (= sin refuerzo), no en la parrilla base', () => {
    const p = plan({ refuerzo_apoyo_sup_phi_mac_mm: 0, base_inf_phi_mac_mm: 0 }, MACIZA);
    expect(p.fields.refuerzo_apoyo_sup_phi_mac).toBe(0);
    expect(changeFor(p, 'Refuerzo de apoyo — Ø')?.after).toBe('sin refuerzo');
    expect(skipFor(p, 'Parrilla inferior — Ø')).toBeDefined();
  });

  it('el montaje base reticular no admite 0 barras (el motor lo invalidaría)', () => {
    expect(skipFor(plan({ base_inf_nBars: 0 }), 'Montaje inferior — nº barras')?.reason)
      .toContain('fuera del rango');
  });

  it('un refuerzo reticular SÍ admite 0 barras', () => {
    expect(plan({ refuerzo_vano_inf_nBars: 0 }).fields.refuerzo_vano_inf_nBars).toBe(0);
  });
});

describe('forjados adapter — gate de los cercos', () => {
  it('sin cercos, su configuración se salta con motivo', () => {
    const p = plan({ apoyo_stirrupDiam_mm: 8, apoyo_stirrupSpacing_mm: 100 });
    expect(skipFor(p, 'Apoyo — Ø cerco')?.reason).toBe(STIRRUPS_GATE_REASON);
    expect(skipFor(p, 'Apoyo — separación de cercos')?.reason).toBe(STIRRUPS_GATE_REASON);
  });

  it('stirrupsEnabled=true en el mismo turno abre el gate', () => {
    const p = plan({ stirrupsEnabled: true, apoyo_stirrupDiam_mm: 8 });
    expect(p.fields.stirrupsEnabled).toBe(true);
    expect(p.fields.apoyo_stirrupDiam).toBe(8);
  });

  it('4 ramas no está entre las opciones de forjados (2, 3, 4 sí; 6 no)', () => {
    const p = plan({ stirrupsEnabled: true, vano_stirrupLegs: 6 });
    expect(skipFor(p, 'Vano — ramas del cerco')?.reason).toContain('no está entre las opciones');
  });
});

describe('forjados adapter — unidades y esfuerzos', () => {
  it('la luz va en metros y se guarda en mm', () => {
    const p = plan({ spanLength_m: 6.5 });
    expect(p.fields.spanLength).toBe(6500);
    expect(changeFor(p, 'Luz L')).toMatchObject({ before: '5 m', after: '6.5 m' });
  });

  it('un momento negativo se guarda como magnitud y avisa', () => {
    const p = plan({ apoyo_Md_kNm: -40 });
    expect(p.fields.apoyo_Md).toBe(40);
    expect(p.warnings.some((w) => w.includes('magnitud'))).toBe(true);
  });

  it('valor igual al actual → skip ALREADY (nunca se aplica en silencio)', () => {
    expect(skipFor(plan({ VEd_kN: 22 }), 'Cortante VEd')?.reason).toBe(ALREADY);
  });
});

describe('forjados adapter — reglas de seguridad', () => {
  it('rebajar el cortante fijado → riesgo', () => {
    const current: ForjadosInputs = { ...forjadosDefaults, VEd: 40 };
    expect(riskFor(plan({ VEd_kN: 15 }, current), 'VEd')?.why).toContain('cerco');
  });

  it('ALARGAR la luz → riesgo (dirección contraria al resto de vigas: aquí Md es manual y L solo infla bEff)', () => {
    const current: ForjadosInputs = { ...forjadosDefaults, spanLength: 4000 };
    expect(riskFor(plan({ spanLength_m: 6.5 }, current), 'spanLength')?.why).toContain('bEff');
  });

  it('PUNTO CIEGO documentado: acortar la luz NO salta (solo limpia la línea informativa de esbeltez, no puede volcar el veredicto)', () => {
    const current: ForjadosInputs = { ...forjadosDefaults, spanLength: 7000 };
    expect(plan({ spanLength_m: 4 }, current).risks).toEqual([]);
  });

  it('bajar la exposición a XC1 → riesgo: ELIMINA la comprobación de fisuración', () => {
    const current: ForjadosInputs = { ...forjadosDefaults, exposureClass: 'XC3' };
    expect(riskFor(plan({ exposureClass: 'XC1' }, current), 'exposureClass')?.why).toContain('ELIMINA');
  });

  it('declarar voladizo (L0 = 2L) → riesgo: ensancha el ancho eficaz', () => {
    const current: ForjadosInputs = { ...forjadosDefaults, tipoVano: 'biapoyado' };
    expect(riskFor(plan({ tipoVano: 'voladizo' }, current), 'tipoVano')?.why).toContain('ancho eficaz');
  });

  it('subir el canto, el armado o el hormigón NUNCA es riesgo', () => {
    const current: ForjadosInputs = { ...forjadosDefaults, tipologia: 'custom', h: 300 };
    expect(plan({ h_mm: 450, fck_MPa: 35, refuerzo_vano_inf_barDiam_mm: 20 }, current).risks).toEqual([]);
  });
});

describe('forjados adapter — snapshot', () => {
  it('loadType y psi2Custom NO viajan al modelo (no tienen control en la UI)', () => {
    const snap = JSON.parse(forjadosAdapter.snapshot(forjadosDefaults));
    expect(snap.valores.loadType).toBeUndefined();
    expect(snap.valores.psi2Custom).toBeUndefined();
    expect(snap.valores.title).toBeUndefined();
  });

  it('defaults → 42 claves sin confirmar; la luz va en metros', () => {
    const snap = JSON.parse(forjadosAdapter.snapshot(forjadosDefaults));
    expect(snap.valores.spanLength_m).toBe(5);
    expect(snap.valores.variant).toBe('reticular');
    expect(snap.sin_confirmar).toHaveLength(42);
  });
});

describe('forjados adapter — resumen', () => {
  it('las dos secciones + el cortante, con las filas prefijadas', () => {
    const s = summarizeForjadoResults(calcForjados(forjadosDefaults));
    expect(s.text).toContain('Vano: ');
    expect(s.text).toContain('Apoyo: ');
    expect(s.text).toContain('Nervio: ancho eficaz');
  });

  it('los infoChecks van aparte y NO cuentan para el veredicto', () => {
    // Luz enorme: la esbeltez L/d se dispara y el infoCheck se pone en 'warn'.
    const r = calcForjados({ ...forjadosDefaults, spanLength: 20000 });
    expect(r.infoChecks.some((c) => c.id === 'esbeltez-flecha' && c.status === 'warn')).toBe(true);
    const s = summarizeForjadoResults(r);
    expect(s.text).toContain('NO cuentan para el veredicto');
    // El veredicto sale de vano+apoyo+cortante, exactamente como en pantalla.
    expect(s.text).not.toContain('[ADVERTENCIA] Esbeltez');
  });

  it('la fila "el armado no cabe en el nervio" llega al resumen', () => {
    const r = calcForjados({ ...forjadosDefaults, refuerzo_vano_inf_nBars: 6, refuerzo_vano_inf_barDiam: 25 });
    const impossible = r.vano.checks.some((c) => c.id === 'bar-spacing-impossible');
    expect(impossible).toBe(true);
    expect(summarizeForjadoResults(r).text).toContain('Vano: ');
    expect(summarizeForjadoResults(r).verdict).toBe('fail');
  });

  it('losa maciza → lo dice y no habla de nervios', () => {
    const s = summarizeForjadoResults(calcForjados(MACIZA));
    expect(s.text).toContain('franja de 1000 mm');
    expect(s.text).not.toContain('ancho eficaz');
  });

  it('entrada inválida → invalid (error != null)', () => {
    const s = summarizeForjadoResults(calcForjados({ ...forjadosDefaults, h: 0 }));
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});
