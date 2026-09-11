// Mapper del asistente IA del «Cuadro de materiales» (ola 8).
//
// Lo que hay que asegurar aquí no es que un escalar llegue a su campo, sino
// que el asistente NO pueda escribir lo que la norma deriva. El cuadro imprime
// el recubrimiento con el mismo aspecto tenga el origen que tenga, así que la
// invariante que más importa es que `recubrimientoManual` siga siendo del
// usuario: ni se escribe desde la propuesta, ni se borra por debajo al
// reemplazar la lista.

import { describe, it, expect } from 'vitest';
import {
  materialesAdapter,
  summarizeMaterialesResults,
  MATERIALES_PAYLOAD_SCHEMA,
  MATERIALES_RESOLVED_RULES,
  type EstudioAi,
  type HormigonAi,
  type MaderaAi,
  type ElementoAceroAi,
} from '../../lib/ai/modules/materiales';
import { buildChatSchema } from '../../lib/ai/chatSchema';
import { countAnthropicUnions } from '../../lib/ai/providers/schemaConvert';
import {
  defaultMaterialesState,
  evaluar,
  filaDesdePreset,
  nuevoId,
  type MaterialesState,
} from '../../features/materiales/state';

const SI = 'si' as const;

const estudio = (over: Partial<EstudioAi> = {}): EstudioAi => ({
  acero_pasivo: 'B500SD',
  malla: 'ME-500 T',
  acero_estructural: 'S275JR',
  control_hormigon: 'estadistico',
  control_acero: 'Normal',
  control_ejecucion: 'normal',
  tam_max_arido_mm: 20,
  vida_util_anios: 50,
  cemento: 'CEM II/B-S',
  ...over,
});

const hormigon = (over: Partial<HormigonAi> = {}): HormigonAi => ({
  nombre: 'Cimentación', situacion: 'enterrado', fck_Nmm2: 30, consistencia: 'blanda', ...over,
});

const madera = (over: Partial<MaderaAi> = {}): MaderaAi => ({
  nombre: 'Vigas y pilares', situacion: 'cubierto', tipo: 'maciza',
  clase_resistente: 'C24', especie: 'Pinus sylvestris', ...over,
});

const elemAcero = (over: Partial<ElementoAceroAi> = {}): ElementoAceroAi => ({
  nombre: 'Soportes', union: 'soldadura', caracteristicas_union: 'En ángulo',
  corrosividad: 'C1', proteccion: 'sugerida', caracteristicas_proteccion: '', ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  materiales_usados: null,
  estudio: null,
  obra: null,
  fuego: null,
  hormigon: null,
  madera: null,
  acero: null,
  warnings: [],
  ...over,
});

const plan = (p: Record<string, unknown>, current: MaterialesState, confirmed = new Set<string>()) =>
  materialesAdapter.buildPlan(p, current, SI, confirmed);

/** El cuadro de arranque, con el hormigón encendido y nada más. */
const base = () => defaultMaterialesState();

/** Un cuadro YA TOCADO: el gate anti-ruido está abierto. */
function cuadroReal(): MaterialesState {
  const s = base();
  return {
    ...s,
    elementos: [
      filaDesdePreset('Cimentación'),
      filaDesdePreset('Muros de sótano'),
      filaDesdePreset('Pilares'),
      filaDesdePreset('Forjados'),
      filaDesdePreset('Hormigón de limpieza'),
    ],
  };
}

describe('el cuadro se rellena por SITUACIONES', () => {
  it('una lista de hormigón reemplaza la vigente y conserva los ids por posición', () => {
    const current = cuadroReal();
    const ids = current.elementos.map((e) => e.id);
    const p = plan(payload({
      hormigon: [
        hormigon({ nombre: 'Cimentación', situacion: 'enterrado' }),
        hormigon({ nombre: 'Muros de sótano', situacion: 'muro_terreno' }),
        hormigon({ nombre: 'Pilares', situacion: 'interior_seco', consistencia: 'fluida' }),
      ],
    }), current);
    expect(p.fields.elementos!.map((e) => e.id)).toEqual(ids.slice(0, 3));
    expect(p.fields.elementos!.map((e) => e.situacion)).toEqual(['enterrado', 'muro_terreno', 'interior_seco']);
  });

  it('un nombre del catálogo recupera la prescripción de consistencia fluida del art. 33.5', () => {
    const current = cuadroReal();
    const p = plan(payload({ hormigon: [hormigon({ nombre: 'Forjados', situacion: 'interior_seco', consistencia: 'fluida' })] }), current);
    expect(p.fields.elementos![0].prescripcionFluida).toBe(true);
  });

  it('una lista vacía se rechaza: apagar el hormigón es otra cosa', () => {
    const current = cuadroReal();
    const p = plan(payload({ hormigon: [] }), current);
    expect(p.fields.elementos).toBeUndefined();
    expect(p.skipped.find((s) => s.field === 'hormigon')?.reason).toMatch(/vac[íi]a/i);
  });

  it('una fck fuera de rango se rechaza con su motivo', () => {
    const current = cuadroReal();
    const p = plan(payload({ hormigon: [hormigon({ fck_Nmm2: 400 })] }), current);
    expect(p.skipped.find((s) => s.field === 'hormigon')?.reason).toMatch(/Fuera de rango/);
  });
});

describe('el recubrimiento no es del asistente', () => {
  it('no es un campo del payload', () => {
    const props = Object.keys(MATERIALES_PAYLOAD_SCHEMA.properties as object);
    expect(props).not.toContain('recubrimiento');
    const fila = ((MATERIALES_PAYLOAD_SCHEMA.properties as Record<string, Record<string, Record<string, unknown>>>)
      .hormigon.items.properties) as Record<string, unknown>;
    expect(Object.keys(fila)).toEqual(['nombre', 'situacion', 'fck_Nmm2', 'consistencia']);
  });

  it('un recubrimiento forzado por el usuario SOBREVIVE al reemplazo de la lista', () => {
    const s = cuadroReal();
    const current: MaterialesState = {
      ...s,
      elementos: s.elementos.map((e, i) => (i === 0 ? { ...e, recubrimientoManual: 45 } : e)),
    };
    const p = plan(payload({ hormigon: [hormigon({ nombre: 'Cimentación', situacion: 'enterrado' })] }), current);
    expect(p.fields.elementos![0].recubrimientoManual).toBe(45);
  });

  it('el snapshot se lo enseña al modelo marcado como no editable', () => {
    const s = cuadroReal();
    const current: MaterialesState = {
      ...s,
      elementos: s.elementos.map((e, i) => (i === 0 ? { ...e, recubrimientoManual: 45 } : e)),
    };
    const snap = JSON.parse(materialesAdapter.snapshot(current)) as { valores: Record<string, unknown> };
    const forzados = snap.valores.recubrimientos_forzados_a_mano as Record<string, unknown>[];
    expect(forzados).toHaveLength(1);
    expect(forzados[0]).toMatchObject({ mm: 45, no_editable: true });
  });

  it('el snapshot enseña lo DERIVADO como contexto de lectura, no como campo', () => {
    const snap = JSON.parse(materialesAdapter.snapshot(cuadroReal())) as { valores: Record<string, unknown> };
    const derivado = snap.valores.derivado_por_la_norma as Record<string, unknown>[];
    expect(derivado.length).toBeGreaterThan(0);
    expect(derivado[0]).toHaveProperty('tipificacion');
    expect(derivado[0]).toHaveProperty('recubrimiento_nominal_mm');
    expect(String(derivado[0].nota)).toMatch(/NO se teclea/);
  });
});

describe('el perfil del estudio', () => {
  it('la vida útil escribe los DOS campos que el formulario mueve juntos', () => {
    const current = cuadroReal();
    const p = plan(payload({ estudio: estudio({ vida_util_anios: 100 }) }), current);
    expect(p.fields.estudio!.vidaUtil).toBe(100);
    expect(p.fields.estudio!.vidaUtilAnios).toBe(100);
  });

  it('una vida útil que la norma no tabula se rechaza', () => {
    const current = cuadroReal();
    const p = plan(payload({ estudio: estudio({ vida_util_anios: 75 }) }), current);
    expect(p.fields.estudio?.vidaUtil ?? 50).toBe(50);
    expect(p.skipped.find((s) => s.label === 'Vida útil de proyecto')?.reason).toMatch(/50 y 100/);
  });

  it('«ninguna» apaga la malla electrosoldada', () => {
    const current = cuadroReal();
    const p = plan(payload({ estudio: estudio({ malla: 'ninguna' }) }), current);
    expect(p.fields.estudio!.malla).toBeNull();
  });

  it('un perfil idéntico al vigente deja UNA línea, no nueve', () => {
    const current = cuadroReal();
    const p = plan(payload({ estudio: estudio() }), current);
    expect(p.fields.estudio).toBeUndefined();
    expect(p.changes.filter((c) => c.field.startsWith('estudio.'))).toEqual([]);
    expect(p.skipped.filter((s) => s.field === 'estudio')).toHaveLength(1);
  });
});

describe('la madera', () => {
  it('una clase GL con tipo aserrado se rechaza, y lo explica', () => {
    const current = { ...cuadroReal(), usaMadera: true };
    const p = plan(payload({ madera: [madera({ tipo: 'maciza', clase_resistente: 'GL24h' })] }), current);
    expect(p.fields.maderaGrupos).toBeUndefined();
    const k = p.skipped.find((s) => s.field === 'madera');
    expect(k?.reason).toMatch(/no es una clase de madera aserrada/);
    expect(k?.reason).toMatch(/C24/);
  });

  it('una especie que no está en el DB SE-M se rechaza y va a notFound', () => {
    const current = { ...cuadroReal(), usaMadera: true };
    const p = plan(payload({ madera: [madera({ especie: 'Quercus robur' })] }), current);
    expect(p.notFound).toContain('Especie «Quercus robur»');
    expect(p.skipped.find((s) => s.field === 'madera')?.reason).toMatch(/no está en el catálogo/);
  });

  it('un grupo correcto entra entero', () => {
    const current = { ...cuadroReal(), usaMadera: true };
    const p = plan(payload({ madera: [madera({ tipo: 'laminada', clase_resistente: 'GL28h', situacion: 'exterior' })] }), current);
    expect(p.fields.maderaGrupos![0]).toMatchObject({
      nombre: 'Vigas y pilares', situacion: 'exterior', tipo: 'laminada', claseResistente: 'GL28h',
    });
  });
});

describe('el acero estructural', () => {
  it('«sugerida» deja la protección sin prescribir a mano', () => {
    const current = { ...cuadroReal(), usaAceroEstructural: true };
    const p = plan(payload({
      acero: { nivel_riesgo: 'CC2', categoria_uso: 'SC1', categoria_ejecucion: 'PC1', elementos: [elemAcero()] },
    }), current);
    expect(p.fields.aceroEstr!.elementos[0].proteccion).toBeUndefined();
  });

  it('una protección prescrita a mano llega con su detalle', () => {
    const current = { ...cuadroReal(), usaAceroEstructural: true };
    const p = plan(payload({
      acero: {
        nivel_riesgo: 'CC2', categoria_uso: 'SC1', categoria_ejecucion: 'PC2',
        elementos: [elemAcero({ corrosividad: 'C5', proteccion: 'galvanizado', caracteristicas_proteccion: 'Dúplex: galvanizado + pintura' })],
      },
    }), current);
    const e = p.fields.aceroEstr!.elementos[0];
    expect(e.proteccion).toBe('galvanizado');
    expect(e.caracteristicasProteccion).toBe('Dúplex: galvanizado + pintura');
  });
});

describe('la resistencia al fuego', () => {
  it('una R que la tabla no tabula se rechaza', () => {
    const current = cuadroReal();
    const p = plan(payload({ fuego: [{ ambito: 'Plantas sobre rasante', minutos: 45 }] }), current);
    expect(p.fields.exigenciasFuego).toBeUndefined();
    expect(p.skipped.find((s) => s.field === 'fuego')?.reason).toMatch(/no es una de las resistencias tabuladas/);
  });

  it('una exigencia sin ámbito se rechaza: sería un hueco rojo', () => {
    const current = cuadroReal();
    const p = plan(payload({ fuego: [{ ambito: '  ', minutos: 90 }] }), current);
    expect(p.skipped.find((s) => s.field === 'fuego')?.reason).toMatch(/sin ámbito/i);
  });

  it('dos ámbitos con su R entran enteros', () => {
    const current = cuadroReal();
    const p = plan(payload({
      fuego: [
        { ambito: 'Plantas sobre rasante', minutos: 90 },
        { ambito: 'Sótano con aparcamiento', minutos: 120 },
      ],
    }), current);
    expect(p.fields.exigenciasFuego!.map((f) => [f.ambito, f.minutos])).toEqual([
      ['Plantas sobre rasante', 90],
      ['Sótano con aparcamiento', 120],
    ]);
  });
});

describe('seguridad — lo que se protege son las magnitudes DERIVADAS', () => {
  /** Un cuadro con el ambiente ya declarado a mano: el gate está abierto. */
  const conAmbiente = (): MaterialesState => ({
    ...cuadroReal(),
    elementos: [
      { ...filaDesdePreset('Cimentación'), situacion: 'enterrado' },
      { ...filaDesdePreset('Estructura exterior (intemperie)'), id: nuevoId(), situacion: 'exterior_lluvia' },
    ],
    costa: true,
  });

  it('suavizar la situación baja el recubrimiento: fila roja', () => {
    const current = conAmbiente();
    const p = plan(payload({
      hormigon: [
        hormigon({ nombre: 'Cimentación', situacion: 'enterrado' }),
        hormigon({ nombre: 'Estructura exterior (intemperie)', situacion: 'interior_seco' }),
      ],
    }), current);
    const r = p.risks.find((x) => x.field === 'hormigon[1].cnom');
    expect(r).toBeDefined();
    expect(Number(r!.after.replace(/\D/g, ''))).toBeLessThan(Number(r!.before.replace(/\D/g, '')));
    expect(r!.why).toMatch(/protege la armadura/);
  });

  it('desmarcar la costa es un riesgo: quita XS1 de media obra', () => {
    const current = conAmbiente();
    const p = plan(payload({ obra: { costa: false, heladas: false, terreno_agresivo: 'ninguna' } }), current);
    expect(p.risks.map((r) => r.field)).toContain('costa');
  });

  it('bajar la agresividad del terreno es un riesgo', () => {
    const current: MaterialesState = { ...conAmbiente(), terrenoAgresivo: 'alta' };
    const p = plan(payload({ obra: { costa: true, heladas: false, terreno_agresivo: 'debil' } }), current);
    const r = p.risks.find((x) => x.field === 'terreno_agresivo');
    expect(r).toBeDefined();
    expect(r!.why).toMatch(/geot[ée]cnico/);
  });

  it('bajar el acero pasivo es un riesgo', () => {
    const current: MaterialesState = { ...conAmbiente(), estudio: { ...base().estudio, aceroPasivo: 'B500SD' } };
    const p = plan(payload({ estudio: estudio({ acero_pasivo: 'B400S' }) }), current, new Set(['estudio']));
    const r = p.risks.find((x) => x.field === 'fyk_acero_pasivo');
    expect(r).toBeDefined();
    expect(r!.before).toBe('500 N/mm²');
    expect(r!.after).toBe('400 N/mm²');
  });

  it('declarar un control de ejecución intenso que no hay adelgaza el recubrimiento: fila roja', () => {
    const current = conAmbiente();
    const p = plan(payload({ estudio: estudio({ control_ejecucion: 'prefabricado_intenso' }) }), current);
    expect(p.risks.filter((r) => r.field.endsWith('.cnom')).length).toBeGreaterThan(0);
  });

  it('apagar un material es un riesgo, aunque no baje ninguna magnitud', () => {
    const current = conAmbiente();
    const p = plan(payload({ materiales_usados: { hormigon: false, acero_estructural: false, madera: false } }), current);
    expect(p.risks.map((r) => r.field)).toContain('materiales_usados.usaHormigon');
  });

  it('rebajar la R exigida es un riesgo', () => {
    const s = conAmbiente();
    const current: MaterialesState = {
      ...s,
      exigenciasFuego: [{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 120 }],
    };
    const p = plan(payload({ fuego: [{ ambito: 'Plantas sobre rasante', minutos: 60 }] }), current);
    const r = p.risks.find((x) => x.field === 'fuego.Plantas sobre rasante');
    expect(r).toBeDefined();
    expect(r!.before).toBe('R120');
    expect(r!.after).toBe('R60');
  });

  it('quitar una exigencia de fuego también', () => {
    const s = conAmbiente();
    const current: MaterialesState = {
      ...s,
      exigenciasFuego: [{ id: 'f1', ambito: 'Plantas sobre rasante', minutos: 120 }],
    };
    const p = plan(payload({ fuego: [] }), current);
    expect(p.risks.find((x) => x.field === 'fuego.Plantas sobre rasante')?.after).toBe('sin exigencia');
  });

  it('GATE: sobre el cuadro de arranque, la primera propuesta es RELLENAR', () => {
    const virgen = base();
    const p = plan(payload({
      hormigon: [hormigon({ nombre: 'Cimentación', situacion: 'interior_seco', fck_Nmm2: 25 })],
    }), virgen);
    expect(p.risks.filter((r) => r.field.startsWith('hormigon['))).toEqual([]);
  });

  it('…pero si el hilo ya trató el cuadro, el gate se levanta', () => {
    const virgen = base();
    const p = plan(
      payload({ hormigon: [hormigon({ nombre: 'Cimentación', situacion: 'interior_seco', fck_Nmm2: 25 })] }),
      virgen,
      new Set(['hormigon']),
    );
    expect(p.risks.length).toBeGreaterThan(0);
  });

  it('subir la exigencia nunca es un riesgo', () => {
    const current = conAmbiente();
    const p = plan(payload({
      obra: { costa: true, heladas: true, terreno_agresivo: 'alta' },
      estudio: estudio({ vida_util_anios: 100 }),
    }), current);
    expect(p.risks).toEqual([]);
  });
});

describe('el resumen de resultados', () => {
  it('lleva la tipificación, el recubrimiento y el aviso de alcance', () => {
    const resumen = summarizeMaterialesResults(evaluar(cuadroReal()));
    expect(resumen.text).toMatch(/tipificación HA-/);
    expect(resumen.text).toMatch(/recubrimiento \d+ mm/);
    expect(resumen.text).toMatch(/NO comprueba ninguna sección/);
    // Nunca 'ok': este módulo no comprueba nada.
    expect(resumen.verdict).not.toBe('ok');
  });

  it('una fila sin situación sale como hueco y bloquea', () => {
    const s = cuadroReal();
    const current: MaterialesState = {
      ...s,
      elementos: [{ ...s.elementos[0], nombre: 'Pilares raros', situacion: '' }],
    };
    const resumen = summarizeMaterialesResults(evaluar(current));
    expect(resumen.verdict).toBe('invalid');
    expect(resumen.text).toMatch(/HUECO: el elemento de hormigón «Pilares raros»/);
  });

  it('dice cuándo la durabilidad ha subido la resistencia por encima de la especificada', () => {
    const s = cuadroReal();
    const current: MaterialesState = {
      ...s,
      costa: true,
      elementos: [{ ...filaDesdePreset('Estructura exterior (intemperie)'), fck: 25, situacion: 'marino' }],
    };
    const resumen = summarizeMaterialesResults(evaluar(current));
    expect(resumen.text).toMatch(/la durabilidad exige/);
  });
});

describe('lo que el prompt prohíbe', () => {
  const reglas = materialesAdapter.promptRules;

  it('el recubrimiento no se cita de memoria ni se propone', () => {
    expect(reglas).toMatch(/EL RECUBRIMIENTO NO ES UN CAMPO DE TU PROPUESTA/);
  });

  it('la resistencia al fuego no se deduce', () => {
    expect(reglas).toMatch(/LA RESISTENCIA AL FUEGO NO SE DEDUCE/);
    expect(reglas).toMatch(/DB SI 6/);
  });

  it('la agresividad del terreno sale del geotécnico', () => {
    expect(reglas).toMatch(/LA AGRESIVIDAD DEL TERRENO LA DICE EL GEOTÉCNICO/);
  });

  it('pide dejar en null lo que el enunciado no menciona', () => {
    expect(reglas).toMatch(/DÉJALO EN NULL/);
  });

  it('dice que el módulo no comprueba ninguna sección', () => {
    expect(reglas).toMatch(/NO COMPRUEBA NINGUNA SECCIÓN/);
  });
});

describe('contrato del adapter', () => {
  it('el esquema cabe holgadamente en el tope de uniones de Anthropic', () => {
    const unions = countAnthropicUnions(buildChatSchema(MATERIALES_PAYLOAD_SCHEMA));
    // 7 anulables de primer nivel + la unión de `proposal` del envelope.
    expect(unions).toBe(8);
    expect(unions).toBeLessThanOrEqual(16);
  });

  it('todo objeto anidado declara required exhaustivo y additionalProperties false', () => {
    const visitar = (node: unknown, ruta: string, fallos: string[]) => {
      if (Array.isArray(node) || typeof node !== 'object' || node === null) return;
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
    visitar(MATERIALES_PAYLOAD_SCHEMA, 'payload', fallos);
    expect(fallos).toEqual([]);
  });

  it('cada regla resuelta explica POR QUÉ ese campo no es una variable de diseño', () => {
    for (const r of MATERIALES_RESOLVED_RULES) expect(r.why.length).toBeGreaterThan(60);
  });

  it('se anuncia con su id y pide más historial que el corriente', () => {
    expect(materialesAdapter.id).toBe('materiales');
    expect(materialesAdapter.historyTurns).toBeGreaterThan(12);
  });
});
