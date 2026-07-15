// Tests de los guardarraíles de seguridad del asistente (lib/ai/safety.ts):
//   - Niveles: higherIsSafer / lowerIsSafer / unfactoredIsSafer, incluido el
//     null defensivo ante tipos inesperados, NaN e Infinity.
//   - detectSafetyRisks: solo marca las BAJADAS de nivel, con las etiquetas y
//     los valores formateados del SafetyChange (nunca los crudos).
//   - GATE ANTI-RUIDO: un valor que sigue siendo el de fábrica NO genera aviso
//     (rellenar el formulario ≠ debilitar un dato ya fijado); `alwaysCheck` lo
//     desactiva.
//   - Defensivo (campo sin regla, sin valor propuesto, nivel null) y orden.
// Módulo puro: fixtures sintéticos, sin acoplarse a ningún módulo real.

import { describe, it, expect } from 'vitest';
import {
  higherIsSafer,
  lowerIsSafer,
  unfactoredIsSafer,
  trueIsSafer,
  ordinalLevel,
  detectSafetyRisks,
  detectElementRisks,
  type ElementSafetyRule,
  type SafetyChange,
  type SafetyRule,
} from '../../lib/ai/safety';

/** Módulo de juguete: una demanda, un criterio del terreno, un conmutador y una variable de diseño. */
interface Toy {
  carga: number; // demanda: bajarla es peligroso
  sigma: number; // σadm del terreno: subirla es peligroso
  mayoradas: boolean; // false (sin mayorar) es el lado seguro
  perfil: string; // resistencia: variable de diseño libre, sin regla
}

const DEFAULTS: Toy = { carga: 5, sigma: 200, mayoradas: false, perfil: 'IPE200' };

const WHY_CARGA = 'La carga la fija el proyecto, no el cálculo.';
const WHY_SIGMA = 'La tensión admisible la fija el estudio geotécnico.';
const WHY_MAYORADAS = 'Marcar cargas de servicio como mayoradas elimina los γ.';

const RULES: ReadonlyArray<SafetyRule<Toy>> = [
  { field: 'carga', level: higherIsSafer, why: WHY_CARGA },
  { field: 'sigma', level: lowerIsSafer, why: WHY_SIGMA },
  // alwaysCheck: reinterpreta el cálculo entero aunque venga del default.
  { field: 'mayoradas', level: unfactoredIsSafer, why: WHY_MAYORADAS, alwaysCheck: true },
];

const change = (field: string, before: string, after: string, label = field): SafetyChange => ({
  field,
  label,
  before,
  after,
});

describe('higherIsSafer', () => {
  it('devuelve el propio valor numérico', () => {
    expect(higherIsSafer(5)).toBe(5);
    expect(higherIsSafer(0)).toBe(0);
    expect(higherIsSafer(-3.5)).toBe(-3.5);
  });

  it('devuelve null ante tipo incorrecto, NaN o Infinity', () => {
    expect(higherIsSafer('5')).toBeNull();
    expect(higherIsSafer(true)).toBeNull();
    expect(higherIsSafer(null)).toBeNull();
    expect(higherIsSafer(undefined)).toBeNull();
    expect(higherIsSafer({})).toBeNull();
    expect(higherIsSafer(NaN)).toBeNull();
    expect(higherIsSafer(Infinity)).toBeNull();
    expect(higherIsSafer(-Infinity)).toBeNull();
  });
});

describe('lowerIsSafer', () => {
  it('devuelve el valor con el signo invertido', () => {
    expect(lowerIsSafer(200)).toBe(-200);
    expect(lowerIsSafer(-2.5)).toBe(2.5);
  });

  it('devuelve null ante tipo incorrecto, NaN o Infinity', () => {
    expect(lowerIsSafer('200')).toBeNull();
    expect(lowerIsSafer(false)).toBeNull();
    expect(lowerIsSafer(null)).toBeNull();
    expect(lowerIsSafer(undefined)).toBeNull();
    expect(lowerIsSafer([])).toBeNull();
    expect(lowerIsSafer(NaN)).toBeNull();
    expect(lowerIsSafer(Infinity)).toBeNull();
    expect(lowerIsSafer(-Infinity)).toBeNull();
  });
});

describe('unfactoredIsSafer', () => {
  it('false (sin mayorar) es el nivel ALTO y true el bajo', () => {
    expect(unfactoredIsSafer(false)).toBe(1);
    expect(unfactoredIsSafer(true)).toBe(0);
  });

  it('solo acepta boolean: 0/1 y "false" no son niveles (nada de falsy)', () => {
    expect(unfactoredIsSafer(0)).toBeNull();
    expect(unfactoredIsSafer(1)).toBeNull();
    expect(unfactoredIsSafer('false')).toBeNull();
    expect(unfactoredIsSafer('')).toBeNull();
    expect(unfactoredIsSafer(null)).toBeNull();
    expect(unfactoredIsSafer(undefined)).toBeNull();
    expect(unfactoredIsSafer(NaN)).toBeNull();
    expect(unfactoredIsSafer(Infinity)).toBeNull();
  });
});

describe('trueIsSafer (ola 2 — el hasWater de muros)', () => {
  it('true es el nivel ALTO y false el bajo: simétrico de falseIsSafer', () => {
    expect(trueIsSafer(true)).toBe(1);
    expect(trueIsSafer(false)).toBe(0);
  });

  it('solo acepta boolean (nada de falsy)', () => {
    expect(trueIsSafer(1)).toBeNull();
    expect(trueIsSafer(0)).toBeNull();
    expect(trueIsSafer('true')).toBeNull();
    expect(trueIsSafer(null)).toBeNull();
    expect(trueIsSafer(undefined)).toBeNull();
  });
});

describe('detectSafetyRisks — gate anti-ruido', () => {
  it('marca la bajada de un valor CONFIRMADO (vigente ≠ fábrica)', () => {
    const risks = detectSafetyRisks<Toy>(
      RULES,
      [change('carga', '8,00 kN/m', '2,00 kN/m', 'Carga qk')],
      { carga: 2 },
      { ...DEFAULTS, carga: 8 },
      DEFAULTS,
    );
    expect(risks).toHaveLength(1);
    // field/label/before/after salen del SafetyChange (texto ya formateado con
    // su sistema de unidades), NO de los valores crudos; `why` sale de la regla.
    expect(risks[0]).toEqual({
      field: 'carga',
      label: 'Carga qk',
      before: '8,00 kN/m',
      after: '2,00 kN/m',
      why: WHY_CARGA,
    });
  });

  it('NO marca la bajada de un valor que sigue siendo el de FÁBRICA', () => {
    // El caso que evita que el aviso salte en toda primera extracción: bajar el
    // default al aportar el dato real del problema es rellenar el formulario.
    const risks = detectSafetyRisks<Toy>(
      RULES,
      [change('carga', '5,00 kN/m', '2,00 kN/m')],
      { carga: 2 },
      { ...DEFAULTS },
      DEFAULTS,
    );
    expect(risks).toEqual([]);
  });

  it('alwaysCheck salta aunque el valor vigente sea el de fábrica', () => {
    const risks = detectSafetyRisks<Toy>(
      RULES,
      [change('mayoradas', 'No', 'Sí', 'Cargas mayoradas')],
      { mayoradas: true },
      { ...DEFAULTS }, // mayoradas = false = el default
      DEFAULTS,
    );
    expect(risks).toHaveLength(1);
    expect(risks[0].field).toBe('mayoradas');
    expect(risks[0].why).toBe(WHY_MAYORADAS);
  });
});

describe('detectSafetyRisks — dirección del cambio', () => {
  it('subir un campo higherIsSafer no genera riesgo', () => {
    const risks = detectSafetyRisks<Toy>(
      RULES,
      [change('carga', '8,00 kN/m', '12,00 kN/m')],
      { carga: 12 },
      { ...DEFAULTS, carga: 8 },
      DEFAULTS,
    );
    expect(risks).toEqual([]);
  });

  it('SUBIR la σadm del terreno (lowerIsSafer) genera riesgo', () => {
    const risks = detectSafetyRisks<Toy>(
      RULES,
      [change('sigma', '150 kPa', '300 kPa', 'σadm')],
      { sigma: 300 },
      { ...DEFAULTS, sigma: 150 },
      DEFAULTS,
    );
    expect(risks).toHaveLength(1);
    expect(risks[0].why).toBe(WHY_SIGMA);
  });

  it('bajar la σadm del terreno no genera riesgo', () => {
    const risks = detectSafetyRisks<Toy>(
      RULES,
      [change('sigma', '150 kPa', '90 kPa')],
      { sigma: 90 },
      { ...DEFAULTS, sigma: 150 },
      DEFAULTS,
    );
    expect(risks).toEqual([]);
  });

  it('desmarcar "mayoradas" (true → false) no genera riesgo', () => {
    const risks = detectSafetyRisks<Toy>(
      RULES,
      [change('mayoradas', 'Sí', 'No')],
      { mayoradas: false },
      { ...DEFAULTS, mayoradas: true },
      DEFAULTS,
    );
    expect(risks).toEqual([]);
  });
});

describe('detectSafetyRisks — casos defensivos', () => {
  it('un campo SIN regla (variable de diseño) nunca genera riesgo', () => {
    const risks = detectSafetyRisks<Toy>(
      RULES,
      [change('perfil', 'IPE300', 'IPE160')],
      { perfil: 'IPE160' },
      { ...DEFAULTS, perfil: 'IPE300' },
      DEFAULTS,
    );
    expect(risks).toEqual([]);
  });

  it('un cambio cuyo campo no viene en fields se ignora sin lanzar', () => {
    const risks = detectSafetyRisks<Toy>(
      RULES,
      [change('carga', '8,00 kN/m', '2,00 kN/m')],
      { sigma: 150 }, // fields no trae `carga` pese a que el change la anuncia
      { ...DEFAULTS, carga: 8, sigma: 150 },
      DEFAULTS,
    );
    expect(risks).toEqual([]);
  });

  it('un nivel null (tipo inesperado en current o en fields) se ignora sin lanzar', () => {
    const conCurrentRaro = () =>
      detectSafetyRisks<Toy>(
        RULES,
        [change('carga', 'ocho', '2,00 kN/m')],
        { carga: 2 },
        { ...DEFAULTS, carga: 'ocho' as unknown as number },
        DEFAULTS,
      );
    expect(conCurrentRaro).not.toThrow();
    expect(conCurrentRaro()).toEqual([]);

    const conFieldRaro = () =>
      detectSafetyRisks<Toy>(
        RULES,
        [change('carga', '8,00 kN/m', 'poco')],
        { carga: NaN }, // NaN no es un nivel: sin comparación no se inventa riesgo
        { ...DEFAULTS, carga: 8 },
        DEFAULTS,
      );
    expect(conFieldRaro).not.toThrow();
    expect(conFieldRaro()).toEqual([]);
  });

  it('un valor igual (o dentro de EPS) no es una bajada', () => {
    const igual = detectSafetyRisks<Toy>(
      RULES,
      [change('carga', '8,00 kN/m', '8,00 kN/m')],
      { carga: 8 },
      { ...DEFAULTS, carga: 8 },
      DEFAULTS,
    );
    expect(igual).toEqual([]);

    const dentroDeEps = detectSafetyRisks<Toy>(
      RULES,
      [change('carga', '8,00 kN/m', '8,00 kN/m')],
      { carga: 8 - 5e-10 },
      { ...DEFAULTS, carga: 8 },
      DEFAULTS,
    );
    expect(dentroDeEps).toEqual([]);

    // EPS es tolerancia numérica, no un margen libre: una bajada real sí salta.
    const fueraDeEps = detectSafetyRisks<Toy>(
      RULES,
      [change('carga', '8,00 kN/m', '8,00 kN/m')],
      { carga: 8 - 1e-6 },
      { ...DEFAULTS, carga: 8 },
      DEFAULTS,
    );
    expect(fueraDeEps).toHaveLength(1);
  });
});

describe('detectSafetyRisks — orden de salida', () => {
  it('respeta el orden de `changes`, no el de las reglas', () => {
    const reglasAlReves: ReadonlyArray<SafetyRule<Toy>> = [
      { field: 'mayoradas', level: unfactoredIsSafer, why: WHY_MAYORADAS, alwaysCheck: true },
      { field: 'sigma', level: lowerIsSafer, why: WHY_SIGMA },
      { field: 'carga', level: higherIsSafer, why: WHY_CARGA },
    ];
    const risks = detectSafetyRisks<Toy>(
      reglasAlReves,
      [
        change('carga', '8,00 kN/m', '2,00 kN/m'),
        change('perfil', 'IPE300', 'IPE160'), // sin regla: no ocupa hueco
        change('sigma', '150 kPa', '300 kPa'),
        change('mayoradas', 'No', 'Sí'),
      ],
      { carga: 2, perfil: 'IPE160', sigma: 300, mayoradas: true },
      { ...DEFAULTS, carga: 8, sigma: 150, perfil: 'IPE300' },
      DEFAULTS,
    );
    expect(risks.map((r) => r.field)).toEqual(['carga', 'sigma', 'mayoradas']);
  });
});

// ── ordinalLevel (ola 3) ──────────────────────────────────────────────────────

describe('ordinalLevel', () => {
  const nivel = ordinalLevel({ persistent: 2, transient: 1, extraordinary: 0 });

  it('mapea cada valor del enum a su ordinal', () => {
    expect(nivel('persistent')).toBe(2);
    expect(nivel('transient')).toBe(1);
    expect(nivel('extraordinary')).toBe(0);
  });

  it('valor fuera del mapa o no-string → null (sin nivel, sin riesgo inventado)', () => {
    expect(nivel('sismico')).toBeNull();
    expect(nivel(2)).toBeNull();
    expect(nivel(null)).toBeNull();
    expect(nivel(undefined)).toBeNull();
  });

  it('integra con detectSafetyRisks: relajar la situación de proyecto marca', () => {
    interface T { situacion: string }
    const rules: ReadonlyArray<SafetyRule<T>> = [
      { field: 'situacion', level: nivel, why: 'La situación de proyecto fija los límites normativos.' },
    ];
    const risks = detectSafetyRisks<T>(
      rules,
      [change('situacion', 'Persistente', 'Extraordinaria')],
      { situacion: 'extraordinary' },
      { situacion: 'persistent' },
      { situacion: 'transient' }, // default ≠ current → gate abierto
    );
    expect(risks).toHaveLength(1);
    expect(risks[0].why).toMatch(/situación de proyecto/);
  });
});

// ── detectElementRisks (ola 3 — arrays con reemplazo completo) ────────────────

/** Elemento de juguete con la forma de un estrato (id regenerable + Cu opcional). */
interface Capa {
  id: number;
  c: number;      // kPa — cohesión (dato geotécnico)
  gamma: number;  // kN/m³ — peso específico (dirección DEPENDE del módulo)
  Cu?: number;    // opcional (solo granulares)
}

const CAPAS_DEFAULT: readonly Capa[] = [
  { id: 1, c: 10, gamma: 19 },
];

/** Tabla estilo TALUDES: subir c es riesgo; BAJAR γ es riesgo (peso desestabilizador). */
const REGLAS_TALUD: ReadonlyArray<ElementSafetyRule<Capa>> = [
  { field: 'c', label: "cohesión c'", level: lowerIsSafer, format: (v) => `${v} kPa`, why: 'La cohesión la fija el estudio geotécnico.' },
  { field: 'gamma', label: 'peso específico γ', level: higherIsSafer, format: (v) => `${v} kN/m³`, why: 'En taludes el peso del terreno es acción desestabilizadora.' },
];

/** Tabla estilo MICROPILOTES: TODO lo que mejora el terreno es riesgo, γ incluido. */
const REGLAS_MICRO: ReadonlyArray<ElementSafetyRule<Capa>> = [
  { field: 'c', label: "cohesión c'", level: lowerIsSafer, format: (v) => `${v} kPa`, why: 'La cohesión la fija el estudio geotécnico.' },
  { field: 'gamma', label: 'peso específico γ', level: lowerIsSafer, format: (v) => `${v} kN/m³`, why: 'Subir γ infla la tensión efectiva y el rozamiento por fuste.' },
];

const CTX = {
  field: 'strata',
  itemLabel: 'Estrato',
  collectionLabel: 'Estratos',
  removalWhy: 'Quitar un estrato reescribe el modelo de terreno del estudio geotécnico.',
} as const;

describe('detectElementRisks — gate de fábrica y básicos', () => {
  it('proposed undefined (el turno no toca el array) → []', () => {
    expect(detectElementRisks(REGLAS_TALUD, undefined, CAPAS_DEFAULT, CAPAS_DEFAULT, CTX)).toEqual([]);
  });

  it('array vigente = fábrica (con ids DISTINTOS) → gate cerrado, sin riesgos', () => {
    const current: Capa[] = [{ id: 7, c: 10, gamma: 19 }]; // mismo contenido, otro id
    const proposed: Capa[] = [{ id: 1, c: 25, gamma: 19 }]; // sube c — sería riesgo
    expect(detectElementRisks(REGLAS_TALUD, proposed, current, CAPAS_DEFAULT, CTX)).toEqual([]);
  });

  it('array tocado + subida de c → riesgo con field/label/before por elemento', () => {
    const current: Capa[] = [{ id: 1, c: 10, gamma: 19 }, { id: 2, c: 5, gamma: 20 }]; // ≠ fábrica (2 capas)
    const proposed: Capa[] = [{ id: 1, c: 25, gamma: 19 }, { id: 2, c: 5, gamma: 20 }];
    const risks = detectElementRisks(REGLAS_TALUD, proposed, current, CAPAS_DEFAULT, CTX);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      field: 'strata[0].c',
      label: "Estrato 1 — cohesión c'",
      before: '10 kPa',
      after: '25 kPa',
    });
  });

  it('cambio dentro de EPS o hacia el lado seguro → sin riesgo', () => {
    const current: Capa[] = [{ id: 1, c: 10, gamma: 19 }, { id: 2, c: 5, gamma: 20 }];
    const epsUp: Capa[] = [{ id: 1, c: 10 + 1e-12, gamma: 19 }, { id: 2, c: 5, gamma: 20 }];
    const safer: Capa[] = [{ id: 1, c: 5, gamma: 19 }, { id: 2, c: 5, gamma: 20 }]; // BAJAR c es conservador
    expect(detectElementRisks(REGLAS_TALUD, epsUp, current, CAPAS_DEFAULT, CTX)).toEqual([]);
    expect(detectElementRisks(REGLAS_TALUD, safer, current, CAPAS_DEFAULT, CTX)).toEqual([]);
  });
});

describe('detectElementRisks — direcciones OPUESTAS de γ por módulo', () => {
  // current ≠ fábrica para abrir el gate en ambos casos.
  const current: Capa[] = [{ id: 1, c: 10, gamma: 19 }, { id: 2, c: 0, gamma: 21 }];

  it('taludes: bajar γ marca; subirlo no', () => {
    const baja: Capa[] = [{ id: 1, c: 10, gamma: 17 }, { id: 2, c: 0, gamma: 21 }];
    const sube: Capa[] = [{ id: 1, c: 10, gamma: 21 }, { id: 2, c: 0, gamma: 21 }];
    expect(detectElementRisks(REGLAS_TALUD, baja, current, CAPAS_DEFAULT, CTX)).toHaveLength(1);
    expect(detectElementRisks(REGLAS_TALUD, sube, current, CAPAS_DEFAULT, CTX)).toEqual([]);
  });

  it('micropilotes: subir γ marca; bajarlo no', () => {
    const sube: Capa[] = [{ id: 1, c: 10, gamma: 21 }, { id: 2, c: 0, gamma: 21 }];
    const baja: Capa[] = [{ id: 1, c: 10, gamma: 17 }, { id: 2, c: 0, gamma: 21 }];
    expect(detectElementRisks(REGLAS_MICRO, sube, current, CAPAS_DEFAULT, CTX)).toHaveLength(1);
    expect(detectElementRisks(REGLAS_MICRO, baja, current, CAPAS_DEFAULT, CTX)).toEqual([]);
  });
});

describe('detectElementRisks — longitudes distintas y eliminación', () => {
  const current: Capa[] = [
    { id: 1, c: 10, gamma: 19 },
    { id: 2, c: 5, gamma: 20 },
    { id: 3, c: 40, gamma: 21 },
  ];

  it('propuesto más corto CON removalWhy → exactamente un riesgo agregado', () => {
    const proposed: Capa[] = [{ id: 1, c: 10, gamma: 19 }, { id: 2, c: 5, gamma: 20 }];
    const risks = detectElementRisks(REGLAS_TALUD, proposed, current, CAPAS_DEFAULT, CTX);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      field: 'strata.__removed',
      label: 'Estratos',
      before: '3',
      after: '2',
    });
  });

  it('propuesto más corto SIN removalWhy → sin riesgo de eliminación', () => {
    const proposed: Capa[] = [{ id: 1, c: 10, gamma: 19 }];
    const sinRemoval = { field: 'plates', itemLabel: 'Chapa', collectionLabel: 'Chapas' };
    expect(detectElementRisks(REGLAS_TALUD, proposed, current, CAPAS_DEFAULT, sinRemoval)).toEqual([]);
  });

  it('propuesto más largo con prefijo idéntico (añadir capa) → sin riesgos', () => {
    const proposed: Capa[] = [...current.map((c) => ({ ...c })), { id: 4, c: 0, gamma: 20 }];
    expect(detectElementRisks(REGLAS_TALUD, proposed, current, CAPAS_DEFAULT, CTX)).toEqual([]);
  });
});

describe('detectElementRisks — defensivos', () => {
  it('regla sobre campo opcional ausente (Cu) → sin riesgo ni crash', () => {
    const reglas: ReadonlyArray<ElementSafetyRule<Capa>> = [
      { field: 'Cu', label: 'coef. de uniformidad Cu', level: lowerIsSafer, why: 'Dato del geotécnico.' },
    ];
    const current: Capa[] = [{ id: 1, c: 10, gamma: 19 }, { id: 2, c: 5, gamma: 20 }]; // sin Cu
    const proposed: Capa[] = [{ id: 1, c: 10, gamma: 19, Cu: 8 }, { id: 2, c: 5, gamma: 20 }];
    expect(detectElementRisks(reglas, proposed, current, CAPAS_DEFAULT, CTX)).toEqual([]);
  });

  it('format ausente → String(value) en before/after', () => {
    const reglas: ReadonlyArray<ElementSafetyRule<Capa>> = [
      { field: 'c', label: "cohesión c'", level: lowerIsSafer, why: 'Dato del geotécnico.' },
    ];
    const current: Capa[] = [{ id: 1, c: 10, gamma: 19 }, { id: 2, c: 5, gamma: 20 }];
    const proposed: Capa[] = [{ id: 1, c: 25, gamma: 19 }, { id: 2, c: 5, gamma: 20 }];
    const risks = detectElementRisks(reglas, proposed, current, CAPAS_DEFAULT, CTX);
    expect(risks[0].before).toBe('10');
    expect(risks[0].after).toBe('25');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GATE ANTI-RUIDO — la segunda vía de "establecido": la memoria del hilo
// (auditoría 2026-07-14, fuga 1). Sin ella, el gate se desarmaba justo cuando el
// valor REAL del usuario coincidía con el default de fábrica — y los defaults
// son, por diseño, los valores más comunes.
// ─────────────────────────────────────────────────────────────────────────────
describe('detectSafetyRisks — gate anti-ruido con memoria del hilo (confirmed)', () => {
  // El valor vigente ES el de fábrica: sin memoria del hilo, el gate lo trata
  // como "nadie lo ha fijado" y se traga la rebaja. ESTA es la fuga.
  const current: Toy = { ...DEFAULTS };                    // carga = 5 = default
  const fields = { carga: 1 };                             // rebaja a 1
  const changes = [change('carga', '5', '1')];

  it('valor = default y hilo virgen → sin riesgo (rellenar el formulario)', () => {
    expect(detectSafetyRisks(RULES, changes, fields, current, DEFAULTS)).toEqual([]);
    expect(detectSafetyRisks(RULES, changes, fields, current, DEFAULTS, new Set())).toEqual([]);
  });

  it('valor = default pero CONFIRMADO en el hilo → RIESGO (la fuga, cerrada)', () => {
    const risks = detectSafetyRisks(
      RULES, changes, fields, current, DEFAULTS, new Set(['carga']),
    );
    expect(risks).toHaveLength(1);
    expect(risks[0].field).toBe('carga');
    expect(risks[0].before).toBe('5');
    expect(risks[0].after).toBe('1');
    expect(risks[0].why).toBe(WHY_CARGA);
  });

  it('confirmKey traduce estado → payload: la memoria del hilo NO usa el nombre del estado', () => {
    // El hilo confirma claves de PAYLOAD ('carga_kN'), no del estado ('carga').
    const reglas: ReadonlyArray<SafetyRule<Toy>> = [
      { field: 'carga', confirmKey: 'carga_kN', level: higherIsSafer, why: WHY_CARGA },
    ];
    // La clave del ESTADO no levanta el gate…
    expect(detectSafetyRisks(reglas, changes, fields, current, DEFAULTS, new Set(['carga']))).toEqual([]);
    // …la del PAYLOAD sí.
    expect(
      detectSafetyRisks(reglas, changes, fields, current, DEFAULTS, new Set(['carga_kN'])),
    ).toHaveLength(1);
  });

  it('otra clave confirmada NO levanta el gate del campo rebajado', () => {
    expect(
      detectSafetyRisks(RULES, changes, fields, current, DEFAULTS, new Set(['sigma'])),
    ).toEqual([]);
  });

  it('confirmado pero el cambio SUBE el nivel → sigue sin riesgo (el gate no invierte la comparación)', () => {
    const sube = { carga: 9 };
    const ch = [change('carga', '5', '9')];
    expect(detectSafetyRisks(RULES, ch, sube, current, DEFAULTS, new Set(['carga']))).toEqual([]);
  });

  it('valor ya fijado (≠ default) → riesgo con hilo virgen, como antes (sin regresión)', () => {
    const fijado: Toy = { ...DEFAULTS, carga: 8 };
    const risks = detectSafetyRisks(RULES, [change('carga', '8', '1')], fields, fijado, DEFAULTS);
    expect(risks).toHaveLength(1);
  });
});

describe('detectElementRisks — gate de fábrica con memoria del hilo (confirmed)', () => {
  const current: Capa[] = [{ id: 7, c: 10, gamma: 19 }];  // = fábrica (otro id)
  const proposed: Capa[] = [{ id: 1, c: 25, gamma: 19 }]; // "mejora" el terreno

  it('array de fábrica y hilo virgen → gate cerrado (comportamiento previo)', () => {
    expect(detectElementRisks(REGLAS_TALUD, proposed, current, CAPAS_DEFAULT, CTX)).toEqual([]);
  });

  it('array de fábrica pero YA propuesto en el hilo → RIESGO', () => {
    // Turno 1: el modelo propone el terreno y el usuario NO lo aplica ⇒ current
    // sigue siendo el de fábrica. Turno 2: lo "mejora". Sin memoria del hilo esto
    // pasaba limpio.
    const risks = detectElementRisks(
      REGLAS_TALUD, proposed, current, CAPAS_DEFAULT, CTX, new Set(['strata']),
    );
    expect(risks).toHaveLength(1);
    expect(risks[0].field).toBe('strata[0].c');
  });

  it('confirmKey del contexto: la clave de payload del array manda sobre ctx.field', () => {
    const ctx = { ...CTX, confirmKey: 'estratos' };
    expect(detectElementRisks(REGLAS_TALUD, proposed, current, CAPAS_DEFAULT, ctx, new Set(['strata']))).toEqual([]);
    expect(
      detectElementRisks(REGLAS_TALUD, proposed, current, CAPAS_DEFAULT, ctx, new Set(['estratos'])),
    ).toHaveLength(1);
  });
});
