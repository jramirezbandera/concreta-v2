// FEM 2D — Fases 1 y 2 del design doc "retirar el rol de barra del enrutado":
// el invariante de auditoría, la guarda de cobertura del registro, y la
// PRUEBA DE NO-REGRESIÓN de la Fase 2.
//
// Cuatro cosas que este fichero tiene que demostrar, en este orden:
//   1. COBERTURA — todo id de fila que cualquier motor emite está clasificado
//      en mechanisms.ts. Es lo que impide que el registro envejezca en silencio.
//   2. CERO RUIDO — las cuatro plantillas por defecto no señalan nada.
//   3. NO-REGRESIÓN DE FASE 2 — la barra que en Fase 1 llevaba la fila de
//      discrepancia (pilar inclinado 15° → 'viga' → sin §6.3.3) lleva ahora la
//      fila de comprobación REAL (int1/int2 del motor de pilares, que corre
//      por DEMANDA de compresión, no por etiqueta). Silencio con cobertura,
//      no silencio por borrado.
//   4. F4 — una barra sin demanda no puede volverse PENDIENTE por el invariante.

import { describe, expect, it } from 'vitest';
import {
  beamColumn,
  fem2dModel,
  memberUdl,
  node2d,
  nodeLoad,
  support2d,
} from '../../features/fem2d/builder';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import {
  MECHANISMS,
  MECH_PRESENT_MIN_ETA,
  NON_MECHANISM_ROWS,
  auditMechanisms,
  estimateMnInteraction,
  type MechanismId,
} from '../../features/fem2d/mechanisms';
import {
  gableTemplate,
  multistoryTemplate,
  portalFrameTemplate,
  prattTrussTemplate,
} from '../../features/fem2d/templates';
import type { Fem2DModel } from '../../features/fem2d/types';

const TEMPLATES = [
  ['Pratt', () => prattTrussTemplate.build(prattTrussTemplate.defaults())],
  ['Pórtico', () => portalFrameTemplate.build(portalFrameTemplate.defaults())],
  ['Multiplanta', () => multistoryTemplate.build(multistoryTemplate.defaults())],
  ['Gable', () => gableTemplate.build(gableTemplate.defaults())],
] as const;

/** Todo id declarado en el registro, en cualquier mecanismo o material. */
const CLASSIFIED = new Set<string>([
  ...NON_MECHANISM_ROWS,
  ...Object.values(MECHANISMS).flatMap((s) => [...s.rows.steel, ...s.rows.rc, ...s.rows.timber]),
  // Filas que emite el propio invariante.
  'mn-no-comprobada',
  'flecha-no-comprobada',
]);

function allRowIds(model: Fem2DModel): string[] {
  const r = analyzeFem2D(model);
  expect(r.checks, 'el modelo debe resolver').not.toBeNull();
  const ids: string[] = [];
  for (const v of Object.values(r.checks!.perMember)) {
    for (const c of v.checks) ids.push(c.id);
  }
  return ids;
}

describe('Fase 1 — cobertura del registro de mecanismos', () => {
  it('todo id emitido por las cuatro plantillas está clasificado en mechanisms.ts', () => {
    const seen = new Set<string>();
    for (const [, build] of TEMPLATES) {
      for (const id of allRowIds(build())) seen.add(id);
    }
    // Guarda anti-vacío: si el pipeline no emitiera nada, el test pasaría solo.
    expect(seen.size).toBeGreaterThan(8);

    const unknown = [...seen].filter((id) => !CLASSIFIED.has(id) && !id.startsWith('rev:'));
    expect(
      unknown,
      `Ids sin clasificar en mechanisms.ts: ${unknown.join(', ')}. ` +
        'Añádelos al mecanismo que acreditan o a NON_MECHANISM_ROWS — si no, el ' +
        'invariante puede estar dando por comprobado un mecanismo que nadie comprobó.',
    ).toEqual([]);
  });

  it('el registro no declara ids duplicados entre mecanismos del mismo material', () => {
    // Un id que acredite DOS mecanismos distintos haría que comprobar uno
    // silenciara el otro. Se permite a propósito en los pares documentados
    // (comb-623/624 acreditan flexión, pandeo Y su interacción en EC5, porque
    // la ecuación es literalmente la misma).
    const EXPECTED_SHARED = new Set(['comb-623', 'comb-624', 'mn-vano', 'mn-apoyo',
      'nm-y', 'nm-z', 'nm-res', 'tension-bending', 'bending', 'biaxial-check',
      'lambda-y', 'lambda-z', 'flexion-check', 'bending-over', 'deflection']);
    for (const material of ['steel', 'rc', 'timber'] as const) {
      const count = new Map<string, MechanismId[]>();
      for (const [mech, spec] of Object.entries(MECHANISMS) as [MechanismId, typeof MECHANISMS[MechanismId]][]) {
        for (const id of spec.rows[material]) {
          count.set(id, [...(count.get(id) ?? []), mech]);
        }
      }
      const shared = [...count.entries()].filter(([, ms]) => ms.length > 1).map(([id]) => id);
      const unexpected = shared.filter((id) => !EXPECTED_SHARED.has(id));
      expect(unexpected, `${material}: ids compartidos no documentados`).toEqual([]);
    }
  });
});

// ── Qué disparan las plantillas por defecto ─────────────────────────────────
//
// Las cuatro salen limpias, y llegar aquí costó un error que conviene dejar
// escrito para no repetirlo. Un primer cribado alimentado con la fila
// `axial-buckling` que se MUESTRA marcaba el dintel del pórtico y los faldones
// del gable. No era un hallazgo: esa fila usa el eje DÉBIL con la longitud
// completa (comprobación autónoma de compresión, correcta como tal), mientras
// que el primer término de la ec. 6.61 se divide por χ_y, el eje FUERTE. En el
// dintel IPE240 la diferencia es 0.238 frente a 0.041 — factor 6 — y con el
// número correcto la interacción estimada baja de 1.13 a 0.84.
//
// Moraleja para quien toque esto: un cribado normativo tiene que alimentarse
// del término que pide la ecuación, no del que casualmente está a mano en la
// pantalla.
const EXPECTED_GAPS: Record<string, string[]> = {
  Pratt: [], // cordones: η_N≈0.04 · η_LTB≈0.09 ⇒ nada que auditar
  Pórtico: [], // dintel: η_N=0.041 (eje fuerte) · η_LTB=0.78 ⇒ η_est ≈ 0.84
  Multiplanta: [],
  Gable: [], // faldones: mismo caso que el dintel del pórtico
};

describe('Fase 1 — qué señalan las plantillas por defecto', () => {
  it.each(TEMPLATES)('la plantilla %s señala exactamente las barras esperadas', (name, build) => {
    const r = analyzeFem2D(build());
    expect(r.checks).not.toBeNull();
    const flagged = Object.values(r.checks!.perMember)
      .filter((v) => v.checks.some((c) => c.id === 'mn-no-comprobada'))
      .map((v) => v.memberId)
      .sort();
    expect(flagged, `si esto cambia, revisa por qué antes de tocar el test`).toEqual(
      EXPECTED_GAPS[name],
    );
  });

  it('las barras señaladas quedan PENDIENTE y ninguna otra se contagia', () => {
    for (const [name, build] of TEMPLATES) {
      const r = analyzeFem2D(build());
      const pendings = Object.values(r.checks!.perMember)
        .filter((v) => v.status === 'pending')
        .map((v) => v.memberId)
        .sort();
      // El contagio solo puede venir del invariante: ninguna plantilla tiene
      // motores inválidos ni perfiles sin soporte en su configuración default.
      expect(pendings, name).toEqual(EXPECTED_GAPS[name]);
    }
  });
});

// ── La prueba de no-regresión de la Fase 2 ──────────────────────────────────
//
// Pórtico con el pilar IZQUIERDO inclinado 15° respecto a la vertical. En el
// mundo del rol, inferRole (±10°) lo llamaba 'viga' y perdía la interacción
// §6.3.3 — el hallazgo que motivó todo el design doc; la Fase 1 lo cazaba con
// la fila de discrepancia. Con el enrutado por MECANISMO el motor de pilares
// corre por demanda de compresión y la interacción se comprueba DE VERDAD:
// silencio con cobertura, no silencio por borrado.

function rakedPortal(tilt_m: number, axial_kN: number, udl: number): Fem2DModel {
  // n1 (base izq) → n2 (cabeza izq): inclinada `tilt_m` en x sobre 4 m de alto.
  const nodes = [
    node2d('n1', 0, 0),
    node2d('n2', tilt_m, 4),
    node2d('n3', 6, 4),
    node2d('n4', 6, 0),
  ];
  // HEB240: perfil de pilar realista y con vuelco lateral holgado.
  const steelSelection = { profileKey: 'steel_HEB240', steel: 'S275' as const };
  const members = [
    beamColumn('p1', 'n1', 'n2', { steelSelection }),
    beamColumn('v1', 'n2', 'n3', { steelSelection, ltbSpacing: 1.5 }),
    beamColumn('p2', 'n4', 'n3', { steelSelection }),
  ];
  return fem2dModel({
    templateId: 'custom',
    selfWeight: false,
    nodes,
    members,
    supports: [support2d('n1', 'fixed'), support2d('n4', 'fixed')],
    loads: [
      nodeLoad('l1', 'n2', { lc: 'G', Fy: -axial_kN }),
      memberUdl('l2', 'v1', { lc: 'Q', useCategory: 'B', wy: -udl }),
      memberUdl('l3', 'p1', { lc: 'W', wx: 0.3 }), // viento: mete flexión en el pilar
    ],
  });
}

describe('Fase 2 — el pilar inclinado 15° lleva la comprobación REAL, no la discrepancia', () => {
  it('la barra inclinada corre el motor de pilares por demanda: int1/int2 presentes, sin gap', () => {
    // tan(15°)·4 m = 1.072 m — el caso que el umbral ±10° de inferRole perdía.
    const model = rakedPortal(1.072, 600, 4);
    const r = analyzeFem2D(model);
    expect(r.checks).not.toBeNull();

    const p1 = r.checks!.perMember['p1'];
    expect(p1, 'la barra p1 debe tener veredicto').toBeDefined();
    const dump = p1.checks.map((c) => `${c.id}=${c.eta.toFixed(3)}`).join(' ');

    // La interacción §6.3.3 se comprueba DE VERDAD (antes: fila de discrepancia).
    expect(p1.checks.some((c) => c.id === 'int1' || c.id === 'int2'), dump).toBe(true);
    expect(p1.checks.some((c) => c.id === 'mn-no-comprobada')).toBe(false);
    // Y el veredicto es un veredicto, no un gris: la barra está cubierta.
    expect(p1.status, dump).not.toBe('pending');
  });

  it('el mismo pórtico con el pilar VERTICAL comprueba lo mismo — la geometría ya no cambia la cobertura', () => {
    const r = analyzeFem2D(rakedPortal(0, 600, 4));
    const p1 = r.checks!.perMember['p1'];
    expect(p1.checks.some((c) => c.id === 'int1')).toBe(true);
    expect(p1.checks.some((c) => c.id === 'mn-no-comprobada')).toBe(false);
  });

  it('el ORÁCULO sigue armado: filas separadas sin interacción disparan el invariante', () => {
    // Si un refactor futuro volviera a perder int1/int2 (p. ej. reintroduciendo
    // un filtro), el invariante lo caza — simulado aquí con las filas que
    // beamChecks emitiría a solas, con el η_N del eje fuerte relevante.
    const gaps = auditMechanisms(
      'steel',
      [
        { id: 'bending', name: '', val: '', eta: 0.6, ref: '' },
        { id: 'axial-buckling', name: '', val: '', eta: 0.5, ref: '' },
      ],
      { etaNMajor: 0.5 },
    );
    expect(gaps.some((g) => g.mechanism === 'mn-interaction')).toBe(true);
    expect(gaps[0].row.ref).toContain('6.3.3');
  });
});

// ── F4: cero demanda es un veredicto VÁLIDO ─────────────────────────────────

describe('Fase 1 — F4: el invariante no contagia PENDIENTE a barras poco cargadas', () => {
  it('los montantes de la Pratt con η despreciable siguen en verde', () => {
    const r = analyzeFem2D(prattTrussTemplate.build(prattTrussTemplate.defaults()));
    const montantes = Object.values(r.checks!.perMember).filter((v) => v.group === 'montante');
    expect(montantes.length).toBeGreaterThan(0);
    const flojos = montantes.filter((v) => v.eta < 0.05);
    expect(flojos.length, 'la Pratt por defecto tiene montantes casi descargados').toBeGreaterThan(0);
    for (const v of flojos) {
      expect(v.status, `${v.memberId} η=${v.eta.toFixed(3)}`).toBe('ok');
      expect(v.checks.some((c) => c.id === 'mn-no-comprobada')).toBe(false);
    }
  });

  it('sin filas, o con filas a η nulo, el invariante no inventa nada', () => {
    // checks.ts nunca llega a auditar una barra sin esfuerzos (el retorno F4 se
    // dispara antes), pero el invariante tiene que ser inofensivo igualmente:
    // si algún día alguien mueve la llamada, no debe empezar a agrisar barras.
    expect(auditMechanisms('steel', [])).toEqual([]);
    expect(auditMechanisms('rc', [])).toEqual([]);
    expect(auditMechanisms('timber', [])).toEqual([]);
    expect(
      auditMechanisms('steel', [
        { id: 'bending', name: '', val: '', eta: 0, ref: '' },
        { id: 'axial-buckling', name: '', val: '', eta: 0, ref: '' },
      ]),
    ).toEqual([]);
  });
});

// ── Los umbrales, probados directamente ─────────────────────────────────────

describe('Fase 1 — umbral del invariante (OQ1)', () => {
  const row = (id: string, eta: number) => ({ id, name: id, val: '', eta, ref: '' });

  it('la estimación de la 6.61 es monótona y del lado de la seguridad', () => {
    // Nunca por debajo de la suma cruda (k_yy ≥ 1) ni por debajo de cada término.
    for (const n of [0, 0.1, 0.3, 0.6, 0.9]) {
      for (const m of [0, 0.1, 0.3, 0.6, 0.9]) {
        const e = estimateMnInteraction(n, m);
        expect(e).toBeGreaterThanOrEqual(n + m - 1e-12);
        expect(e).toBeGreaterThanOrEqual(n);
        expect(e).toBeGreaterThanOrEqual(m);
      }
    }
    expect(estimateMnInteraction(0.5, 0.5)).toBeGreaterThan(estimateMnInteraction(0.4, 0.5));
  });

  it('no dispara cuando la interacción estimada no puede cambiar el color', () => {
    // Los cordones de la Pratt viven aquí (η_N≈0.15, η_LTB≈0.09 ⇒ η_est≈0.25).
    const gaps = auditMechanisms('steel', [row('bending', 0.09), row('axial-buckling', 0.15)]);
    expect(gaps).toEqual([]);
  });

  it('no dispara si uno de los dos mecanismos es despreciable', () => {
    // η_M ≈ 0 ⇒ la "interacción" degenera en el pandeo, que ya tiene su fila.
    expect(auditMechanisms('steel', [row('axial-buckling', 0.9), row('bending', 0.01)])).toEqual([]);
    // η_N ≈ 0 ⇒ degenera en el vuelco, que también la tiene.
    expect(auditMechanisms('steel', [row('bending', 0.9), row('axial-buckling', 0.01)])).toEqual([]);
  });

  it('dispara cuando el verde de hoy sería falso', () => {
    // Las dos filas separadas pasan holgadas, la interacción no: es el caso.
    const gaps = auditMechanisms('steel', [row('bending', 0.7), row('axial-buckling', 0.25)]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].mechanism).toBe('mn-interaction');
    expect(gaps[0].row.eta).toBe(0); // no inventa utilización: solo marca pendiente
    expect(gaps[0].row.val).toContain('interacción estimada');
  });

  it('usa la fila de VUELCO y no la de flexión pura cuando la hay', () => {
    // χ_LT ya está dentro de la fila ltb: es el denominador correcto de la 6.61.
    // Con bending=0.3 solo no dispararía; con ltb=0.7 sí.
    expect(auditMechanisms('steel', [row('bending', 0.3), row('axial-buckling', 0.25)])).toEqual([]);
    expect(
      auditMechanisms('steel', [row('bending', 0.3), row('ltb', 0.7), row('axial-buckling', 0.25)]),
    ).toHaveLength(1);
  });

  it('no dispara si la interacción YA está comprobada', () => {
    const gaps = auditMechanisms('steel', [row('bending', 0.8), row('axial-buckling', 0.7), row('int1', 0.9)]);
    expect(gaps).toEqual([]);
    expect(auditMechanisms('steel', [row('ltb', 0.8), row('Nby', 0.7), row('int2', 0.9)])).toEqual([]);
  });

  it('la madera nunca dispara: EC5 6.23/6.24 SON la interacción', () => {
    const gaps = auditMechanisms('timber', [row('comb-623', 0.8), row('comb-624', 0.7)]);
    expect(gaps).toEqual([]);
  });

  it('MECH_PRESENT_MIN_ETA está por encima del suelo de impresión de checks.ts', () => {
    // AXIAL_ROW_MIN_ETA vale 0.01 y es un suelo de RUIDO DE IMPRESIÓN, no de
    // relevancia mecánica: auditar ahí sería ruido máximo (OQ1 del design doc).
    expect(MECH_PRESENT_MIN_ETA).toBeGreaterThan(0.01);
  });
});
