/**
 * El asistente del módulo de incendio: lo que puede tocar y lo que no.
 *
 * Este adapter es el que MÁS deja fuera de los veinticinco, y la mitad de este
 * fichero existe para que nadie lo «arregle» metiendo lo que falta:
 *
 *  1. NO HAY CAMPO DE MINUTOS. La R exigida sale de la tabla 3.1 cruzando el
 *     uso con la altura de evacuación. Un modelo contesta «R 90» de memoria con
 *     toda la seguridad del mundo y acierta lo bastante a menudo como para que
 *     nadie lo compruebe; aquí ese número se imprime en la memoria y en el
 *     plano. El modelo dice QUÉ ES el sector; la R la pone la norma.
 *  2. NO HAY λp DE PRODUCTO. La conductividad declarada de un revestimiento
 *     sale de su marcado CE, y el λ de catálogo de una lana de roca a 20 ºC da
 *     7 mm donde en obra van 40 (ver `protecciones.ts`).
 *  3. LO QUE LA LISTA NO PROYECTA, SE CONSERVA. `sectores` y `elementos`
 *     reemplazan la lista entera pero no llevan todos los campos: reemplazar
 *     no puede significar borrar el tiempo equivalente del Anejo B de un sector
 *     —media hora de tecleo— sin una fila que lo diga.
 *
 * Y los riesgos, que aquí no son campos: lo que baja la R es marcar una
 * cubierta como de ocupación nula, que no mueve ningún número visible.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  INCENDIO_PAYLOAD_SCHEMA,
  INCENDIO_RESOLVED_RULES,
  incendioAdapter,
  parsePayload,
  summarizeIncendioResults,
} from '../../lib/ai/modules/incendio';
import {
  defaultIncendioState,
  evaluar,
  type IncendioState,
} from '../../features/incendio/state';
import { entradaHormigonInicial } from '../../lib/incendio/anejoC';
import { entradaAceroInicial } from '../../lib/incendio/anejoD';
import { claseUso, datosAnejoBIniciales } from '../../lib/incendio/sectores';
import { publicar } from '../../lib/pub';

/** Lo poco del JSON Schema que este fichero necesita mirar. */
interface ItemsDe {
  items: { properties: Record<string, unknown> };
}
const itemsDe = (clave: 'sectores' | 'elementos'): ItemsDe =>
  (INCENDIO_PAYLOAD_SCHEMA as { properties: Record<string, ItemsDe> }).properties[clave];

/** El DB SI va en minutos, metros y milímetros: el sistema no cambia nada. */
const SI = 'si' as const;

const plan = (payload: Record<string, unknown>, current: IncendioState, confirmed = new Set<string>()) =>
  incendioAdapter.buildPlan(payload, current, SI, confirmed);

const VACIO = {
  modo_altura: null,
  altura_evacuacion_m: null,
  plantas: null,
  sectores: null,
  elementos: null,
  warnings: [],
};

const sectorAi = (o: Record<string, unknown> = {}) => ({
  nombre: 'Plantas sobre rasante',
  clase: claseUso('residencialVivienda'),
  sotano: false,
  robotizado: false,
  adosada: false,
  bajo_cubierta_sin_riesgo: false,
  ...o,
});

const elementoAi = (o: Record<string, unknown> = {}) => ({
  nombre: 'Soportes',
  sector: 'Plantas sobre rasante',
  material: 'hormigon',
  tipo_hormigon: 'soporte',
  b_mm: 300,
  h_mm: 300,
  alma_mm: 0,
  recubrimiento_mm: 35,
  cerco_mm: 8,
  barra_mm: 20,
  arido_calizo: false,
  perfil: '',
  tipo_acero: 'viga',
  modo_calentamiento: 'contorno3',
  masividad_m1: 0,
  mufi: 0,
  proteccion: '',
  ...o,
});

/** Un estado con un sector de vivienda y 10 m de altura de evacuación a mano. */
function conSector(o: Partial<IncendioState> = {}): IncendioState {
  return {
    ...defaultIncendioState(),
    alturaEvacuacionManual: 10,
    sectores: [
      {
        id: 's1',
        nombre: 'Plantas sobre rasante',
        clase: claseUso('residencialVivienda'),
        sotano: false,
        robotizado: false,
        adosada: false,
        bajoCubiertaSinRiesgo: false,
        minutosManual: null,
        anejoB: null,
      },
    ],
    ...o,
  };
}

beforeEach(() => {
  localStorage.clear();
});

// ── Lo que NO viaja ──────────────────────────────────────────────────────────

describe('la R exigida no es campo del payload', () => {
  const props = Object.keys(
    (INCENDIO_PAYLOAD_SCHEMA as { properties: Record<string, unknown> }).properties,
  );

  it('no hay ninguna clave de minutos ni de resistencia en el primer nivel', () => {
    expect(props).toEqual([
      'modo_altura',
      'altura_evacuacion_m',
      'plantas',
      'sectores',
      'elementos',
      'warnings',
    ]);
  });

  it('ni dentro de un sector, que es donde más tentaría', () => {
    const sector = itemsDe('sectores').items;
    expect(Object.keys(sector.properties)).not.toContain('minutos');
    expect(Object.keys(sector.properties)).not.toContain('r');
    // Lo que sí hay es QUÉ ES el sector: de ahí sale la fila de la tabla.
    expect(Object.keys(sector.properties)).toContain('clase');
    expect(Object.keys(sector.properties)).toContain('sotano');
  });

  it('ni dentro de un elemento: ni su R ni la conductividad del revestimiento', () => {
    const el = itemsDe('elementos').items;
    const claves = Object.keys(el.properties);
    expect(claves).not.toContain('r_exigida_min');
    expect(claves).not.toContain('lambda');
    expect(claves).not.toContain('espesor_mm');
    // La familia sí: es una elección de producto, no un dato de ensayo.
    expect(claves).toContain('proteccion');
  });

  it('y las reglas del prompt lo dicen con todas las letras', () => {
    expect(incendioAdapter.promptRules).toContain('TÚ NO DICES LA R');
    expect(incendioAdapter.promptRules).toContain('EL ESPESOR DEL REVESTIMIENTO NO LO DICES TÚ');
    expect(incendioAdapter.promptRules).toContain('nunca la sumes tú');
  });
});

// ── El convenio de alturas y la altura de evacuación ─────────────────────────

describe('la altura de evacuación', () => {
  it('se escribe a mano y se rotula como adoptada', () => {
    const p = plan({ ...VACIO, altura_evacuacion_m: 12.5 }, defaultIncendioState());
    expect(p.fields.alturaEvacuacionManual).toBe(12.5);
    expect(p.changes[0].after).toContain('adoptada');
  });

  it('con 0 se devuelve a la que sale de las plantas', () => {
    const p = plan({ ...VACIO, altura_evacuacion_m: 0 }, conSector());
    expect(p.fields.alturaEvacuacionManual).toBeNull();
    expect(p.changes[0].after).toContain('de las plantas');
  });

  it('un disparate se descarta en vez de aplicarse', () => {
    const p = plan({ ...VACIO, altura_evacuacion_m: 900 }, defaultIncendioState());
    expect(p.fields.alturaEvacuacionManual).toBeUndefined();
    expect(p.skipped[0].reason).toContain('Fuera de rango');
  });

  it('el convenio de alturas se explica en la fila, no con la palabra suelta', () => {
    const p = plan({ ...VACIO, modo_altura: 'libre' }, defaultIncendioState());
    expect(p.fields.modoAltura).toBe('libre');
    expect(p.changes[0].after).toContain('bajo el forjado');
  });
});

// ── Las plantas ──────────────────────────────────────────────────────────────

describe('las anotaciones de planta', () => {
  /** Un sobre de «Cargas por planta» con tres plantas, de arriba abajo. */
  const publicarPlantas = () =>
    publicar(
      'cargas-planta',
      1,
      {
        plantas: [
          { nombre: 'Cubierta', esCubierta: true, zonas: [{ fila: 'G1', forjado: { canto: 30 } }] },
          { nombre: 'Planta Primera', esCubierta: false, zonas: [{ fila: 'A1', forjado: { canto: 30 } }] },
          { nombre: 'Planta Baja', esCubierta: false, zonas: [{ fila: 'A1', forjado: { canto: 30 } }] },
        ],
      },
      {},
      true,
    );

  it('se pegan por nombre a las plantas publicadas', () => {
    publicarPlantas();
    const p = plan(
      {
        ...VACIO,
        plantas: [
          { nombre: 'Planta Baja', altura_m: 3.2, canto_m: 0, bajo_rasante: false, cuenta_evacuacion: 'como_proponga' },
          { nombre: 'Planta Primera', altura_m: 3, canto_m: 0, bajo_rasante: false, cuenta_evacuacion: 'como_proponga' },
        ],
      },
      defaultIncendioState(),
    );
    expect(p.fields.plantas?.map((x) => x.nombre)).toEqual(['Planta Baja', 'Planta Primera']);
    expect(p.fields.plantas?.[0].altura).toBe(3.2);
    // «como_proponga» NO es una decisión: la toma el uso del forjado.
    expect(p.fields.plantas?.[0].cuenta).toBeNull();
    expect(p.notFound).toEqual([]);
  });

  /**
   * El adapter empareja con `norm` —sin tildes ni mayúsculas— y el módulo con
   * `===` exacto. Guardar el nombre que trajo el modelo dejaba la anotación
   * huérfana con su altura dentro, y el aviso salía en el módulo, no aquí.
   */
  it('se guardan con el nombre EXACTO que publica Cargas por planta', () => {
    publicarPlantas();
    const p = plan(
      {
        ...VACIO,
        plantas: [
          { nombre: 'planta baja', altura_m: 3.2, canto_m: 0, bajo_rasante: false, cuenta_evacuacion: 'como_proponga' },
          { nombre: 'PLANTA PRIMERA', altura_m: 3, canto_m: 0, bajo_rasante: false, cuenta_evacuacion: 'como_proponga' },
        ],
      },
      defaultIncendioState(),
    );
    expect(p.fields.plantas?.map((x) => x.nombre)).toEqual(['Planta Baja', 'Planta Primera']);
    expect(p.notFound).toEqual([]);
  });

  it('una planta que no existe en el sobre se rechaza y se dice', () => {
    publicarPlantas();
    const p = plan(
      {
        ...VACIO,
        plantas: [
          { nombre: 'Planta Baja', altura_m: 3.2, canto_m: 0, bajo_rasante: false, cuenta_evacuacion: 'como_proponga' },
          { nombre: 'Ático', altura_m: 3, canto_m: 0, bajo_rasante: false, cuenta_evacuacion: 'como_proponga' },
        ],
      },
      defaultIncendioState(),
    );
    expect(p.notFound).toContain('Planta «Ático»');
    expect(p.fields.plantas?.map((x) => x.nombre)).toEqual(['Planta Baja']);
    expect(p.warnings.join(' ')).toContain('no están publicadas');
  });

  it('sin sobre ninguno no se rechaza nada: no hay contra qué comparar', () => {
    const p = plan(
      {
        ...VACIO,
        plantas: [{ nombre: 'Planta Baja', altura_m: 3, canto_m: 0, bajo_rasante: false, cuenta_evacuacion: 'como_proponga' }],
      },
      defaultIncendioState(),
    );
    expect(p.notFound).toEqual([]);
    expect(p.fields.plantas).toHaveLength(1);
  });
});

// ── Los sectores ─────────────────────────────────────────────────────────────

describe('los sectores', () => {
  it('reemplazan la lista y la R la pone la tabla', () => {
    const p = plan(
      { ...VACIO, sectores: [sectorAi(), sectorAi({ nombre: 'Aparcamiento', clase: claseUso('aparcamientoBajoOtroUso'), sotano: true })] },
      conSector(),
    );
    expect(p.fields.sectores).toHaveLength(2);
    const final: IncendioState = { ...conSector(), ...p.fields };
    const ev = evaluar(final, null);
    // R 60 la vivienda a 10 m, R 120 el aparcamiento bajo otro uso: ninguna
    // de las dos ha viajado en el payload.
    expect(ev.exigencias.map((e) => e.minutos)).toEqual([60, 120]);
  });

  it('un sector que vuelve con el mismo nombre CONSERVA su tiempo equivalente', () => {
    const conTed = conSector();
    conTed.sectores[0].anejoB = { ...datosAnejoBIniciales(), af: 400, av: 30, h: 3 };
    conTed.sectores[0].minutosManual = 90;

    const p = plan({ ...VACIO, sectores: [sectorAi()] }, conTed);
    // Nada ha cambiado en la proyección, así que no hay fila que aplicar.
    expect(p.skipped.map((s) => s.field)).toContain('sectores');

    // Y cambiando algo que SÍ viaja, lo que no viaja sigue ahí.
    const q = plan({ ...VACIO, sectores: [sectorAi({ sotano: true })] }, conTed);
    expect(q.fields.sectores?.[0].anejoB).not.toBeNull();
    expect(q.fields.sectores?.[0].minutosManual).toBe(90);
    expect(q.fields.sectores?.[0].id).toBe('s1');
    expect(q.warnings.join(' ')).toContain('Se conserva el tiempo equivalente');
  });

  it('un sector sin nombre no se puede imprimir, y se descarta', () => {
    const p = plan({ ...VACIO, sectores: [sectorAi({ nombre: '  ' })] }, defaultIncendioState());
    expect(p.fields.sectores).toBeUndefined();
    expect(p.skipped[0].reason).toContain('sin él no se puede imprimir');
  });
});

// ── Los elementos ────────────────────────────────────────────────────────────

describe('los nombres repetidos y los que se pierden', () => {
  /**
   * Dos filas con el mismo nombre heredaban el id del mismo sector anterior:
   * React pintaba dos hijos con la misma clave, los manejadores actuaban sobre
   * las dos tarjetas y los elementos colgaban todos de la primera.
   */
  it('dos sectores con el mismo nombre: se aplica el primero y se dice', () => {
    const p = plan(
      { ...VACIO, sectores: [sectorAi({ nombre: 'Sótano' }), sectorAi({ nombre: 'SÓTANO', sotano: true })] },
      defaultIncendioState(),
    );
    expect(p.fields.sectores).toHaveLength(1);
    expect(p.fields.sectores?.[0].sotano).toBe(false);
    expect(p.skipped.map((x) => x.label)).toContain('Sectores repetidos');
  });

  it('y dos elementos con el mismo nombre, igual', () => {
    const p = plan(
      { ...VACIO, elementos: [elementoAi(), elementoAi({ b_mm: 400 })] },
      conSector(),
    );
    expect(p.fields.elementos).toHaveLength(1);
    expect(p.fields.elementos?.[0].hormigon.b).toBe(300);
    expect(p.skipped.map((x) => x.label)).toContain('Elementos repetidos');
  });

  /**
   * Un sector que vuelve con otro nombre es un sector NUEVO: id nuevo, sin
   * Anejo B y sin la R declarada. El único rastro era una fila de cambio de
   * nombre, y detrás había media hora de tecleo.
   */
  it('renombrar un sector con Anejo B avisa de lo que se pierde', () => {
    const base = conSector({
      sectores: [
        {
          id: 's1',
          nombre: 'Sala de calderas',
          clase: 'riesgo:bajo',
          sotano: false,
          robotizado: false,
          adosada: false,
          bajoCubiertaSinRiesgo: false,
          minutosManual: 90,
          anejoB: datosAnejoBIniciales(),
        },
      ],
    });
    const p = plan(
      { ...VACIO, sectores: [sectorAi({ nombre: 'Sala de máquinas', clase: 'riesgo:bajo' })] },
      base,
    );
    expect(p.warnings.join(' ')).toContain('Sala de calderas');
    expect(p.warnings.join(' ')).toContain('se pierde');
    expect(p.fields.sectores?.[0].anejoB).toBeNull();
  });

  it('pero si vuelve con su nombre no se avisa de nada', () => {
    const base = conSector({
      sectores: [
        {
          id: 's1',
          nombre: 'Sala de calderas',
          clase: 'riesgo:bajo',
          sotano: false,
          robotizado: false,
          adosada: false,
          bajoCubiertaSinRiesgo: false,
          minutosManual: 90,
          anejoB: datosAnejoBIniciales(),
        },
      ],
    });
    const p = plan(
      { ...VACIO, sectores: [sectorAi({ nombre: 'Sala de calderas', clase: 'riesgo:bajo', sotano: true })] },
      base,
    );
    expect(p.warnings.join(' ')).not.toContain('se pierde');
    expect(p.fields.sectores?.[0].anejoB).not.toBeNull();
  });
});

describe('los elementos', () => {
  it('se cuelgan del sector propuesto en el MISMO turno', () => {
    const p = plan(
      { ...VACIO, sectores: [sectorAi()], elementos: [elementoAi()] },
      defaultIncendioState(),
    );
    const sectorId = p.fields.sectores?.[0].id;
    expect(p.fields.elementos?.[0].sectorId).toBe(sectorId);
    const ev = evaluar({ ...defaultIncendioState(), alturaEvacuacionManual: 10, ...p.fields }, null);
    expect(ev.elementos[0].exigida).toBe(60);
    expect(ev.elementos[0].via).toBe('propia');
  });

  /**
   * La detección de «no hay nada que cambiar» comparaba el TEXTO de la tarjeta,
   * que no proyecta todos los campos: un cerco de 8 a 16 mm cambia la distancia
   * al eje y el veredicto, y la lista entera se descartaba como «Ya coincide».
   * Y como «ya coincide» es el descarte benigno, tampoco se le realimentaba al
   * modelo.
   */
  it('un cambio que la tarjeta no enseña se aplica igual: se comparan los campos', () => {
    const base = conSector({
      elementos: [
        {
          id: 'e1',
          nombre: 'Soportes',
          sectorId: 's1',
          exigidaManual: null,
          material: 'hormigon',
          hormigon: {
            ...entradaHormigonInicial(),
            tipo: 'soporte',
            b: 300,
            h: 300,
            rnom: 35,
            dCerco: 8,
            dBarra: 20,
          },
          acero: entradaAceroInicial(),
          proteccion: { familia: '', lambda: null },
        },
      ],
    });
    // Mismo texto de tarjeta: sólo cambia el cerco, que no se proyecta.
    const p = plan({ ...VACIO, elementos: [elementoAi({ cerco_mm: 16 })] }, base);
    expect(p.fields.elementos?.[0].hormigon.dCerco).toBe(16);
    expect(p.skipped.map((x) => x.field)).not.toContain('elementos');
  });

  it('y uno idéntico de verdad sigue descartándose entero', () => {
    const base = conSector({
      elementos: [
        {
          id: 'e1',
          nombre: 'Soportes',
          sectorId: 's1',
          exigidaManual: null,
          material: 'hormigon',
          hormigon: {
            ...entradaHormigonInicial(),
            tipo: 'soporte',
            b: 300,
            h: 300,
            rnom: 35,
            dCerco: 8,
            dBarra: 20,
          },
          acero: entradaAceroInicial(),
          proteccion: { familia: '', lambda: null },
        },
      ],
    });
    const p = plan({ ...VACIO, elementos: [elementoAi()] }, base);
    expect(p.fields.elementos).toBeUndefined();
    expect(p.skipped.map((x) => x.field)).toContain('elementos');
  });

  it('un perfil que no está en el catálogo se dice, no se traga', () => {
    const p = plan(
      { ...VACIO, elementos: [elementoAi({ material: 'acero', perfil: 'IPE 275' })] },
      defaultIncendioState(),
    );
    expect(p.notFound).toContain('Perfil «IPE 275»');
  });

  it('un elemento que vuelve con el mismo nombre conserva el λp de su producto', () => {
    const base = conSector({
      elementos: [
        {
          id: 'e1',
          nombre: 'Jácenas',
          sectorId: 's1',
          exigidaManual: null,
          material: 'acero',
          hormigon: entradaHormigonInicial(),
          acero: { ...entradaAceroInicial(), perfil: 'IPE 300' },
          proteccion: { familia: 'lanaMineral', lambda: 0.25 },
        },
      ],
    });
    const p = plan(
      { ...VACIO, elementos: [elementoAi({ nombre: 'Jácenas', material: 'acero', perfil: 'IPE 330', proteccion: 'lanaMineral' })] },
      base,
    );
    expect(p.fields.elementos?.[0].proteccion.lambda).toBe(0.25);
    expect(p.fields.elementos?.[0].acero.perfil).toBe('IPE 330');
    expect(p.fields.elementos?.[0].id).toBe('e1');
  });

  it('pero cambiar de familia tira ese λp: era el del producto de antes', () => {
    const base = conSector({
      elementos: [
        {
          id: 'e1',
          nombre: 'Jácenas',
          sectorId: 's1',
          exigidaManual: null,
          material: 'acero',
          hormigon: entradaHormigonInicial(),
          acero: { ...entradaAceroInicial(), perfil: 'IPE 300' },
          proteccion: { familia: 'lanaMineral', lambda: 0.25 },
        },
      ],
    });
    const p = plan(
      { ...VACIO, elementos: [elementoAi({ nombre: 'Jácenas', material: 'acero', perfil: 'IPE 300', proteccion: 'silicatoCalcico' })] },
      base,
    );
    expect(p.fields.elementos?.[0].proteccion).toEqual({ familia: 'silicatoCalcico', lambda: null });
  });

  it('un elemento nuevo parte de los valores de fábrica, no de ceros', () => {
    const p = plan({ ...VACIO, elementos: [elementoAi()] }, defaultIncendioState());
    // `cargaUniforme` y `entrevigadoProtegido` no viajan en el payload y no
    // pueden quedarse en false por omisión: son los valores del módulo.
    expect(p.fields.elementos?.[0].hormigon.cargaUniforme).toBe(true);
    expect(p.fields.elementos?.[0].hormigon.entrevigadoProtegido).toBe(true);
    expect(p.fields.elementos?.[0].acero.arriostrado).toBe(true);
  });

  it('un elemento cuyo sector no existe se avisa: se quedaría sin R', () => {
    const p = plan(
      { ...VACIO, elementos: [elementoAi({ sector: 'Sector que no existe' })] },
      conSector(),
    );
    expect(p.warnings.join(' ')).toContain('se quedan sin sector');
    expect(p.fields.elementos?.[0].sectorId).toBe('');
  });
});

// ── Riesgos ──────────────────────────────────────────────────────────────────

describe('lo que baja la exigencia y no se ve', () => {
  it('bajar la altura de evacuación a mano es un riesgo', () => {
    const p = plan({ ...VACIO, altura_evacuacion_m: 8 }, conSector(), new Set(['altura_evacuacion_m']));
    const r = p.risks.find((x) => x.field === 'altura_evacuacion');
    expect(r).toBeDefined();
    expect(r?.before).toBe('10,00 m');
    expect(r?.after).toBe('8,00 m');
  });

  it('reclasificar un sector a un uso menos exigente también, aunque no baje la R máxima', () => {
    // Dos sectores: uno de aparcamiento bajo otro uso (R 120) y la vivienda
    // (R 60). Rebajar el aparcamiento a exclusivo lo deja en R 90; la R
    // máxima del edificio sigue siendo la suya, pero ha bajado.
    const dos = conSector();
    dos.sectores.push({
      id: 's2',
      nombre: 'Aparcamiento',
      clase: claseUso('aparcamientoBajoOtroUso'),
      sotano: true,
      robotizado: false,
      adosada: false,
      bajoCubiertaSinRiesgo: false,
      minutosManual: null,
      anejoB: null,
    });
    const p = plan(
      {
        ...VACIO,
        sectores: [sectorAi(), sectorAi({ nombre: 'Aparcamiento', clase: claseUso('aparcamientoExclusivo'), sotano: true })],
      },
      dos,
      new Set(['sectores']),
    );
    const r = p.risks.find((x) => x.label.includes('Aparcamiento'));
    expect(r?.before).toBe('R 120');
    expect(r?.after).toBe('R 90');
  });

  it('dejar menos sectores de los que hay es un riesgo', () => {
    const p = plan({ ...VACIO, sectores: [] }, conSector(), new Set(['sectores']));
    // La lista vacía no tiene nombres, así que no se aplica nada; lo que sí
    // se evalúa es el riesgo de quedarse sin ellos.
    expect(plan({ ...VACIO, sectores: [] }, conSector()).fields.sectores ?? []).toHaveLength(0);
    expect(p.risks.map((r) => r.field)).toContain('sectores_eliminados');
  });

  it('bajar el μfi de un elemento rebaja el revestimiento, y se marca', () => {
    const base = conSector({
      elementos: [
        {
          id: 'e1',
          nombre: 'Jácenas',
          sectorId: 's1',
          exigidaManual: null,
          material: 'acero',
          hormigon: entradaHormigonInicial(),
          acero: { ...entradaAceroInicial(), perfil: 'IPE 300', mufi: 0.65 },
          proteccion: { familia: '', lambda: null },
        },
      ],
    });
    const p = plan(
      { ...VACIO, elementos: [elementoAi({ nombre: 'Jácenas', material: 'acero', perfil: 'IPE 300', mufi: 0.45 })] },
      base,
    );
    const r = p.risks.find((x) => x.label.includes('μfi'));
    expect(r?.before).toBe('0,65');
    expect(r?.after).toBe('0,45');
  });

  it('una zona de riesgo NUEVA que llega «bajo cubierta sin riesgo» es un riesgo, y la tarjeta lo dice', () => {
    // Es la excepción de la llamada 1 de la tabla 3.2: deja la zona en R 30
    // donde la tabla pedía R 180. Una zona nueva no tiene «antes» con el que
    // compararla, así que era la puerta por la que un R 30 entraba mudo.
    const p = plan(
      {
        ...VACIO,
        sectores: [
          sectorAi(),
          sectorAi({ nombre: 'Sala de calderas', clase: 'riesgo:alto', bajo_cubierta_sin_riesgo: true }),
        ],
      },
      conSector(),
      new Set(['sectores']),
    );
    const r = p.risks.find((x) => x.field.startsWith('bajo_cubierta_'));
    expect(r?.label).toContain('Sala de calderas');
    expect(r?.before).toBe('R 180 (tabla 3.2)');
    expect(r?.after).toBe('R 30 (bajo cubierta sin riesgo)');
    const fila = p.changes.find((c) => c.after.includes('Sala de calderas'));
    expect(fila?.after).toContain('bajo cubierta sin riesgo (R 30)');
  });

  it('y en una zona que ya existía lo ve la comparación sector a sector, sin duplicarse', () => {
    const conRiesgo = conSector();
    conRiesgo.sectores.push({
      id: 's2',
      nombre: 'Sala de calderas',
      clase: 'riesgo:alto',
      sotano: false,
      robotizado: false,
      adosada: false,
      bajoCubiertaSinRiesgo: false,
      minutosManual: null,
      anejoB: null,
    });
    const p = plan(
      {
        ...VACIO,
        sectores: [sectorAi(), sectorAi({ nombre: 'Sala de calderas', clase: 'riesgo:alto', bajo_cubierta_sin_riesgo: true })],
      },
      conRiesgo,
      new Set(['sectores']),
    );
    const sobreLaSala = p.risks.filter((x) => x.label.includes('Sala de calderas'));
    expect(sobreLaSala).toHaveLength(1);
    expect(sobreLaSala[0]).toMatchObject({ before: 'R 180', after: 'R 30' });
  });

  it('y el esquema dice de qué zonas es esa casilla: de las de riesgo, no de la cubierta ligera', () => {
    const d = String((itemsDe('sectores').items.properties.bajo_cubierta_sin_riesgo as { description: string }).description);
    expect(d).toContain('riesgo:bajo|medio|alto');
    expect(d).toContain('R 30');
    expect(d).not.toContain('regla:cubiertaLigera');
  });

  /**
   * El `null` de μfi NO es «sin valor»: es la posición SEGURA —la columna más
   * exigente de la D.1, sin corrección de la C.1—. El gate lo leía como «sin
   * línea base» y no comparaba, que es el patrón de centinela que la auditoría
   * de julio documentó como fuga.
   */
  it('declarar un μfi donde no había ninguno también rebaja, y se marca', () => {
    const base = conSector({
      elementos: [
        {
          id: 'e1',
          nombre: 'Jácenas',
          sectorId: 's1',
          exigidaManual: null,
          material: 'acero',
          hormigon: entradaHormigonInicial(),
          acero: { ...entradaAceroInicial(), perfil: 'IPE 300' },
          proteccion: { familia: '', lambda: null },
        },
      ],
    });
    const p = plan(
      { ...VACIO, elementos: [elementoAi({ nombre: 'Jácenas', material: 'acero', perfil: 'IPE 300', mufi: 0.45 })] },
      base,
    );
    const r = p.risks.find((x) => x.label.includes('μfi'));
    expect(r?.before).toContain('sin declarar');
    expect(r?.after).toBe('0,45');
  });

  it('pero uno que se queda en la misma columna de la D.1 no cambia nada', () => {
    const base = conSector({
      elementos: [
        {
          id: 'e1',
          nombre: 'Jácenas',
          sectorId: 's1',
          exigidaManual: null,
          material: 'acero',
          hormigon: entradaHormigonInicial(),
          acero: { ...entradaAceroInicial(), perfil: 'IPE 300' },
          proteccion: { familia: '', lambda: null },
        },
      ],
    });
    const p = plan(
      { ...VACIO, elementos: [elementoAi({ nombre: 'Jácenas', material: 'acero', perfil: 'IPE 300', mufi: 0.65 })] },
      base,
    );
    expect(p.risks.filter((x) => x.label.includes('μfi'))).toEqual([]);
  });

  it('y teclear una masividad por debajo de la del perfil, igual', () => {
    const base = conSector({
      elementos: [
        {
          id: 'e1',
          nombre: 'Jácenas',
          sectorId: 's1',
          exigidaManual: null,
          material: 'acero',
          hormigon: entradaHormigonInicial(),
          acero: { ...entradaAceroInicial(), perfil: 'IPE 300' },
          proteccion: { familia: '', lambda: null },
        },
      ],
    });
    const p = plan(
      {
        ...VACIO,
        elementos: [
          elementoAi({ nombre: 'Jácenas', material: 'acero', perfil: 'IPE 300', masividad_m1: 50 }),
        ],
      },
      base,
    );
    const r = p.risks.find((x) => x.label.includes('Masividad'));
    expect(r).toBeDefined();
    expect(r?.after).toBe('50 m⁻¹');
    expect(r?.why).toContain('d/λp');
  });

  it('subir la altura o la R no es riesgo ninguno', () => {
    const p = plan({ ...VACIO, altura_evacuacion_m: 30 }, conSector(), new Set(['altura_evacuacion_m']));
    expect(p.risks).toEqual([]);
  });
});

// ── Snapshot y resumen ───────────────────────────────────────────────────────

describe('lo que el modelo lee antes de proponer', () => {
  it('el snapshot le da las plantas publicadas y la R ya resuelta', () => {
    const snap = JSON.parse(incendioAdapter.snapshot(conSector())) as {
      valores: {
        plantas_publicadas: { nombres: string[]; nota: string };
        altura_de_evacuacion_resuelta: { metros: number | null; de_donde: string };
        r_exigida_resuelta: { parte: string; minutos: number }[];
      };
    };
    expect(snap.valores.plantas_publicadas.nota).toContain('NO son campos de tu propuesta');
    expect(snap.valores.altura_de_evacuacion_resuelta.metros).toBe(10);
    expect(snap.valores.altura_de_evacuacion_resuelta.de_donde).toContain('adoptada');
    expect(snap.valores.r_exigida_resuelta).toEqual([
      { parte: 'Plantas sobre rasante', minutos: 60 },
    ]);
  });

  it('y un estado de fábrica llega marcado como sin confirmar', () => {
    const snap = JSON.parse(incendioAdapter.snapshot(defaultIncendioState())) as { sin_confirmar: string[] };
    expect(snap.sin_confirmar).toContain('sectores');
    expect(snap.sin_confirmar).toContain('elementos');
    expect(snap.sin_confirmar).toContain('modo_altura');
  });

  it('el resumen dice lo que el módulo NO hace', () => {
    const r = summarizeIncendioResults(evaluar(conSector(), null));
    expect(r.text).toContain('NO dimensiona');
    expect(r.text).toContain('R 60');
    expect(r.verdict).not.toBe('invalid');
  });

  it('y con algo a medias bloquea, con el nombre de lo que falta', () => {
    const roto = conSector();
    roto.sectores[0].clase = '';
    const r = summarizeIncendioResults(evaluar(roto, null));
    expect(r.verdict).toBe('invalid');
    expect(r.text).toContain('Plantas sobre rasante');
  });
});

// ── Parseo defensivo ─────────────────────────────────────────────────────────

describe('el payload que llega roto', () => {
  it('lo que no es objeto revienta con un error del asistente, no con un TypeError', () => {
    expect(() => parsePayload('R 90')).toThrow(/no es un objeto JSON/);
  });

  it('un valor de enum inventado cae al valor de partida en vez de colarse', () => {
    const p = parsePayload({ ...VACIO, sectores: [sectorAi({ clase: 'uso:discoteca' })] });
    expect(p.sectores?.[0].clase).toBe('');
  });

  it('y las listas ausentes son «sin cambio», no «lista vacía»', () => {
    const p = parsePayload({ warnings: [] });
    expect(p.sectores).toBeNull();
    expect(p.elementos).toBeNull();
    expect(p.plantas).toBeNull();
  });
});

describe('las reglas de seguridad declaradas', () => {
  it('las magnitudes resueltas son las dos que mueven la R', () => {
    expect(INCENDIO_RESOLVED_RULES.map((r) => r.id)).toEqual(['altura_evacuacion', 'r_maxima']);
  });
});
