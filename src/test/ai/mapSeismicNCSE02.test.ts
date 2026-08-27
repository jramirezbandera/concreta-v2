/**
 * Mapper del adapter de sismo NCSE-02 (ola 7).
 *
 * La mitad de este fichero prueba lo que el asistente NO puede hacer, y ése es
 * el punto. Este módulo tiene tres familias de campos cuya escritura por un
 * modelo de lenguaje rompe algo que después nadie ve:
 *
 *   · `ab` y `K` — el PDF los imprime citando al IGN. Si los escribiera el
 *     modelo, el documento seguiría diciendo «Anejo 1 · IGN» debajo de un valor
 *     recordado de memoria: la herramienta firmando una alucinación.
 *   · las cinco declaraciones — el papel las recoge como «declarado». Si las
 *     marcara el asistente, diría que alguien declaró lo que nadie declaró.
 *   · el T_F impuesto del art. 3.6.2.3.2 — alpha = 2,5·T_B/T_F, así que subirlo
 *     es la rebaja de demanda más barata y más callada del módulo.
 *
 * Que estén fuera del `payloadSchema` no basta como prueba: hay que comprobar
 * que un payload que los trae de todos modos NO los escribe.
 */

import { describe, it, expect } from 'vitest';
import {
  seismicNCSE02Adapter,
  summarizeSeismicResults,
  PERFIL_INERT_REASON,
  SEISMIC_PAYLOAD_SCHEMA,
} from '../../lib/ai/modules/seismicNCSE02';
import { defaultSeismicState, evaluarSismo, type SeismicState } from '../../features/seismic-ncse02/state';

const SI = 'si' as const;
const D = () => defaultSeismicState();

/** Payload completo: sólo las claves que interesan, el resto null (el contrato). */
function p(o: Record<string, unknown> = {}) {
  return {
    importancia: null, terreno_tipo: null, sistema: null,
    n: null, n_total: null, H_m: null, omega_pct: null, mu: null,
    L_x_m: null, B_x_m: null, L_y_m: null, B_y_m: null,
    warnings: [],
    ...o,
  };
}

const plan = (payload: Record<string, unknown>, current: SeismicState, confirmed?: string[]) =>
  seismicNCSE02Adapter.buildPlan(payload, current, SI, new Set(confirmed ?? []));

const riskIds = (r: { risks: { field: string }[] }) => r.risks.map((x) => x.field);
const skipOf = (r: { skipped: { field?: string; label: string; reason: string }[] }, field: string) =>
  r.skipped.find((s) => s.field === field);

// ── Lo que el asistente NO puede escribir ────────────────────────────────────

describe('la peligrosidad del emplazamiento no es del modelo', () => {
  it('ab, K y el municipio no son claves del payload', () => {
    const props = Object.keys(
      (SEISMIC_PAYLOAD_SCHEMA as { properties: Record<string, unknown> }).properties,
    );
    for (const prohibida of ['ab', 'ab_g', 'K', 'municipio', 'municipio_ine', 'municipioIne']) {
      expect(props, `«${prohibida}» no puede ser un campo de la propuesta`).not.toContain(prohibida);
    }
  });

  it('un payload que los trae de todos modos no los escribe', () => {
    const current = D();
    const r = plan(p({ ab: 0.04, K: 1.3, municipioIne: '30024', municipioNombre: 'Lorca' }), current);
    expect(r.fields).not.toHaveProperty('ab');
    expect(r.fields).not.toHaveProperty('K');
    expect(r.fields).not.toHaveProperty('municipioIne');
    expect(r.fields).not.toHaveProperty('municipioNombre');
    expect(r.changes).toHaveLength(0);
  });

  it('el prompt le dice explícitamente que no cite ab de memoria', () => {
    expect(seismicNCSE02Adapter.promptRules).toMatch(/NUNCA cites de memoria la ab/);
    expect(seismicNCSE02Adapter.promptRules).toMatch(/Instituto Geográfico Nacional/);
  });
});

describe('las declaraciones las firma el proyectista', () => {
  it('ninguna de las cinco es clave del payload', () => {
    const props = Object.keys(
      (SEISMIC_PAYLOAD_SCHEMA as { properties: Record<string, unknown> }).properties,
    );
    for (const d of [
      'regularidad_geometrica', 'regularidadGeometrica',
      'soportes_continuos', 'soportesContinuos',
      'regularidad_mecanica', 'regularidadMecanica',
      'excentricidad_declarada', 'excentricidadDeclarada',
      'porticos_bien_arriostrados', 'porticosBienArriostrados',
    ]) {
      expect(props, `«${d}» es un juicio del proyectista, no un campo`).not.toContain(d);
    }
  });

  it('un payload que intenta declarar por él no escribe nada', () => {
    // El caso peor: un edificio con la puerta cerrada por falta de declaración.
    const current: SeismicState = { ...D(), regularidadGeometrica: null, soportesContinuos: null };
    const r = plan(
      p({ regularidadGeometrica: true, soportesContinuos: true, porticosBienArriostrados: true }),
      current,
    );
    expect(r.fields).not.toHaveProperty('regularidadGeometrica');
    expect(r.fields).not.toHaveProperty('soportesContinuos');
    expect(r.fields).not.toHaveProperty('porticosBienArriostrados');
    // Y la puerta sigue cerrada tras aplicar el plan.
    const despues = evaluarSismo({ ...current, ...r.fields });
    expect(despues.aplicabilidad.puedeCalcular).toBe(false);
  });
});

describe('el T_F impuesto es un resultado de otro cálculo', () => {
  it('no es clave del payload y un intento de imponerlo no escribe', () => {
    const props = Object.keys(
      (SEISMIC_PAYLOAD_SCHEMA as { properties: Record<string, unknown> }).properties,
    );
    expect(props).not.toContain('TF_x_s');
    expect(props).not.toContain('TF_manual');

    const current = D();
    const r = plan(p({ TF_x_s: 2.5, TFModo: 'manual', TFManual: 2.5 }), current);
    // `x` sólo se toca si llegan L o B; aquí no llega ninguna.
    expect(r.fields.x).toBeUndefined();
  });
});

// ── Lo que sí escribe ────────────────────────────────────────────────────────

describe('clasificaciones', () => {
  it('la importancia se aplica con su rótulo', () => {
    const r = plan(p({ importancia: 'especial' }), D());
    expect(r.fields.importancia).toBe('especial');
    expect(r.changes[0]).toMatchObject({ field: 'importancia', before: 'Normal', after: 'Especial' });
  });

  it('un valor fuera del catálogo se descarta con motivo', () => {
    const r = plan(p({ sistema: 'porticos-madera' }), D());
    expect(r.fields.sistema).toBeUndefined();
    expect(skipOf(r, 'sistema')?.reason).toMatch(/no está en el catálogo/);
  });

  it('el valor que ya está se descarta como tal', () => {
    const r = plan(p({ importancia: 'normal' }), D());
    expect(r.changes).toHaveLength(0);
    expect(skipOf(r, 'importancia')?.reason).toMatch(/Ya coincide/);
  });

  it('con perfil de estratos, el tipo tabulado NO se aplica y lo dice', () => {
    // Escribirlo no haría nada (el motor pondera C en los 30 m superiores) y
    // dejaría al usuario creyendo que sí.
    const current: SeismicState = { ...D(), terrenoModo: 'perfil' };
    const r = plan(p({ terreno_tipo: 'IV' }), current);
    expect(r.fields.terreno).toBeUndefined();
    expect(skipOf(r, 'terreno_tipo')?.reason).toBe(PERFIL_INERT_REASON);
  });
});

describe('geometría', () => {
  it('n exige un entero de verdad, no un 8,4 redondeado en silencio', () => {
    const r = plan(p({ n: 8.4 }), D());
    expect(r.fields.n).toBeUndefined();
    expect(skipOf(r, 'n')?.reason).toMatch(/entero/);
  });

  it('L y B de una dirección se funden en UN solo objeto y respetan los planos', () => {
    // El bug natural: escribir `x` dos veces y que la segunda pise a la primera,
    // o que cualquiera de las dos borre los planos resistentes.
    const current = D();
    const r = plan(p({ L_x_m: 24, B_x_m: 6 }), current);
    expect(r.fields.x?.L).toBe(24);
    expect(r.fields.x?.B).toBe(6);
    expect(r.fields.x?.elementos).toEqual(current.x.elementos);
    expect(r.fields.y).toBeUndefined();
  });

  it('avisa cuando n y la tabla de plantas se separan', () => {
    // Son campos independientes del estado: T_F usa n, la masa sale de la tabla.
    // Que se separen no lo detecta ningún cálculo.
    const r = plan(p({ n: 14 }), D());
    expect(r.warnings.join(' ')).toMatch(/n = 14 pero la tabla tiene 10 plantas/);
  });

  it('sin separación no hay aviso', () => {
    const r = plan(p({ H_m: 33 }), D());
    expect(r.warnings.filter((w) => w.includes('la tabla tiene'))).toHaveLength(0);
  });
});

// ── Seguridad ────────────────────────────────────────────────────────────────

describe('los tres factores del coeficiente sísmico', () => {
  it('subir mu rebaja beta → RIESGO', () => {
    // beta = nu/mu multiplica la acción entera: mu = 4 en vez de 3 la baja un 25%.
    const r = plan(p({ mu: 4 }), D(), ['mu']);
    expect(riskIds(r)).toContain('beta');
  });

  it('subir el amortiguamiento también rebaja beta → RIESGO', () => {
    const r = plan(p({ omega_pct: 8 }), D(), ['omega_pct']);
    expect(riskIds(r)).toContain('beta');
  });

  it('bajar la importancia de especial a normal rebaja ac → RIESGO', () => {
    const current: SeismicState = { ...D(), importancia: 'especial' };
    const r = plan(p({ importancia: 'normal' }), current);
    expect(riskIds(r)).toContain('ac');
  });

  it('un terreno rebajado muerde DOS veces, y se ven las dos filas', () => {
    // Baja C → baja S → baja ac; y baja T_B → baja alpha. Esconder una daría a
    // entender que el terreno sólo afecta a una cosa.
    const current: SeismicState = { ...D(), terreno: 'IV' };
    const r = plan(p({ terreno_tipo: 'II' }), current);
    expect(riskIds(r)).toContain('ac');
    expect(riskIds(r)).toContain('alpha_x');
  });

  it('subir n alarga T_F y rebaja alpha → RIESGO en las dos direcciones', () => {
    const r = plan(p({ n: 14 }), D(), ['n']);
    expect(riskIds(r)).toContain('alpha_x');
    expect(riskIds(r)).toContain('alpha_y');
  });

  it('bajar mu NO es un riesgo: sube la fuerza', () => {
    const r = plan(p({ mu: 2 }), D(), ['mu']);
    expect(riskIds(r)).not.toContain('beta');
  });

  it('gate anti-ruido: el primer relleno sobre el default no salta', () => {
    // Sin memoria de hilo y con el valor de fábrica vigente, aportar el dato real
    // es rellenar el formulario, no debilitarlo.
    const r = plan(p({ mu: 4 }), D());
    expect(riskIds(r)).not.toContain('beta');
  });
});

describe('las puertas normativas', () => {
  it('pasar a importancia moderada EXIME el edificio → RIESGO de puerta', () => {
    // rho no cambia (1,0 en moderada y en normal), así que `ac` no salta: la
    // única señal es la puerta. Sin `puertaRisks` esto pasaría en silencio.
    const r = plan(p({ importancia: 'moderada' }), D());
    expect(riskIds(r)).toContain('puerta_obligatoriedad');
    expect(riskIds(r)).not.toContain('ac');
  });

  it('bajar n_total a cuatro abre la pasarela del art. 3.5.1 → DOS riesgos', () => {
    // Un edificio que incumple el requisito (3) y que, bajando n_total, entra
    // por la pasarela de las cuatro plantas EN TOTAL sin cumplirlo.
    const current: SeismicState = { ...D(), regularidadGeometrica: false };
    expect(evaluarSismo(current).aplicabilidad.metodoSimplificado?.aplicable).toBe(false);

    const r = plan(p({ n_total: 4 }), current, ['n_total']);
    expect(riskIds(r)).toContain('nTotal');
    expect(riskIds(r)).toContain('puerta_metodo_simplificado');
    expect(evaluarSismo({ ...current, ...r.fields }).aplicabilidad.metodoSimplificado?.aplicable).toBe(true);
  });

  it('un cambio que no toca ninguna puerta no inventa riesgos de puerta', () => {
    const r = plan(p({ H_m: 31 }), D(), ['H_m']);
    expect(riskIds(r)).not.toContain('puerta_obligatoriedad');
    expect(riskIds(r)).not.toContain('puerta_metodo_simplificado');
  });
});

// ── Snapshot ─────────────────────────────────────────────────────────────────

describe('snapshot', () => {
  const snap = (s: SeismicState) => JSON.parse(seismicNCSE02Adapter.snapshot(s)) as {
    valores: Record<string, unknown>;
    sin_confirmar: string[];
  };

  it('el emplazamiento viaja RESUELTO y marcado como solo lectura', () => {
    const v = snap(D()).valores;
    const e = v.emplazamiento as Record<string, unknown>;
    expect(e.municipio).toBe('Granada');
    expect(e.ab_g).toBe(0.23);
    expect(String(e.procedencia_ab_K)).toMatch(/Instituto Geográfico Nacional/);
    expect(String(e.procedencia_ab_K)).toMatch(/SOLO LECTURA/);
  });

  it('las plantas llevan la fracción del art. 3.2 y lo EXCLUIDO marcado', () => {
    const v = snap(D()).valores;
    const plantas = v.plantas as Array<Record<string, unknown>>;
    expect(plantas).toHaveLength(10);
    const cubierta = plantas[9];
    const cargas = cubierta.cargas as Array<Record<string, unknown>>;
    const excluida = cargas.find((c) => c.excluida_por_el_proyectista === true);
    expect(excluida, 'la sobrecarga excluida tiene que verse en el snapshot').toBeTruthy();
    expect(excluida?.fraccion_art_3_2).toBe(0.6);
  });

  it('las declaraciones viajan con su estado real, «SIN DECLARAR» incluido', () => {
    const v = snap({ ...D(), regularidadGeometrica: null }).valores;
    const d = v.declaraciones as Record<string, string>;
    expect(d.regularidad_geometrica_req_3).toBe('SIN DECLARAR');
    expect(d.porticos_bien_arriostrados_art_1_2_3).toBe('SIN DECLARAR');
    expect(d.soportes_continuos_req_4).toBe('sí');
    expect(String(d.nota)).toMatch(/NO son campos de tu propuesta/);
  });

  it('los planos resistentes viajan de solo lectura, con x y rigidez', () => {
    const v = snap(D()).valores;
    const dirs = v.direcciones as Record<string, { planos_resistentes: unknown[] }>;
    expect(dirs.X.planos_resistentes).toHaveLength(4);
    expect(dirs.Y.planos_resistentes).toHaveLength(4);
  });

  it('la plantilla de fábrica se declara como tal', () => {
    // Diez plantas de 300 m² inventadas por la app no son datos del usuario: si
    // el modelo no lo sabe, da por buenos unos números que nadie ha aportado.
    expect(snap(D()).valores.plantas_por_defecto).toBe(true);
    const tocado = D();
    tocado.plantas[0].area = 420;
    expect(snap(tocado).valores.plantas_por_defecto).toBe(false);
  });

  it('sin_confirmar lista lo que nadie ha tocado', () => {
    const s = snap(D());
    expect(s.sin_confirmar).toContain('importancia');
    expect(s.sin_confirmar).toContain('mu');
    const tocado = snap({ ...D(), mu: 4 });
    expect(tocado.sin_confirmar).not.toContain('mu');
  });
});

// ── Resumen de resultados ────────────────────────────────────────────────────

describe('resumen para el prompt', () => {
  it('con un requisito sin declarar no hay nada que interpretar, y lo nombra', () => {
    const r = summarizeSeismicResults(
      evaluarSismo({ ...D(), regularidadGeometrica: null, soportesContinuos: null }),
    );
    expect(r.verdict).toBe('invalid');
    expect(r.text).toMatch(/\(3, 4\)/);
    expect(r.text).toMatch(/tú no puedes\s+declararlos por él/);
  });

  it('el caso exento es una respuesta completa, no un error', () => {
    const r = summarizeSeismicResults(evaluarSismo({ ...D(), importancia: 'moderada' }));
    expect(r.verdict).not.toBe('invalid');
    expect(r.text).toMatch(/NO es de aplicación obligatoria/);
    expect(r.text).toMatch(/importancia moderada/);
  });

  it('el caso calculable trae el cortante basal y la masa movilizada', () => {
    const r = summarizeSeismicResults(evaluarSismo(D()));
    expect(r.text).toMatch(/cortante basal = 2277 kN/);
    expect(r.text).toMatch(/masa movilizada/);
    expect(r.text).toMatch(/Sum P_k = 23400 kN/);
  });

  it('avisa de que las comprobaciones son de APLICABILIDAD, no de resistencia', () => {
    // Sin esta línea, un veredicto «CUMPLE» se lee como «el edificio aguanta el
    // sismo», que es falso: este módulo no comprueba ninguna sección.
    const r = summarizeSeismicResults(evaluarSismo(D()));
    expect(r.text).toMatch(/APLICABILIDAD/);
    expect(r.text).toMatch(/no comprueba ninguna sección/);
  });

  it('las filas de requisitos distinguen declarado de comprobado', () => {
    const r = summarizeSeismicResults(evaluarSismo(D()));
    expect(r.text).toMatch(/DECLARADO/);
    expect(r.text).toMatch(/comprobado/);
  });

  it('sin método simplificado dice que no hay acción sísmica calculada', () => {
    const r = summarizeSeismicResults(evaluarSismo({ ...D(), H: 80, n: 25, nTotal: 25 }));
    expect(r.verdict).toBe('fail');
    expect(r.text).toMatch(/NO hay acción sísmica calculada/);
    expect(r.text).toMatch(/análisis modal/);
  });
});
