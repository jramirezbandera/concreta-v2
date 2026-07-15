// Adapter IA de Sección compuesta (ola 3 — PILOTO de arrays en el payload):
//   - Gate de modo (reinforced/custom): perfil, laterales y bloque de
//     compresión solo existen en reinforced.
//   - Catálogo de perfil por familia efectiva + auto-ajuste de tamaño al
//     cambiar de familia (réplica del useEffect de la UI).
//   - Array `plates` con REEMPLAZO completo: elemento inválido → skip del
//     array ENTERO; máx 6; ids regenerados p1..pn; ALREADY ignorando ids;
//     semántica lateral (b = espesor, t ignorada) y custom (customYBottom).
//   - Conversión Ly/Lz (payload en m, estado en mm).
//   - Snapshot {valores, sin_confirmar} con el array en forma de payload.
//   - Riesgos: Ned/Ly/Lz/β/bcType (ordinal); chapas SIN reglas (diseño libre).
//   - summarizeCompositeSectionResults con el motor real (fila sintética de
//     clase + compChecks + extras).
// current = compositeSectionDefaults: reinforced, IPE 300 S275, 1 chapa
// superior 200×15, Ly=Lz=3500 mm, bcType pp, β=1.0, Ned=0.

import { describe, expect, it } from 'vitest';
import {
  compositeSectionAdapter,
  summarizeCompositeSectionResults,
} from '../../lib/ai/modules/compositeSection';
import { calcCompositeSection } from '../../lib/calculations/compositeSection';
import { compositeSectionDefaults, type CompositeSectionInputs, type PlateEntry } from '../../data/defaults';

const DEFAULTS = compositeSectionDefaults;

interface PlatePayload {
  posType?: string | null;
  b_mm?: number | null;
  t_mm?: number | null;
  customYBottom_mm?: number | null;
  lateralAnchor?: string | null;
  lateralOffset_mm?: number | null;
}

interface Payload {
  mode?: string | null;
  profileType?: string | null;
  profileSize?: number | null;
  grade?: string | null;
  plates?: PlatePayload[] | null;
  Ly_m?: number | null;
  Lz_m?: number | null;
  bcType?: string | null;
  beta_y?: number | null;
  beta_z?: number | null;
  Ned_kN?: number | null;
  warnings?: string[];
}

const NULL_PAYLOAD: Payload = {
  mode: null, profileType: null, profileSize: null, grade: null, plates: null,
  Ly_m: null, Lz_m: null, bcType: null, beta_y: null, beta_z: null, Ned_kN: null,
  warnings: [],
};

function makePayload(overrides: Payload = {}): Payload {
  return { ...NULL_PAYLOAD, ...overrides };
}

function plan(overrides: Payload = {}, current: CompositeSectionInputs = DEFAULTS) {
  return compositeSectionAdapter.buildPlan(makePayload(overrides), current, 'si');
}

function changeFor(p: ReturnType<typeof plan>, label: string) {
  return p.changes.find((c) => c.label === label);
}
function skipFor(p: ReturnType<typeof plan>, label: string) {
  return p.skipped.find((s) => s.label === label);
}

const ALL_LABELS = [
  'Modo de la sección', 'Familia del perfil', 'Tamaño del perfil', 'Acero',
  'Chapas de refuerzo', 'Luz de pandeo Ly', 'Luz de pandeo Lz',
  'Vinculaciones de pandeo', 'Coeficiente β eje y', 'Coeficiente β eje z', 'Axil NEd',
];

/** Chapa completa del payload (top 200×15 por defecto). */
function platePayload(overrides: PlatePayload = {}): PlatePayload {
  return {
    posType: 'top', b_mm: 200, t_mm: 15,
    customYBottom_mm: null, lateralAnchor: null, lateralOffset_mm: null,
    ...overrides,
  };
}

// ── Gate de modo ──────────────────────────────────────────────────────────────

describe('gate de modo (reinforced/custom)', () => {
  const CUSTOM: CompositeSectionInputs = { ...DEFAULTS, mode: 'custom' };

  it('con modo efectivo custom, el perfil y el bloque de compresión se skipean con motivo', () => {
    const p = plan({ profileType: 'HEB', profileSize: 200, Ly_m: 4, Ned_kN: 300, bcType: 'ff' }, CUSTOM);
    for (const label of ['Familia del perfil', 'Tamaño del perfil', 'Luz de pandeo Ly', 'Axil NEd', 'Vinculaciones de pandeo']) {
      expect(skipFor(p, label)?.reason).toMatch(/modo efectivo es "custom"/);
    }
    expect(p.changes).toHaveLength(0);
  });

  it('proponer el cambio de modo junto con campos del modo nuevo aplica todo', () => {
    const p = plan({ mode: 'reinforced', profileType: 'HEB', profileSize: 200 }, CUSTOM);
    expect(changeFor(p, 'Modo de la sección')).toMatchObject({
      before: 'Personalizada (solo chapas)', after: 'Perfil reforzado',
    });
    expect(changeFor(p, 'Familia del perfil')).toBeDefined();
    expect(changeFor(p, 'Tamaño del perfil')).toBeDefined();
    expect(p.fields).toMatchObject({ mode: 'reinforced', profileType: 'HEB', profileSize: 200 });
  });

  it('en modo custom, una chapa lateral invalida el array entero', () => {
    const p = plan({ plates: [platePayload(), platePayload({ posType: 'left', b_mm: 10, t_mm: null })] }, CUSTOM);
    expect(skipFor(p, 'Chapas de refuerzo')?.reason).toMatch(/Chapa 2.*solo existe en modo perfil reforzado/);
    expect(p.fields.plates).toBeUndefined();
  });
});

// ── Catálogo de perfil ────────────────────────────────────────────────────────

describe('perfil base: familia y tamaño', () => {
  it('tamaño fuera del catálogo de la familia efectiva → skip con la lista', () => {
    const p = plan({ profileSize: 250 });
    expect(skipFor(p, 'Tamaño del perfil')?.reason).toMatch(/IPE 250 no está en el catálogo/);
  });

  it('familia nueva + tamaño válidos en la familia PROPUESTA aplican juntos', () => {
    const p = plan({ profileType: 'HEB', profileSize: 200 });
    expect(changeFor(p, 'Tamaño del perfil')).toMatchObject({ before: 'IPE 300', after: 'HEB 200' });
  });

  it('cambio de familia SIN tamaño: si el vigente no existe, auto-ajuste al primero con warning', () => {
    // IPE 300 existe en HEA/HEB? No: HEA/HEB llegan a 400 pero con la serie 100..400
    // que SÍ incluye 300 — usar un tamaño IPE que no exista en HEB: 330.
    const current: CompositeSectionInputs = { ...DEFAULTS, profileSize: 330 };
    const p = plan({ profileType: 'HEB' }, current);
    expect(changeFor(p, 'Familia del perfil')).toBeDefined();
    expect(p.fields.profileSize).toBe(100); // primer tamaño de la familia HEB
    expect(p.warnings.some((w) => w.includes('no existe en la familia HEB'))).toBe(true);
  });

  it('cambio de familia con tamaño vigente compatible no toca el tamaño', () => {
    const p = plan({ profileType: 'HEB' }); // 300 existe en HEB
    expect(changeFor(p, 'Familia del perfil')).toBeDefined();
    expect(p.fields.profileSize).toBeUndefined();
  });
});

// ── Array de chapas ───────────────────────────────────────────────────────────

describe('plates: reemplazo completo del array', () => {
  it('lista válida reemplaza, con ids regenerados p1..pn y resumen formateado', () => {
    const p = plan({
      plates: [platePayload(), platePayload({ posType: 'bottom', b_mm: 200, t_mm: 15 })],
    });
    const plates = p.fields.plates as PlateEntry[];
    expect(plates).toHaveLength(2);
    expect(plates.map((pl) => pl.id)).toEqual(['p1', 'p2']);
    expect(plates[1]).toMatchObject({ posType: 'bottom', b: 200, t: 15 });
    expect(changeFor(p, 'Chapas de refuerzo')).toMatchObject({
      before: '1 chapa (sup. 200×15)',
      after: '2 chapas (sup. 200×15 · inf. 200×15)',
    });
  });

  it('lista idéntica a la vigente (con otros ids) → skip ALREADY', () => {
    const p = plan({ plates: [platePayload()] });
    expect(skipFor(p, 'Chapas de refuerzo')?.reason).toBe('Ya coincide con el valor actual');
  });

  it('un elemento inválido invalida el array ENTERO (todo-o-nada)', () => {
    const p = plan({
      plates: [platePayload(), platePayload({ posType: 'top', b_mm: 200, t_mm: null })],
    });
    expect(skipFor(p, 'Chapas de refuerzo')?.reason).toMatch(/Chapa 2: falta t_mm.*no se aplica ninguna chapa/);
    expect(p.fields.plates).toBeUndefined();
  });

  it('más de 6 chapas → skip con motivo', () => {
    const p = plan({ plates: Array.from({ length: 7 }, () => platePayload()) });
    expect(skipFor(p, 'Chapas de refuerzo')?.reason).toMatch(/superan el máximo del módulo \(6\)/);
  });

  it('lista vacía → skip (la sección necesita al menos una chapa)', () => {
    const p = plan({ plates: [] });
    expect(skipFor(p, 'Chapas de refuerzo')?.reason).toMatch(/al menos una chapa/);
  });

  it('lateral: b es el ESPESOR (rango 3–100), t se ignora con warning, anchor default web', () => {
    const p = plan({
      plates: [platePayload(), platePayload({ posType: 'left', b_mm: 10, t_mm: 12 })],
    });
    const plates = p.fields.plates as PlateEntry[];
    expect(plates[1]).toMatchObject({ posType: 'left', b: 10, lateralAnchor: 'web', lateralOffset: 0 });
    expect(p.warnings.some((w) => w.includes('t_mm se ignora en las chapas laterales'))).toBe(true);
  });

  it('lateral con espesor de platabanda (200) → elemento inválido → array entero fuera', () => {
    const p = plan({
      plates: [platePayload({ posType: 'right', b_mm: 200, t_mm: null })],
    });
    expect(skipFor(p, 'Chapas de refuerzo')?.reason).toMatch(/espesor 200 mm fuera del rango 3–100/);
  });

  it('posType custom exige customYBottom_mm', () => {
    const sin = plan({ plates: [platePayload({ posType: 'custom', customYBottom_mm: null })] });
    expect(skipFor(sin, 'Chapas de refuerzo')?.reason).toMatch(/requiere customYBottom_mm/);
    const con = plan({ plates: [platePayload({ posType: 'custom', customYBottom_mm: 120 })] });
    const plates = con.fields.plates as PlateEntry[];
    expect(plates[0]).toMatchObject({ posType: 'custom', customYBottom: 120 });
  });
});

// ── Escalares del bloque de compresión ────────────────────────────────────────

describe('compresión: conversiones y gates', () => {
  it('Ly_m/Lz_m se convierten a mm internos', () => {
    const p = plan({ Ly_m: 4.2, Lz_m: 2.1 });
    expect(p.fields.Ly).toBe(4200);
    expect(p.fields.Lz).toBe(2100);
    expect(changeFor(p, 'Luz de pandeo Ly')).toMatchObject({ before: '3.50 m', after: '4.20 m' });
  });

  it('β sin bcType custom efectivo → skip con motivo', () => {
    const p = plan({ beta_y: 0.7 });
    expect(skipFor(p, 'Coeficiente β eje y')?.reason).toMatch(/solo es editable con vinculaciones "custom"/);
  });

  it('bcType custom + β en el mismo turno aplican juntos', () => {
    const p = plan({ bcType: 'custom', beta_y: 0.7, beta_z: 1.2 });
    expect(changeFor(p, 'Vinculaciones de pandeo')).toMatchObject({
      before: 'Biarticulado (β=1.0)', after: 'Personalizado (β manuales)',
    });
    expect(p.fields).toMatchObject({ bcType: 'custom', beta_y: 0.7, beta_z: 1.2 });
  });

  it('Ned negativo o desorbitado → skip por rango', () => {
    expect(skipFor(plan({ Ned_kN: -50 }), 'Axil NEd')?.reason).toMatch(/fuera del rango/);
    expect(skipFor(plan({ Ned_kN: 99999 }), 'Axil NEd')?.reason).toMatch(/fuera del rango/);
  });
});

// ── Payload todo-null y notFound ─────────────────────────────────────────────

describe('payload todo-null', () => {
  it('sin cambios, sin skips, y notFound lista los 11 campos en ORDER', () => {
    const p = plan({});
    expect(p.changes).toHaveLength(0);
    expect(p.skipped).toHaveLength(0);
    expect(p.notFound).toEqual(ALL_LABELS);
    expect(p.risks).toEqual([]);
  });

  it('payload no-objeto → AiError bad-response', () => {
    expect(() => compositeSectionAdapter.buildPlan('garbage', DEFAULTS, 'si')).toThrow();
  });
});

// ── Snapshot ──────────────────────────────────────────────────────────────────

describe('snapshot {valores, sin_confirmar}', () => {
  const snapshotOf = (c: CompositeSectionInputs) =>
    JSON.parse(compositeSectionAdapter.snapshot(c)) as {
      valores: Record<string, unknown>;
      sin_confirmar: string[];
    };

  it('valores usa las claves del payload (sin warnings) y el array en forma de payload', () => {
    const snap = snapshotOf(DEFAULTS);
    const schemaKeys = Object.keys(
      (compositeSectionAdapter.payloadSchema as { properties: Record<string, unknown> }).properties,
    ).filter((k) => k !== 'warnings');
    expect(Object.keys(snap.valores)).toEqual(schemaKeys);
    expect(snap.valores.Ly_m).toBe(3.5);
    expect(snap.valores.plates).toEqual([
      { posType: 'top', b_mm: 200, t_mm: 15, customYBottom_mm: null, lateralAnchor: null, lateralOffset_mm: null },
    ]);
  });

  it('estado de fábrica → todo sin_confirmar (plates incluido, aunque los ids difieran)', () => {
    const withOtherIds: CompositeSectionInputs = {
      ...DEFAULTS,
      plates: [{ ...DEFAULTS.plates[0], id: 'p9' }],
    };
    expect(snapshotOf(withOtherIds).sin_confirmar).toEqual([
      'mode', 'profileType', 'profileSize', 'grade', 'plates',
      'Ly_m', 'Lz_m', 'bcType', 'beta_y', 'beta_z', 'Ned_kN',
    ]);
  });

  it('chapas tocadas → plates sale de sin_confirmar', () => {
    const touched: CompositeSectionInputs = {
      ...DEFAULTS,
      plates: [{ id: 'p1', b: 250, t: 15, posType: 'top', customYBottom: 0 }],
    };
    expect(snapshotOf(touched).sin_confirmar).not.toContain('plates');
  });

  it('metadatos del adapter', () => {
    expect(compositeSectionAdapter.id).toBe('composite-section');
    expect(compositeSectionAdapter.label).toBe('Sección compuesta');
    expect(compositeSectionAdapter.placeholder).toMatch(/IPE 300/);
    expect(compositeSectionAdapter.resultsRecalc).toBeUndefined(); // recálculo vivo
  });
});

// ── Guardarraíles ─────────────────────────────────────────────────────────────

describe('riesgos de seguridad', () => {
  it('bajar el axil CONFIRMADO marca riesgo; las chapas jamás (diseño libre)', () => {
    const current: CompositeSectionInputs = { ...DEFAULTS, Ned: 800 };
    const p = plan({ Ned_kN: 400, plates: [platePayload({ b_mm: 100, t_mm: 8 })] }, current);
    expect(p.risks).toHaveLength(1);
    expect(p.risks[0]).toMatchObject({ field: 'Ned', label: 'Axil NEd' });
  });

  it('gate anti-ruido: primera extracción sobre defaults no marca', () => {
    const p = plan({ Ned_kN: 400, Ly_m: 3.0 });
    // Ned default 0 → subirlo no es riesgo; Ly bajar de 3.5 a 3.0 con Ly en default → gate cerrado.
    expect(p.risks).toEqual([]);
  });

  it('acortar la luz de pandeo confirmada y relajar bcType confirmado marcan', () => {
    const current: CompositeSectionInputs = { ...DEFAULTS, Ly: 5000, bcType: 'fc' };
    const p = plan({ Ly_m: 3.0, bcType: 'ff' }, current);
    // bcType ya no tiene regla propia: el riesgo es sobre la β EFECTIVA (fuga 2),
    // y va DESPUÉS de los escalares porque detectResolvedRisks se concatena al final.
    expect(p.risks.map((r) => r.field)).toEqual(['Ly', 'beta_y_efectiva', 'beta_z_efectiva']);
    expect(p.risks[1].why).toMatch(/vinculaciones reales/i);
  });
});

// ── Resumen de resultados (motor real) ────────────────────────────────────────

describe('summarizeCompositeSectionResults', () => {
  it('reforzada de fábrica: fila sintética de clase + propiedades + MRd + compresión', () => {
    const r = calcCompositeSection(DEFAULTS);
    expect(r.valid).toBe(true);
    const s = summarizeCompositeSectionResults(r);
    expect(s.text).toContain('Clase de la sección');
    expect(s.text).toContain('CLASE');
    expect(s.text).toContain('Propiedades: A = ');
    expect(s.text).toContain('MRd,y = ');
    // Ned=0: bloque de compresión calculado (capacidad) — la línea existe
    expect(s.text).toContain('Nc,Rd');
  });

  it('clase ≤ 2 sin fallos → verdict coherente con el ambient de la UI', () => {
    const r = calcCompositeSection(DEFAULTS);
    const s = summarizeCompositeSectionResults(r);
    if (r.class4Warning) expect(s.verdict).toBe('fail');
    else if (r.sectionClass === 3) expect(['warn', 'fail']).toContain(s.verdict);
    else expect(['ok', 'warn', 'fail']).toContain(s.verdict);
  });

  it('chapa esbelta en modo custom → class4Warning → INCUMPLE con aviso de MRd', () => {
    const inp: CompositeSectionInputs = {
      ...DEFAULTS,
      mode: 'custom',
      plates: [{ id: 'p1', b: 500, t: 4, posType: 'top', customYBottom: 0 }],
    };
    const r = calcCompositeSection(inp);
    expect(r.class4Warning).toBe(true);
    const s = summarizeCompositeSectionResults(r);
    expect(s.verdict).toBe('fail');
    expect(s.text).toContain('INCUMPLE');
    expect(s.text).toContain('MRd no disponible');
  });

  it('modo custom sano → fila de clase NEUTRAL "N/A (modo custom)" y sin bloque de compresión', () => {
    const inp: CompositeSectionInputs = {
      ...DEFAULTS,
      mode: 'custom',
      plates: [
        { id: 'p1', b: 200, t: 20, posType: 'top', customYBottom: 0 },
        { id: 'p2', b: 200, t: 20, posType: 'custom', customYBottom: 300 },
      ],
    };
    const r = calcCompositeSection(inp);
    expect(r.sectionClass).toBeNull();
    const s = summarizeCompositeSectionResults(r);
    expect(s.text).toContain('N/A (modo custom)');
    expect(s.text).not.toContain('Nc,Rd');
  });

  it('axil muy superior a la capacidad → fallo de compresión vuelca el veredicto', () => {
    const inp: CompositeSectionInputs = { ...DEFAULTS, Ned: 50000 };
    const r = calcCompositeSection(inp);
    expect(r.compApplicable).toBe(true);
    const s = summarizeCompositeSectionResults(r);
    expect(s.verdict).toBe('fail');
  });

  it('cálculo inválido → verdict invalid con el error del motor', () => {
    const inp: CompositeSectionInputs = { ...DEFAULTS, mode: 'custom', plates: [] };
    const r = calcCompositeSection(inp);
    expect(r.error).toBeDefined();
    const s = summarizeCompositeSectionResults(r);
    expect(s.verdict).toBe('invalid');
    expect(s.text).toContain('CÁLCULO NO VÁLIDO');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5ª FAMILIA de la auditoría (2026-07-14) — pasar a modo "custom" dejando chapas
// laterales (o sin chapas) deja el módulo INVÁLIDO. buildPlan revierte el cambio
// de modo propuesto (la sección se queda "reforzada", que sí admite laterales) y
// lo explica. Solo se toca si el modo se propone: un estado ya custom no se altera.
// ─────────────────────────────────────────────────────────────────────────────
describe('composite — modo custom no puede dejar el módulo inválido (5ª familia)', () => {
  const MODO = 'Modo de la sección';
  const conLateral: CompositeSectionInputs = {
    ...DEFAULTS,
    plates: [{ id: 'l1', b: 12, t: 10, posType: 'left', customYBottom: 0 }],
  };

  /** El estado FINAL tras el plan pasa el motor (sin inválido por modo/chapas). */
  const finalIsValid = (p: ReturnType<typeof plan>, current: CompositeSectionInputs) => {
    const res = calcCompositeSection({ ...current, ...p.fields });
    return res.error == null || !/lateral no disponible|Sin elementos/.test(res.error);
  };

  it('mode→custom SIN reproponer chapas, con laterales vigentes → modo REVERTIDO + motivo', () => {
    const p = plan({ mode: 'custom' }, conLateral);
    expect(p.fields).not.toHaveProperty('mode');
    expect(changeFor(p, MODO)).toBeUndefined();
    expect(skipFor(p, MODO)?.reason).toMatch(/chapas laterales/);
    expect(skipFor(p, MODO)?.reason).toMatch(/en el MISMO turno/);
    expect(finalIsValid(p, conLateral)).toBe(true);
  });

  it('mode→custom reproponiendo chapas COMPATIBLES (sin laterales) SÍ se aplica', () => {
    const p = plan({
      mode: 'custom',
      plates: [{ posType: 'top', b_mm: 200, t_mm: 15, customYBottom_mm: null, lateralAnchor: null, lateralOffset_mm: null }],
    }, conLateral);
    expect(p.fields.mode).toBe('custom');
    expect(p.fields.plates).toBeDefined();
    expect(skipFor(p, MODO)).toBeUndefined();
    expect(finalIsValid(p, conLateral)).toBe(true);
  });

  it('mode→custom con la sección ya en top/bottom (sin laterales) SÍ se aplica', () => {
    // DEFAULTS = reinforced + 1 chapa top ⇒ custom la admite: no hay que bloquear.
    const p = plan({ mode: 'custom' }, DEFAULTS);
    expect(p.fields.mode).toBe('custom');
    expect(skipFor(p, MODO)).toBeUndefined();
    expect(finalIsValid(p, DEFAULTS)).toBe(true);
  });

  it('estado ya custom con laterales (pre-existente): no se propone modo ⇒ no hay skip espurio', () => {
    const yaCustom: CompositeSectionInputs = { ...conLateral, mode: 'custom' };
    const p = plan({ grade: 'S355' }, yaCustom); // cambio ajeno
    expect(p.fields.grade).toBe('S355');
    expect(skipFor(p, MODO)).toBeUndefined();
  });
});
