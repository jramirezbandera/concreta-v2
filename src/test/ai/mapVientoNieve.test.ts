// Mapper del asistente IA de «Viento y nieve» (ola 8).
//
// La invariante que más importa aquí es una ausencia: la zona eólica y la de
// clima invernal NO son campos del payload. Salen de los mapas D.1 y E.2 a
// partir de la provincia, y una letra dicha de memoria decidiría la presión de
// todo el edificio con el documento afirmando que viene del mapa. Es la misma
// doctrina que la `ab` del IGN en el sísmico.

import { describe, it, expect } from 'vitest';
import {
  vientoNieveAdapter,
  summarizeVientoNieveResults,
  VIENTO_NIEVE_PAYLOAD_SCHEMA,
  VIENTO_NIEVE_RESOLVED_RULES,
  type EmplazamientoAi,
  type FaldonAi,
  type NieveAi,
  type PlantaAi,
  type VientoAi,
} from '../../lib/ai/modules/vientoNieve';
import { buildChatSchema } from '../../lib/ai/chatSchema';
import { countAnthropicUnions } from '../../lib/ai/providers/schemaConvert';
import {
  defaultVientoNieveState,
  evaluar,
  nuevaPlanta,
  nuevoFaldon,
  zonasEfectivas,
  type VientoNieveState,
} from '../../features/viento-nieve/state';

const SI = 'si' as const;

const emplazamiento = (over: Partial<EmplazamientoAi> = {}): EmplazamientoAi => ({
  provincia_ine: '40', municipio: 'Segovia', altitud_m: 1000, es_capital: true, ...over,
});

const viento = (over: Partial<VientoAi> = {}): VientoAi => ({
  activo: true,
  qb_modo: 'zona',
  qb_manual_kNm2: 0.5,
  aspereza: 'IV',
  superficie: 'rugosa',
  dimension_x_m: 22,
  dimension_y_m: 14,
  cubierta: { activa: false, pendiente_grados: 20, cumbrera: 'x', altura_coronacion_m: 0, area_modo: 'zona', area_propia_m2: 5 },
  paramentos: { activos: false, area_modo: 'zona', area_propia_m2: 5 },
  ...over,
});

const nieve = (over: Partial<NieveAi> = {}): NieveAi => ({
  activo: true, exposicion: 'normal', sk_modo: 'auto', sk_manual_kNm2: 1, ...over,
});

const planta = (nombre: string, altura_m: number): PlantaAi => ({ nombre, altura_m });

const faldon = (over: Partial<FaldonAi> = {}): FaldonAi => ({
  nombre: 'Cubierta',
  inclinacion_grados: 0,
  impedimento: false,
  L_m: 0,
  limahoya: 'ninguna',
  inclinacion_otro_grados: 0,
  voladizo: false,
  ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  emplazamiento: null, viento: null, plantas: null, nieve: null, faldones: null, warnings: [], ...over,
});

const plan = (p: Record<string, unknown>, current: VientoNieveState, confirmed = new Set<string>()) =>
  vientoNieveAdapter.buildPlan(p, current, SI, confirmed);

const base = () => defaultVientoNieveState();

/** Un edificio YA MODELADO: el gate anti-ruido está abierto. */
function edificioReal(): VientoNieveState {
  const s = base();
  return {
    ...s,
    emplazamiento: { provincia: '40', municipio: 'Segovia', altitud: 1000, esCapital: true, zonaEolica: null, zonaInvernal: null },
    viento: {
      ...s.viento,
      dimensiones: { x: 22, y: 14 },
      plantas: [nuevaPlanta('Planta Baja', 3.5), nuevaPlanta('Planta Primera', 3), nuevaPlanta('Planta Segunda', 3), nuevaPlanta('Cubierta', 3)],
    },
    nieve: { ...s.nieve, faldones: [nuevoFaldon('Faldón norte', 25), nuevoFaldon('Faldón sur', 25)] },
  };
}

describe('las zonas de los mapas NO son del asistente', () => {
  it('ni la eólica ni la invernal son campos del payload', () => {
    const props = VIENTO_NIEVE_PAYLOAD_SCHEMA.properties as Record<string, Record<string, unknown>>;
    const emp = (props.emplazamiento.properties ?? {}) as Record<string, unknown>;
    expect(Object.keys(emp)).toEqual(['provincia_ine', 'municipio', 'altitud_m', 'es_capital']);
    expect(JSON.stringify(VIENTO_NIEVE_PAYLOAD_SCHEMA)).not.toContain('zona_eolica');
    expect(JSON.stringify(VIENTO_NIEVE_PAYLOAD_SCHEMA)).not.toContain('zona_invernal');
  });

  it('una zona forzada por el proyectista SOBREVIVE a un cambio que no toca la provincia', () => {
    const s = edificioReal();
    const current: VientoNieveState = { ...s, emplazamiento: { ...s.emplazamiento, zonaEolica: 'C' } };
    const p = plan(payload({ emplazamiento: emplazamiento({ altitud_m: 1100 }) }), current);
    expect(p.fields.emplazamiento!.zonaEolica).toBe('C');
  });

  it('cambiar de provincia REARMA las zonas: la forzada era de otro municipio', () => {
    const s = edificioReal();
    const current: VientoNieveState = { ...s, emplazamiento: { ...s.emplazamiento, zonaEolica: 'C', zonaInvernal: 6 } };
    const p = plan(payload({ emplazamiento: emplazamiento({ provincia_ine: '29', municipio: 'Málaga' }) }), current);
    expect(p.fields.emplazamiento!.provincia).toBe('29');
    expect(p.fields.emplazamiento!.zonaEolica).toBeNull();
    expect(p.fields.emplazamiento!.zonaInvernal).toBeNull();
  });

  it('el snapshot se las enseña como contexto de lectura, con su aviso', () => {
    const snap = JSON.parse(vientoNieveAdapter.snapshot(edificioReal())) as { valores: Record<string, unknown> };
    const z = snap.valores.zonas_que_pone_la_norma as Record<string, unknown>;
    expect(z.provincia).toBe('Segovia');
    expect(z.zona_eolica).not.toBeNull();
    expect(String(z.nota)).toMatch(/NUNCA las cites de memoria/);
  });

  it('un código INE que no existe se rechaza y va a notFound', () => {
    const current = edificioReal();
    const p = plan(payload({ emplazamiento: emplazamiento({ provincia_ine: '99' }) }), current);
    expect(p.notFound).toContain('Provincia con INE «99»');
    expect(p.fields.emplazamiento?.provincia ?? '40').toBe('40');
  });
});

describe('el emplazamiento', () => {
  it('la provincia, el municipio, la altitud y la capital llegan enteros', () => {
    const current = base();
    const p = plan(payload({ emplazamiento: emplazamiento() }), current);
    expect(p.fields.emplazamiento).toMatchObject({
      provincia: '40', municipio: 'Segovia', altitud: 1000, esCapital: true,
    });
  });

  it('una altitud fuera de rango se rechaza', () => {
    const current = edificioReal();
    const p = plan(payload({ emplazamiento: emplazamiento({ altitud_m: 9000 }) }), current);
    expect(p.fields.emplazamiento?.altitud ?? 1000).toBe(1000);
    expect(p.skipped.find((s) => s.field === 'emplazamiento')?.reason).toMatch(/Fuera de rango/);
  });

  it('un emplazamiento idéntico deja UNA línea, no cuatro', () => {
    const current = edificioReal();
    const p = plan(payload({ emplazamiento: emplazamiento() }), current);
    expect(p.fields.emplazamiento).toBeUndefined();
    expect(p.changes.filter((c) => c.field.startsWith('emplazamiento.'))).toEqual([]);
    expect(p.skipped.filter((s) => s.field === 'emplazamiento')).toHaveLength(1);
  });
});

describe('las plantas se teclean de forjado a forjado', () => {
  it('la lista reemplaza la vigente y conserva los ids por posición', () => {
    const current = edificioReal();
    const ids = current.viento.plantas.map((p) => p.id);
    const p = plan(payload({
      plantas: [planta('Planta Baja', 4), planta('Planta Primera', 3), planta('Cubierta', 3)],
    }), current);
    expect(p.fields.viento!.plantas.map((x) => x.id)).toEqual(ids.slice(0, 3));
    expect(p.fields.viento!.plantas.map((x) => x.altura)).toEqual([4, 3, 3]);
  });

  it('la cota se DERIVA de las alturas, no se teclea', () => {
    const current = edificioReal();
    const p = plan(payload({ plantas: [planta('Baja', 4), planta('Primera', 3), planta('Cubierta', 3)] }), current);
    const final: VientoNieveState = { ...current, ...p.fields };
    const snap = JSON.parse(vientoNieveAdapter.snapshot(final)) as { valores: Record<string, unknown> };
    expect(snap.valores.cotas_derivadas_m).toEqual([4, 7, 10]);
    // Y la fila del payload lleva ALTURA, no cota: la palabra «cota» sólo puede
    // aparecer en las descripciones (que es donde se le explica al modelo).
    const props = VIENTO_NIEVE_PAYLOAD_SCHEMA.properties as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
    expect(Object.keys(props.plantas.items.properties)).toEqual(['nombre', 'altura_m']);
  });

  it('una lista vacía se rechaza', () => {
    const current = edificioReal();
    const p = plan(payload({ plantas: [] }), current);
    expect(p.fields.viento).toBeUndefined();
    expect(p.skipped.find((s) => s.field === 'plantas')?.reason).toMatch(/vac[íi]a/i);
  });

  it('una altura absurda se rechaza sin romper el resto', () => {
    const current = edificioReal();
    const p = plan(payload({ plantas: [planta('Baja', 300), planta('Primera', 3)] }), current);
    expect(p.fields.viento).toBeUndefined();
    expect(p.skipped.find((s) => s.field === 'plantas')?.reason).toMatch(/fuera de rango/i);
  });
});

describe('el viento', () => {
  it('la cubierta a dos aguas entra con su pendiente y su cumbrera', () => {
    const current = edificioReal();
    const p = plan(payload({
      viento: viento({ cubierta: { activa: true, pendiente_grados: 25, cumbrera: 'y', altura_coronacion_m: 0, area_modo: 'zona', area_propia_m2: 5 } }),
    }), current);
    expect(p.fields.viento!.cubierta).toMatchObject({ activa: true, pendiente: 25, cumbrera: 'y' });
  });

  it('altura de coronación 0 es el centinela de «la calcula la aplicación»', () => {
    const current = edificioReal();
    const p = plan(payload({
      viento: viento({ cubierta: { activa: true, pendiente_grados: 25, cumbrera: 'x', altura_coronacion_m: 0, area_modo: 'zona', area_propia_m2: 5 } }),
    }), current);
    expect(p.fields.viento!.cubierta.alturaCoronacion).toBeNull();
  });

  it('una pendiente fuera del Anejo D.6 se rechaza y la vigente se conserva', () => {
    const current = edificioReal();
    const p = plan(payload({
      viento: viento({ cubierta: { activa: true, pendiente_grados: 80, cumbrera: 'x', altura_coronacion_m: 0, area_modo: 'zona', area_propia_m2: 5 } }),
    }), current);
    expect(p.fields.viento?.cubierta.pendiente ?? 20).toBe(20);
    expect(p.skipped.find((s) => s.field === 'viento')?.reason).toMatch(/75º/);
  });

  it('unas dimensiones imposibles se rechazan', () => {
    const current = edificioReal();
    const p = plan(payload({ viento: viento({ dimension_x_m: 0 }) }), current);
    expect(p.skipped.find((s) => s.field === 'viento')?.reason).toMatch(/Fuera de rango/);
  });
});

describe('la nieve y los faldones', () => {
  it('un faldón con limahoya y voladizo llega entero', () => {
    const current = edificioReal();
    const p = plan(payload({
      faldones: [faldon({ nombre: 'Faldón norte', inclinacion_grados: 25, L_m: 6, limahoya: 'contrario', inclinacion_otro_grados: 30, voladizo: true })],
    }), current);
    expect(p.fields.nieve!.faldones[0]).toMatchObject({
      nombre: 'Faldón norte', inclinacion: 25, L: 6, limahoya: 'contrario', inclinacionOtro: 30, voladizo: true,
    });
  });

  it('L = 0 es el centinela de «no se conoce»: sin acumulación', () => {
    const current = edificioReal();
    const p = plan(payload({ faldones: [faldon({ L_m: 0 })] }), current);
    expect(p.fields.nieve!.faldones[0].L).toBeNull();
  });

  it('un valor propio de sk fuera de rango se rechaza y el modo vuelve al vigente', () => {
    const current = edificioReal();
    const p = plan(payload({ nieve: nieve({ sk_modo: 'manual', sk_manual_kNm2: 99 }) }), current);
    expect(p.fields.nieve?.skModo ?? 'auto').toBe('auto');
    expect(p.skipped.find((s) => s.field === 'nieve')?.reason).toMatch(/Fuera de rango/);
  });

  it('una lista de faldones vacía se rechaza: una cubierta plana es UN faldón de 0º', () => {
    const current = edificioReal();
    const p = plan(payload({ faldones: [] }), current);
    expect(p.fields.nieve).toBeUndefined();
    expect(p.skipped.find((s) => s.field === 'faldones')?.reason).toMatch(/UN faldón de 0º/);
  });
});

describe('seguridad — lo que se protege son las ACCIONES resueltas', () => {
  it('bajar el grado de aspereza de IV a V rebaja la fuerza: fila roja', () => {
    const current = edificioReal();
    const p = plan(payload({ viento: viento({ aspereza: 'V' }) }), current);
    const r = p.risks.find((x) => x.field === 'viento.F_x');
    expect(r).toBeDefined();
    expect(r!.why).toMatch(/aspereza del entorno/);
  });

  it('subir la aspereza hacia I nunca es un riesgo', () => {
    const current = edificioReal();
    const p = plan(payload({ viento: viento({ aspereza: 'I' }) }), current);
    expect(p.risks).toEqual([]);
  });

  it('pasar a la qb simplificada en zona C es un riesgo: 0,5 queda por debajo de 0,52', () => {
    const s = edificioReal();
    // Zona C forzada por el proyectista, como cuando el municipio cruza la línea.
    const current: VientoNieveState = { ...s, emplazamiento: { ...s.emplazamiento, zonaEolica: 'C' } };
    expect(zonasEfectivas(current.emplazamiento).zonaEolica).toBe('C');
    const p = plan(payload({ viento: viento({ qb_modo: 'simplificado' }) }), current, new Set(['viento']));
    const r = p.risks.find((x) => x.field === 'qb');
    expect(r).toBeDefined();
    expect(r!.why).toMatch(/POR DEBAJO en la zona C/);
  });

  it('declarar la cubierta «protegida» rebaja la nieve un 20 %: fila roja', () => {
    const current = edificioReal();
    const p = plan(payload({ nieve: nieve({ exposicion: 'protegida' }) }), current, new Set(['nieve']));
    const r = p.risks.find((x) => x.field === 'sk_efectiva');
    expect(r).toBeDefined();
    expect(r!.why).toMatch(/20 %/);
  });

  it('enderezar un faldón sube su coeficiente de forma: no es un riesgo', () => {
    const current = edificioReal();
    const p = plan(payload({ faldones: [faldon({ inclinacion_grados: 10 }), faldon({ inclinacion_grados: 10 })] }), current);
    expect(p.risks.filter((r) => r.field.endsWith('.qn'))).toEqual([]);
  });

  it('inclinar un faldón por encima de 30º rebaja su carga de nieve: fila roja', () => {
    const current = edificioReal();
    const p = plan(payload({ faldones: [faldon({ inclinacion_grados: 50 }), faldon({ inclinacion_grados: 50 })] }), current);
    const r = p.risks.find((x) => x.field === 'faldones[0].qn');
    expect(r).toBeDefined();
    expect(r!.why).toMatch(/coeficiente de forma/);
  });

  it('apagar el viento o la nieve es un riesgo, aunque no baje ninguna magnitud', () => {
    const current = edificioReal();
    const p = plan(payload({ viento: viento({ activo: false }), nieve: nieve({ activo: false }) }), current);
    expect(p.risks.map((r) => r.field)).toContain('viento.activo');
    expect(p.risks.map((r) => r.field)).toContain('nieve.activo');
  });

  it('quitar plantas y faldones es un riesgo agregado', () => {
    const current = edificioReal();
    const p = plan(payload({
      plantas: [planta('Baja', 3.5), planta('Primera', 3)],
      faldones: [faldon({ inclinacion_grados: 25 })],
    }), current);
    expect(p.risks.map((r) => r.field)).toContain('plantas.eliminadas');
    expect(p.risks.map((r) => r.field)).toContain('faldones.eliminados');
  });

  it('GATE: sobre el edificio de arranque, la primera propuesta es MODELAR', () => {
    const s = base();
    const virgen: VientoNieveState = { ...s, emplazamiento: { ...s.emplazamiento, provincia: '40', altitud: 1000 } };
    const p = plan(payload({
      viento: viento({ aspereza: 'V', dimension_x_m: 10, dimension_y_m: 8 }),
      plantas: [planta('Baja', 3)],
    }), virgen);
    expect(p.risks.filter((r) => r.field.startsWith('viento.F_') || r.field.endsWith('.eliminadas'))).toEqual([]);
  });

  it('…pero si el hilo ya trató el edificio, el gate se levanta', () => {
    const s = base();
    const virgen: VientoNieveState = { ...s, emplazamiento: { ...s.emplazamiento, provincia: '40', altitud: 1000 } };
    const p = plan(
      payload({ viento: viento({ aspereza: 'V' }) }),
      virgen,
      new Set(['viento']),
    );
    expect(p.risks.length).toBeGreaterThan(0);
  });

  it('apagar una acción salta aunque el edificio sea el de arranque: no depende del gate', () => {
    const s = base();
    const virgen: VientoNieveState = { ...s, emplazamiento: { ...s.emplazamiento, provincia: '40', altitud: 1000 } };
    const p = plan(payload({ nieve: nieve({ activo: false }) }), virgen);
    expect(p.risks.map((r) => r.field)).toContain('nieve.activo');
  });
});

describe('el resumen de resultados', () => {
  it('lleva las zonas, la fuerza por dirección y la nieve de cada faldón', () => {
    const resumen = summarizeVientoNieveResults(evaluar(edificioReal()));
    expect(resumen.text).toMatch(/zona eólica/);
    expect(resumen.text).toMatch(/F total = /);
    expect(resumen.text).toMatch(/Faldón norte/);
    expect(resumen.text).toMatch(/NO comprueba nada/);
    // Nunca 'ok': este módulo no comprueba nada.
    expect(resumen.verdict).not.toBe('ok');
  });

  it('dice cuándo una zona la ha FORZADO el proyectista', () => {
    const s = edificioReal();
    const current: VientoNieveState = { ...s, emplazamiento: { ...s.emplazamiento, zonaEolica: 'C' } };
    const resumen = summarizeVientoNieveResults(evaluar(current));
    expect(resumen.text).toMatch(/FORZADA por el proyectista/);
  });

  it('sin provincia, el cálculo sale incompleto y bloquea', () => {
    const s = base();
    const current: VientoNieveState = { ...s, emplazamiento: { ...s.emplazamiento, provincia: '', altitud: 800 } };
    const resumen = summarizeVientoNieveResults(evaluar(current));
    expect(resumen.verdict).toBe('invalid');
    expect(resumen.text).toMatch(/falta la provincia/);
  });
});

describe('lo que el prompt prohíbe', () => {
  const reglas = vientoNieveAdapter.promptRules;

  it('las zonas de los mapas no se citan de memoria', () => {
    expect(reglas).toMatch(/LA ZONA EÓLICA Y LA DE CLIMA INVERNAL NO LAS PONES TÚ/);
    expect(reglas).toMatch(/NUNCA digas de memoria en qué zona/);
  });

  it('ni sk ni qb se citan de memoria', () => {
    expect(reglas).toMatch(/NI sk NI qb SE CITAN DE MEMORIA/);
  });

  it('la exposición de la nieve no es una variable de ajuste', () => {
    expect(reglas).toMatch(/LA EXPOSICIÓN DE LA NIEVE NO ES UNA VARIABLE DE AJUSTE/);
  });

  it('pide dejar en null lo que no cambia y dice que no comprueba nada', () => {
    expect(reglas).toMatch(/DÉJALO EN NULL/);
    expect(reglas).toMatch(/NO COMPRUEBA NADA/);
  });
});

describe('contrato del adapter', () => {
  it('el esquema cabe holgadamente en el tope de uniones de Anthropic', () => {
    const unions = countAnthropicUnions(buildChatSchema(VIENTO_NIEVE_PAYLOAD_SCHEMA));
    // 5 anulables de primer nivel + la unión de `proposal` del envelope.
    expect(unions).toBe(6);
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
    visitar(VIENTO_NIEVE_PAYLOAD_SCHEMA, 'payload', fallos);
    expect(fallos).toEqual([]);
  });

  it('cada regla resuelta explica POR QUÉ ese campo no es una variable de diseño', () => {
    for (const r of VIENTO_NIEVE_RESOLVED_RULES) expect(r.why.length).toBeGreaterThan(60);
  });

  it('se anuncia con su id y pide más historial que el corriente', () => {
    expect(vientoNieveAdapter.id).toBe('viento-nieve');
    expect(vientoNieveAdapter.historyTurns).toBeGreaterThan(12);
  });
});
