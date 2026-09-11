// Mapper del asistente IA de «Cargas por planta» (ola 8).
//
// El payload de este módulo es LA TABLA: una lista plana de filas que reemplaza
// plantas→zonas→permanentes entera. Lo que hay que asegurar, entonces, no es
// que un escalar llegue a su campo, sino que la reconstrucción NO PIERDA lo que
// el estado anidado guarda y la fila no lleva: los ids de planta y de zona, la
// columna de una carga libre, y sobre todo la nieve tomada de un sobre de
// Viento y nieve, que es el único dato del módulo que no es del usuario.

import { describe, it, expect } from 'vitest';
import {
  cargasPlantaAdapter,
  summarizeCargasResults,
  CARGAS_PAYLOAD_SCHEMA,
  CARGAS_RESOLVED_RULES,
  NIEVE_PUBLICADA_REASON,
  type FilaAi,
  type LinealAi,
} from '../../lib/ai/modules/cargasPlanta';
import { buildChatSchema } from '../../lib/ai/chatSchema';
import { countAnthropicUnions } from '../../lib/ai/providers/schemaConvert';
import {
  defaultCargasState,
  evaluar,
  nuevaPlanta,
  nuevoLineal,
  type CargasState,
} from '../../features/cargas-planta/state';
import { claveColumna, columnasEncima } from '../../features/cargas-planta/columnas';

const SI = 'si' as const;

/** Una fila completa con lo mínimo puesto; el resto, los valores inertes del schema. */
function fila(over: Partial<FilaAi> = {}): FilaAi {
  return {
    planta: 'Planta Baja',
    es_cubierta: false,
    zona: '',
    forjado: 'reticular',
    canto_cm: 30,
    pp_kNm2: 0,
    encima: [],
    uso: 'A1',
    qk_propio_kNm2: 0,
    psi_como: 'A',
    inclinacion_grados: 0,
    ligera: false,
    acceso_desde: 'A1',
    escalera: false,
    balcon: false,
    nieve_kNm2: 0,
    ...over,
  };
}

const lineal = (over: Partial<LinealAi> = {}): LinealAi => ({
  concepto: 'Cerramiento de fachada', alzado_kNm2: 0, altura_m: 0, kN_por_m: 0, ...over,
});

/** Payload completo: todo a null salvo lo que el caso pone. */
const payload = (over: Record<string, unknown> = {}) => ({
  altitud_m: null,
  zonas: null,
  lineales: null,
  muros_hay: null,
  muros_terreno: null,
  muros_phi_grados: null,
  muros_gamma_kNm3: null,
  muros_sobrecarga_kNm2: null,
  warnings: [],
  ...over,
});

const plan = (p: Record<string, unknown>, current: CargasState, confirmed = new Set<string>()) =>
  cargasPlantaAdapter.buildPlan(p, current, SI, confirmed);

/** Un edificio TOCADO: la tabla ya no es la de arranque, así que el gate está abierto. */
function edificioReal(): CargasState {
  const base = defaultCargasState();
  const cubierta = nuevaPlanta('Cubierta', true);
  const primera = nuevaPlanta('Planta Primera');
  const baja = nuevaPlanta('Planta Baja');
  return {
    ...base,
    emplazamiento: { provincia: '09', municipio: 'Aranda de Duero', altitud: 800 },
    plantas: [
      cubierta,
      { ...primera, zonas: [{ ...primera.zonas[0], forjado: { tipo: 'losa', canto: 25, ppManual: null } }] },
      baja,
    ],
    lineales: [nuevoLineal('fachada')],
  };
}

const rotulos = (s: CargasState) => s.plantas.flatMap((p) => p.zonas.map((z) => (z.nombre ? `${p.nombre} (${z.nombre})` : p.nombre)));

describe('la tabla se reconstruye desde la lista plana', () => {
  it('filas consecutivas con el mismo nombre de planta son la misma planta', () => {
    const current = edificioReal();
    const p = plan(payload({
      zonas: [
        fila({ planta: 'Cubierta', es_cubierta: true, uso: 'G' }),
        fila({ planta: 'Planta Primera' }),
        fila({ planta: 'Planta Baja', zona: 'Vivienda' }),
        fila({ planta: 'Planta Baja', zona: 'Vaso piscina', forjado: 'losa', canto_cm: 20, encima: [{ catalogo: 'agua', concepto: '', valor_kNm2: 0, espesor_m: 1.2 }] }),
      ],
    }), current);

    const plantas = p.fields.plantas!;
    expect(plantas.map((x) => x.nombre)).toEqual(['Cubierta', 'Planta Primera', 'Planta Baja']);
    expect(plantas.map((x) => x.zonas.length)).toEqual([1, 1, 2]);
    expect(plantas[2].zonas.map((z) => z.nombre)).toEqual(['Vivienda', 'Vaso piscina']);
  });

  it('conserva los ids de las plantas y zonas que ocupaban ese sitio', () => {
    const current = edificioReal();
    const idsPlanta = current.plantas.map((x) => x.id);
    const idsZona = current.plantas.flatMap((x) => x.zonas.map((z) => z.id));

    const p = plan(payload({
      zonas: [
        fila({ planta: 'Cubierta', es_cubierta: true, uso: 'G' }),
        fila({ planta: 'Planta Primera', uso: 'B' }),
        fila({ planta: 'Planta Baja', uso: 'D1' }),
      ],
    }), current);

    expect(p.fields.plantas!.map((x) => x.id)).toEqual(idsPlanta);
    expect(p.fields.plantas!.flatMap((x) => x.zonas.map((z) => z.id))).toEqual(idsZona);
  });

  it('una lista vacía se RECHAZA: un edificio sin plantas no se calcula', () => {
    const current = edificioReal();
    const p = plan(payload({ zonas: [] }), current);
    expect(p.fields.plantas).toBeUndefined();
    expect(p.skipped.map((s) => s.field)).toContain('zonas');
    expect(p.skipped[0].reason).toMatch(/vac[íi]a/i);
  });

  it('los cambios se miden sobre el estado FINAL, no sobre la fila cruda', () => {
    const current = edificioReal();
    const igual = plan(payload({
      zonas: [
        fila({ planta: 'Cubierta', es_cubierta: true, uso: 'G', canto_cm: 30 }),
        fila({ planta: 'Planta Primera', forjado: 'losa', canto_cm: 25 }),
        fila({ planta: 'Planta Baja' }),
      ],
    }), current);
    // Las plantas de arranque llevan sus cargas de catálogo; la propuesta viene
    // sin ellas, así que SÍ cambia: lo que se comprueba es que el mapper compara
    // el resultado FINAL y no la fila cruda.
    expect(igual.changes.some((c) => c.field.endsWith('.encima'))).toBe(true);
  });
});

describe('las cargas de encima del forjado', () => {
  const conEncima = (encima: FilaAi['encima']) => {
    const current = edificioReal();
    const p = plan(payload({ zonas: [fila({ planta: 'Planta Baja', encima })] }), current);
    return p.fields.plantas![0].zonas[0].permanentes;
  };

  it('una entrada del catálogo con valor 0 toma el de la tabla C.5', () => {
    const [solado] = conEncima([{ catalogo: 'solado', concepto: '', valor_kNm2: 0, espesor_m: 0 }]);
    expect(solado.catalogoId).toBe('solado');
    expect(solado.valor).toBeCloseTo(1, 6);           // tabla C.5, solado de plaqueta
    expect(solado.concepto).toBe('Solado cerámico, de madera o hidráulico');
  });

  it('el agua va por espesor: 10 kN/m³ por la lámina', () => {
    const [agua] = conEncima([{ catalogo: 'agua', concepto: '', valor_kNm2: 99, espesor_m: 1.2 }]);
    expect(agua.espesor).toBeCloseTo(1.2, 6);
    expect(agua.valor).toBeCloseTo(12, 6);            // el valor_kNm2 del modelo se IGNORA
  });

  it('una carga libre conserva su nombre y su peso', () => {
    const [libre] = conEncima([{ catalogo: 'otro', concepto: 'Falso techo registrable', valor_kNm2: 0.3, espesor_m: 0 }]);
    expect(libre.catalogoId).toBeNull();
    expect(libre.concepto).toBe('Falso techo registrable');
    expect(libre.valor).toBeCloseTo(0.3, 6);
  });

  it('la misma carga libre en dos plantas es UNA columna de la tabla', () => {
    const current = edificioReal();
    const encima = [{ catalogo: 'otro', concepto: 'Falso techo', valor_kNm2: 0.3, espesor_m: 0 }];
    const p = plan(payload({
      zonas: [
        fila({ planta: 'Planta Primera', encima }),
        fila({ planta: 'Planta Baja', encima }),
      ],
    }), current);
    const plantas = p.fields.plantas!;
    const a = plantas[0].zonas[0].permanentes[0];
    const b = plantas[1].zonas[0].permanentes[0];
    expect(a.columna).toBeDefined();
    expect(claveColumna(a)).toBe(claveColumna(b));
    expect(columnasEncima(plantas)).toHaveLength(1);
  });
});

describe('el peso propio del forjado', () => {
  it('pp_kNm2 = 0 deja que lo resuelva la norma', () => {
    const current = edificioReal();
    const p = plan(payload({ zonas: [fila({ forjado: 'losa', canto_cm: 30, pp_kNm2: 0 })] }), current);
    expect(p.fields.plantas![0].zonas[0].forjado.ppManual).toBeNull();
  });

  it('un peso tecleado PISA al de la norma y se dice en la tarjeta', () => {
    const current = edificioReal();
    const p = plan(payload({ zonas: [fila({ planta: 'Planta Primera', forjado: 'reticular', canto_cm: 30, pp_kNm2: 4.8 })] }), current);
    expect(p.fields.plantas![0].zonas[0].forjado.ppManual).toBeCloseTo(4.8, 6);
    const fil = p.changes.find((c) => c.field.endsWith('.pp'));
    expect(fil?.before).toBe('el de la norma');
    expect(fil?.after).toMatch(/4,80/);
  });
});

describe('la nieve', () => {
  it('un valor propio en la cubierta se aplica', () => {
    const current = edificioReal();
    const p = plan(payload({ zonas: [fila({ planta: 'Cubierta', es_cubierta: true, uso: 'G', nieve_kNm2: 0.6 })] }), current);
    const cub = p.fields.plantas![0];
    expect(cub.nieve.modo).toBe('manual');
    expect(cub.nieve.valor).toBeCloseTo(0.6, 6);
  });

  it('la tomada de un sobre de Viento y nieve NO se pisa', () => {
    const base = edificioReal();
    const current: CargasState = {
      ...base,
      plantas: base.plantas.map((p, i) => (i === 0
        ? { ...p, nieve: { modo: 'publicada' as const, valor: 0.4, tsPub: '2026-09-01T10:00:00Z', inePub: '09', faldon: null } }
        : p)),
    };
    const p = plan(payload({ zonas: [fila({ planta: 'Cubierta', es_cubierta: true, uso: 'G', nieve_kNm2: 0.2 })] }), current);

    const cub = p.fields.plantas![0];
    expect(cub.nieve.modo).toBe('publicada');
    expect(cub.nieve.valor).toBeCloseTo(0.4, 6);      // el sobre manda
    expect(cub.nieve.tsPub).toBe('2026-09-01T10:00:00Z');
    const rechazo = p.skipped.find((s) => s.reason === NIEVE_PUBLICADA_REASON);
    expect(rechazo).toBeDefined();
    expect(rechazo!.field).toBe('zonas');
  });

  it('una planta que deja de ser cubierta pierde la nieve', () => {
    const current = edificioReal();
    const p = plan(payload({ zonas: [fila({ planta: 'Cubierta', es_cubierta: false, uso: 'A1', nieve_kNm2: 0.6 })] }), current);
    expect(p.fields.plantas![0].nieve.modo).toBe('ninguna');
  });
});

describe('las cargas lineales', () => {
  it('un muro se mide por alzado y altura', () => {
    const current = edificioReal();
    const p = plan(payload({ lineales: [lineal({ concepto: 'Cerramiento de fachada', alzado_kNm2: 2.33, altura_m: 2.8 })] }), current);
    const l = p.fields.lineales![0];
    expect(l.alzado).toBeCloseTo(2.33, 6);
    expect(l.altura).toBeCloseTo(2.8, 6);
    expect(l.valor).toBeCloseTo(2.33 * 2.8, 6);
    expect(l.catalogoId).toBe('fachada');            // reconocido por su etiqueta
  });

  it('lo que no es un muro va en kN/m, sin alzado ni altura', () => {
    const current = edificioReal();
    const p = plan(payload({ lineales: [lineal({ concepto: 'Barandilla', kN_por_m: 1 })] }), current);
    const l = p.fields.lineales![0];
    expect(l.alzado).toBeNull();
    expect(l.altura).toBeNull();
    expect(l.valor).toBeCloseTo(1, 6);
  });

  it('conserva el id del elemento que ocupaba su sitio', () => {
    const current = edificioReal();
    const id = current.lineales[0].id;
    const p = plan(payload({ lineales: [lineal({ alzado_kNm2: 2.33, altura_m: 3 })] }), current);
    expect(p.fields.lineales![0].id).toBe(id);
  });
});

describe('el emplazamiento y los muros', () => {
  it('la altitud se aplica; la provincia y el municipio no son campos suyos', () => {
    const current = edificioReal();
    const p = plan(payload({ altitud_m: 1200 }), current);
    expect(p.fields.emplazamiento!.altitud).toBe(1200);
    expect(p.fields.emplazamiento!.provincia).toBe('09');
    expect(p.fields.emplazamiento!.municipio).toBe('Aranda de Duero');
    expect(Object.keys(CARGAS_PAYLOAD_SCHEMA.properties as object)).not.toContain('provincia');
    expect(Object.keys(CARGAS_PAYLOAD_SCHEMA.properties as object)).not.toContain('municipio');
  });

  it('un phi fuera de rango se rechaza con su motivo', () => {
    const current = edificioReal();
    const p = plan(payload({ muros_hay: true, muros_phi_grados: 75 }), current);
    expect(p.fields.muros!.phi).toBe(defaultCargasState().muros.phi);
    expect(p.skipped.find((s) => s.field === 'muros_phi_grados')?.reason).toMatch(/Fuera de rango/);
  });

  it('un bloque de muros que no cambia nada deja UNA línea, no cinco', () => {
    // El modelo devuelve los cinco muros_* con el valor que ya tienen en cuanto
    // los ve en el snapshot. Cinco filas de «ya coincide» son ruido.
    const current = edificioReal();
    const m = current.muros;
    const p = plan(payload({
      muros_hay: m.hay,
      muros_terreno: m.terreno,
      muros_phi_grados: m.phi,
      muros_gamma_kNm3: m.gamma,
      muros_sobrecarga_kNm2: m.sobrecarga,
    }), current);
    expect(p.fields.muros).toBeUndefined();
    expect(p.changes.filter((c) => c.field.startsWith('muros_'))).toEqual([]);
    expect(p.skipped.filter((k) => k.field?.startsWith('muros_'))).toHaveLength(1);
  });

  it('un rechazo de rango sobrevive aunque el resto del bloque no cambie', () => {
    const current = edificioReal();
    const p = plan(payload({ muros_hay: current.muros.hay, muros_phi_grados: 75 }), current);
    const muros = p.skipped.filter((k) => k.field?.startsWith('muros_'));
    expect(muros).toHaveLength(1);
    expect(muros[0].reason).toMatch(/Fuera de rango/);
  });

  it('el terreno declarado llega entero', () => {
    const current = edificioReal();
    const p = plan(payload({ muros_hay: true, muros_terreno: 'Arenas limosas', muros_phi_grados: 32, muros_gamma_kNm3: 19.5, muros_sobrecarga_kNm2: 10 }), current);
    expect(p.fields.muros).toEqual({ hay: true, terreno: 'Arenas limosas', phi: 32, gamma: 19.5, sobrecarga: 10 });
  });
});

describe('seguridad — el riesgo es que baje la carga de cálculo', () => {
  const tabla = (usoBaja: FilaAi['uso']) => [
    fila({ planta: 'Cubierta', es_cubierta: true, uso: 'G', encima: [{ catalogo: 'cubierta-grava', concepto: '', valor_kNm2: 0, espesor_m: 0 }] }),
    fila({ planta: 'Planta Primera', forjado: 'losa', canto_cm: 25, encima: [{ catalogo: 'solado', concepto: '', valor_kNm2: 0, espesor_m: 0 }, { catalogo: 'tabiqueria', concepto: '', valor_kNm2: 0, espesor_m: 0 }] }),
    fila({ planta: 'Planta Baja', uso: usoBaja, encima: [{ catalogo: 'solado', concepto: '', valor_kNm2: 0, espesor_m: 0 }, { catalogo: 'tabiqueria', concepto: '', valor_kNm2: 0, espesor_m: 0 }] }),
  ];

  it('cambiar un vestíbulo público por vivienda baja qd: fila roja', () => {
    // Tabla 3.1: C3 (zonas de paso públicas) son 5 kN/m² y A1 (viviendas) 2.
    // Se parte de un edificio con la tabla YA puesta a mano (gate abierto).
    const current = edificioReal();
    const puesto = plan(payload({ zonas: tabla('C3') }), current);
    const conTabla: CargasState = { ...current, ...puesto.fields };

    const p = plan(payload({ zonas: tabla('A1') }), conTabla);
    const riesgo = p.risks.find((r) => r.field.endsWith('.qd'));
    expect(riesgo).toBeDefined();
    expect(riesgo!.label).toMatch(/Planta Baja/);
    expect(riesgo!.why).toMatch(/carga de c[áa]lculo/i);
  });

  it('subir la sobrecarga no es un riesgo', () => {
    const current = edificioReal();
    const puesto = plan(payload({ zonas: tabla('A1') }), current);
    const conTabla: CargasState = { ...current, ...puesto.fields };
    const p = plan(payload({ zonas: tabla('C3') }), conTabla);
    expect(p.risks.filter((r) => r.field.endsWith('.qd'))).toEqual([]);
  });

  it('quitar plantas es un riesgo agregado', () => {
    const current = edificioReal();
    const puesto = plan(payload({ zonas: tabla('A1') }), current);
    const conTabla: CargasState = { ...current, ...puesto.fields };
    const p = plan(payload({ zonas: tabla('A1').slice(0, 2) }), conTabla);
    expect(p.risks.map((r) => r.field)).toContain('zonas.eliminadas');
  });

  it('GATE: sobre el edificio de arranque, la primera propuesta es RELLENAR, no rebajar', () => {
    const virgen = defaultCargasState();
    const p = plan(payload({ zonas: [fila({ planta: 'Planta Baja', uso: 'A2', forjado: 'chapa', canto_cm: 10 })] }), virgen);
    expect(p.risks.filter((r) => r.field.endsWith('.qd') || r.field === 'zonas.eliminadas')).toEqual([]);
  });

  it('…pero si el hilo ya trató la tabla, el gate se levanta', () => {
    const virgen = defaultCargasState();
    const p = plan(
      payload({ zonas: [fila({ planta: 'Planta Baja', uso: 'A2', forjado: 'chapa', canto_cm: 10 })] }),
      virgen,
      new Set(['zonas']),
    );
    expect(p.risks.length).toBeGreaterThan(0);
  });

  it('bajar la altitud por debajo de 1.000 m es un riesgo (psi de la nieve)', () => {
    const base = edificioReal();
    const current: CargasState = { ...base, emplazamiento: { ...base.emplazamiento, altitud: 1200 } };
    const p = plan(payload({ altitud_m: 900 }), current);
    const riesgo = p.risks.find((r) => r.field === 'altitud_m');
    expect(riesgo).toBeDefined();
    expect(riesgo!.before).toBe('1200 m');
    expect(riesgo!.after).toBe('900 m');
  });

  it('subir el phi del relleno es un riesgo: rebaja el empuje sobre el muro', () => {
    const base = edificioReal();
    const current: CargasState = { ...base, muros: { hay: true, terreno: 'Arcillas', phi: 26, gamma: 19, sobrecarga: 10 } };
    const p = plan(payload({ muros_phi_grados: 34 }), current);
    expect(p.risks.map((r) => r.field)).toContain('muros_phi_grados');
  });

  it('GATE: con el terreno de fábrica, la primera declaración no es un riesgo', () => {
    const base = edificioReal();
    const current: CargasState = { ...base, muros: { ...defaultCargasState().muros, hay: true } };
    const p = plan(payload({ muros_phi_grados: 34 }), current);
    expect(p.risks.map((r) => r.field)).not.toContain('muros_phi_grados');
  });

  it('con los muros apagados no hay riesgo de terreno que valga', () => {
    const current = edificioReal();
    const p = plan(payload({ muros_phi_grados: 45 }), current);
    expect(p.risks.map((r) => r.field)).not.toContain('muros_phi_grados');
  });
});

describe('el snapshot enseña lo que el modelo puede y no puede escribir', () => {
  it('lleva la tabla plana y el emplazamiento heredado como contexto', () => {
    const current = edificioReal();
    const snap = JSON.parse(cargasPlantaAdapter.snapshot(current)) as {
      valores: Record<string, unknown>;
      sin_confirmar: string[];
    };
    expect(Array.isArray(snap.valores.zonas)).toBe(true);
    expect((snap.valores.zonas as unknown[]).length).toBe(rotulos(current).length);
    expect(snap.valores.emplazamiento_heredado).toMatchObject({ provincia_ine: '09', municipio: 'Aranda de Duero' });
    expect(String((snap.valores.emplazamiento_heredado as Record<string, unknown>).nota)).toMatch(/NO son campos de tu propuesta/);
  });

  it('marca la cubierta cuya nieve viene de un sobre como no editable', () => {
    const base = edificioReal();
    const current: CargasState = {
      ...base,
      plantas: base.plantas.map((p, i) => (i === 0
        ? { ...p, nieve: { modo: 'publicada' as const, valor: 0.4, tsPub: '2026-09-01T10:00:00Z', inePub: '09', faldon: 'Faldón norte' } }
        : p)),
    };
    const snap = JSON.parse(cargasPlantaAdapter.snapshot(current)) as { valores: Record<string, unknown> };
    const nieves = snap.valores.nieve_de_cada_cubierta as Record<string, unknown>[];
    expect(nieves[0].no_editable).toBe(true);
    expect(nieves[0].modo).toMatch(/Viento y nieve/);
  });

  it('el edificio de arranque va en sin_confirmar: nadie lo ha tecleado', () => {
    const snap = JSON.parse(cargasPlantaAdapter.snapshot(defaultCargasState())) as { sin_confirmar: string[] };
    expect(snap.sin_confirmar).toContain('zonas');
    expect(snap.sin_confirmar).toContain('lineales');
  });
});

describe('el resumen de resultados', () => {
  it('dice el qd de cada zona y que el módulo no comprueba nada', () => {
    const current = edificioReal();
    const resumen = summarizeCargasResults(evaluar(current, null));
    // NUNCA 'ok': rotular «CUMPLE» encima de una tabla de cargas diría lo que
    // este módulo justamente no dice.
    expect(resumen.verdict).not.toBe('ok');
    expect(resumen.text).toMatch(/qd = /);
    expect(resumen.text).toMatch(/NO comprueba nada/);
    for (const r of rotulos(current)) expect(resumen.text).toContain(r);
  });

  it('un canto fuera de la tabla C.5 sale como error y bloquea', () => {
    const base = defaultCargasState();
    const current: CargasState = {
      ...base,
      plantas: [{ ...base.plantas[0], zonas: [{ ...base.plantas[0].zonas[0], forjado: { tipo: 'chapa', canto: 15, ppManual: null } }] }],
    };
    const resumen = summarizeCargasResults(evaluar(current, null));
    expect(resumen.verdict).toBe('invalid');
    expect(resumen.text).toMatch(/CÁLCULO NO VÁLIDO/);
  });
});

describe('lo que el prompt prohíbe', () => {
  const reglas = cargasPlantaAdapter.promptRules;

  it('la carga de nieve NO se cita de memoria: sale de Viento y nieve', () => {
    expect(reglas).toMatch(/NUNCA cites de memoria la nieve/);
    expect(reglas).toMatch(/Viento y nieve/);
  });

  it('la provincia y el municipio no son campos suyos', () => {
    expect(reglas).toMatch(/La provincia y el municipio se heredan/);
  });

  it('dice que el módulo no comprueba nada', () => {
    expect(reglas).toMatch(/NO COMPRUEBA NADA/);
  });

  it('pide dejar en null lo que el enunciado no menciona', () => {
    expect(reglas).toMatch(/null es «sin cambio»/);
  });
});

describe('contrato del adapter', () => {
  it('el esquema cabe en el tope de uniones de Anthropic', () => {
    const unions = countAnthropicUnions(buildChatSchema(CARGAS_PAYLOAD_SCHEMA));
    // 8 anulables de primer nivel + la unión de `proposal` del envelope.
    expect(unions).toBe(9);
    expect(unions).toBeLessThanOrEqual(16);
  });

  it('todo objeto anidado declara required exhaustivo y additionalProperties false', () => {
    const visitar = (node: unknown, ruta: string, fallos: string[]) => {
      if (Array.isArray(node)) return;
      if (typeof node !== 'object' || node === null) return;
      const n = node as Record<string, unknown>;
      const props = n.properties as Record<string, unknown> | undefined;
      if (props !== undefined) {
        if (n.additionalProperties !== false) fallos.push(`${ruta}: additionalProperties`);
        const req = Array.isArray(n.required) ? [...(n.required as string[])].sort() : [];
        if (JSON.stringify(req) !== JSON.stringify(Object.keys(props).sort())) fallos.push(`${ruta}: required`);
        for (const [k, v] of Object.entries(props)) visitar(v, `${ruta}.${k}`, fallos);
      }
      if (n.items !== undefined) visitar(n.items, `${ruta}[]`, fallos);
    };
    const fallos: string[] = [];
    visitar(CARGAS_PAYLOAD_SCHEMA, 'payload', fallos);
    expect(fallos).toEqual([]);
  });

  it('cada regla resuelta explica POR QUÉ ese campo no es una variable de diseño', () => {
    for (const r of CARGAS_RESOLVED_RULES) expect(r.why.length).toBeGreaterThan(60);
  });

  it('el adapter se anuncia con su id y pide más historial que el corriente', () => {
    expect(cargasPlantaAdapter.id).toBe('cargas-planta');
    expect(cargasPlantaAdapter.historyTurns).toBeGreaterThan(12);
  });
});
