/**
 * `concreta-pub-materiales`: lo que el cuadro deja escrito para la ficha DB SE.
 *
 * Lo que se fija aquí no es el formato del sobre —eso lo prueba
 * `src/test/pub/pub.test.ts`— sino QUÉ viaja dentro y qué no. Tres reglas que
 * cuesta caro romper:
 *
 *  - viajan HECHOS, no prosa: ni marcadores de nota, ni mayúsculas de cuadro,
 *    ni los mensajes del motor. La ficha tiene que poder razonar sobre esto,
 *    no reimprimirlo;
 *  - lo derivado se publica ya derivado (la fck ADOPTADA, el recubrimiento
 *    NOMINAL, la categoría de ejecución EFECTIVA), porque el consumidor no
 *    tiene el motor y no puede rehacer la cuenta;
 *  - un cuadro vacío no se publica, aunque no tenga huecos que resolver.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { guardarObra } from '../../lib/obra';
import { leerPublicacion } from '../../lib/pub';
import {
  datosPublicacion,
  defaultMaterialesState,
  evaluar,
  filaDesdePreset,
  filaMaderaDesdePreset,
  hayMaterialesResueltos,
  MODULO_PUB,
  PUB_VERSION,
  publicarResultado,
  type MaterialesState,
  type PubMateriales,
} from '../../features/materiales/state';

beforeEach(() => {
  localStorage.clear();
});

/** El estado por defecto ya trae hormigón: cimentación, muros, forjados y limpieza. */
const conHormigon = (): MaterialesState => defaultMaterialesState();

const conMadera = (): MaterialesState => ({
  ...defaultMaterialesState(),
  usaMadera: true,
  maderaGrupos: [filaMaderaDesdePreset('Vigas y pilares')],
});

/** S355 soldado: el motor sube la categoría de ejecución a PC2 él solo. */
const conAcero = (): MaterialesState => {
  const base = defaultMaterialesState();
  return {
    ...base,
    usaAceroEstructural: true,
    estudio: { ...base.estudio, aceroEstructural: 'S355JR' },
  };
};

const publicar = (state: MaterialesState) => {
  publicarResultado(state, evaluar(state));
  return leerPublicacion<PubMateriales>(MODULO_PUB, PUB_VERSION);
};

const datos = (state: MaterialesState): PubMateriales => {
  const d = datosPublicacion(state, evaluar(state));
  expect(d).not.toBeNull();
  return d!;
};

describe('el sobre', () => {
  it('se publica con el nombre del módulo y el esquema v1', () => {
    const pub = publicar(conHormigon());
    expect(pub).not.toBeNull();
    expect(pub!.modulo).toBe('materiales');
    expect(pub!.v).toBe(PUB_VERSION);
    expect(Date.parse(pub!.ts)).toBeGreaterThan(0);
    // Quien pida otra versión del esquema no recibe un objeto a medias.
    expect(leerPublicacion(MODULO_PUB, PUB_VERSION + 1)).toBeNull();
  });

  it('estampa el municipio y el INE de la obra; el nombre de la provincia, no', () => {
    guardarObra({ municipio: 'Bormujos', ine: '41017', provincia: '41' });
    // El NOMBRE de la provincia vive en la tabla del capítulo Acciones y este
    // módulo no la arrastra: lo que compara un consumidor es el código.
    expect(publicar(conHormigon())!.obra).toEqual({
      municipio: 'Bormujos',
      provincia: null,
      ine: '41017',
    });
  });

  it('con la provincia sola, el INE viaja con dos dígitos', () => {
    guardarObra({ provincia: '41' });
    expect(publicar(conHormigon())!.obra).toEqual({
      municipio: null,
      provincia: null,
      ine: '41',
    });
  });

  it('sin contexto de obra se publica igual, con la obra en blanco', () => {
    expect(publicar(conHormigon())!.obra).toEqual({
      municipio: null,
      provincia: null,
      ine: null,
    });
  });
});

describe('el hormigón', () => {
  it('viaja elemento a elemento, ya derivado', () => {
    const state = conHormigon();
    const ev = evaluar(state);
    const h = datos(state).hormigon!;

    expect(h.elementos.map((e) => e.nombre)).toEqual(
      ev.hormigon.map((x) => x.derivacion.elemento.nombre),
    );
    // Lo publicado es lo que el motor decidió, no lo que se tecleó: la fck
    // ADOPTADA (que la durabilidad puede subir) y el recubrimiento NOMINAL
    // (con el Δcdev ya sumado).
    ev.hormigon.forEach(({ derivacion: d }, i) => {
      const e = h.elementos[i];
      expect(e.tipificacion).toBe(d.tipificacion);
      expect(e.fck).toBe(d.fckAdoptada);
      expect(e.fcd).toBeCloseTo(d.fcd, 12);
      expect(e.clases).toEqual(d.clases);
      expect(e.cnom).toBe(d.cnom);
      expect(e.deltaCdev).toBe(d.deltaCdev);
      expect(e.cementoMin).toBe(d.cementoMin);
      expect(e.acMax).toBe(d.acMax);
    });
  });

  it('el hormigón de limpieza va aparte: se prescribe, no se deriva', () => {
    const h = datos(conHormigon()).hormigon!;
    expect(h.elementos.some((e) => e.tipificacion.startsWith('HL'))).toBe(false);
    expect(h.prescritos).toHaveLength(1);
    expect(h.prescritos[0].nombre).toBe('Hormigón de limpieza');
    expect(h.prescritos[0].tipificacion).toMatch(/^HL/);
  });

  it('lleva los aceros de armar y los dos coeficientes parciales', () => {
    const h = datos(conHormigon()).hormigon!;
    expect(h.aceroPasivo).toEqual({ designacion: 'B500SD', fyk: 500 });
    expect(h.malla).toEqual({ designacion: 'ME-500 T', fyk: 500 });
    expect(h.gammaC).toEqual({ persistente: 1.5, accidental: 1.3 });
    expect(h.gammaS).toEqual({ persistente: 1.15, accidental: 1.0 });
    expect(h.tamMaxArido).toBe(20);
    expect(h.cemento).toBe('CEM II/B-S');
  });

  it('el nivel de control del perfil de estudio llega a cada elemento', () => {
    const base = conHormigon();
    const state: MaterialesState = {
      ...base,
      estudio: { ...base.estudio, nivelControlHormigon: '100_por_100' },
    };
    for (const e of datos(state).hormigon!.elementos) {
      expect(e.nivelControl).toBe('100_por_100');
    }
  });

  it('apagado, no hay bloque de hormigón', () => {
    const state = { ...conMadera(), usaHormigon: false };
    expect(datos(state).hormigon).toBeNull();
  });
});

describe('el acero estructural', () => {
  it('viaja la categoría de ejecución EFECTIVA, y también la declarada', () => {
    const a = datos(conAcero()).aceroEstructural!;
    // Se declaró PC1; el CE 91.2.2.2 la sube a PC2 por los soldados de S355.
    // Al consumidor le llega la que manda, con la declarada al lado para que
    // pueda explicar de dónde sale.
    expect(a.categoriaEjecucionDeclarada).toBe('PC1');
    expect(a.categoriaEjecucion).toBe('PC2');
    expect(a.claseEjecucion).toBeGreaterThanOrEqual(2);
    expect(a.designacion).toBe('S355JR');
    expect(a.fy).toBe(355);
    expect(a.gammaM).toEqual({ persistente: 1.05, accidental: 1.0 });
    expect(a.nivelRiesgo).toBe('CC2');
    expect(a.elementos.map((e) => e.nombre)).toEqual(['Soportes', 'Jácenas', 'Chapas']);
    expect(a.elementos[2]).toMatchObject({ union: 'atornillado', corrosividad: 'C3' });
    // La protección sugerida para la clase de corrosividad se resuelve aquí,
    // no en el consumidor: lo que se publica es la prescripción ya escrita.
    expect(a.elementos[2].proteccion).toBe('galvanizado');
    expect(a.elementos[2].caracteristicasProteccion).toBe('En fábrica');
  });

  it('apagado, no hay bloque de acero', () => {
    expect(datos(conHormigon()).aceroEstructural).toBeNull();
  });
});

describe('la madera', () => {
  it('cada grupo con su clase de uso, su γM y su tratamiento', () => {
    const state = conMadera();
    const ev = evaluar(state);
    const m = datos(state).madera!;
    const d = ev.madera[0].derivacion;

    expect(m.grupos).toHaveLength(1);
    expect(m.grupos[0]).toMatchObject({
      nombre: 'Vigas y pilares',
      tipo: 'laminada',
      claseResistente: 'GL24h',
      claseServicio: d.claseServicio,
      claseUso: d.claseUso,
      gammaM: d.gammaM,
      nivelPenetracion: d.nivelPenetracion,
      proteccionHerrajes: d.proteccionHerrajes,
    });
    expect(m.gammaMExtraordinaria).toBe(1);
  });

  it('apagada, no hay bloque de madera', () => {
    expect(datos(conHormigon()).madera).toBeNull();
  });
});

describe('lo común a la obra', () => {
  it('vida útil, niveles de control y modificadores', () => {
    const d = datos({ ...conHormigon(), costa: true, heladas: true, terrenoAgresivo: 'debil' });
    expect(d.vidaUtil).toBe(50);
    expect(d.vidaUtilAnios).toBe(50);
    expect(d.nivelControlEjecucion).toBe('normal');
    expect(d.nivelControlAcero).toBe('Normal');
    expect(d.modificadores).toEqual({ costa: true, heladas: true, terrenoAgresivo: 'debil' });
  });

  it('la R exigida viaja como número, no como el párrafo del DB SI', () => {
    const d = datos({ ...conHormigon(), resistenciaFuego: 90 });
    expect(d.resistenciaFuego).toBe(90);
    expect(JSON.stringify(d)).not.toContain('DB SI');
    expect(datos(conHormigon()).resistenciaFuego).toBeNull();
  });
});

describe('hechos, no prosa', () => {
  it('no viajan marcadores de nota, ni mensajes, ni bloques de documento', () => {
    const state = { ...conAcero(), usaMadera: true, maderaGrupos: conMadera().maderaGrupos };
    const crudo = JSON.stringify(datos(state));
    // «(*)» es el marcador que `cuadros.ts` aparea con sus notas al pie: si
    // aparece aquí es que alguien ha publicado una celda ya rotulada.
    expect(crudo).not.toContain('(*)');
    for (const clave of ['"mensajes"', '"trazas"', '"notas"', '"kind"', '"severidad"']) {
      expect(crudo).not.toContain(clave);
    }
  });

  it('todo es serializable: ida y vuelta por JSON sin pérdida', () => {
    const d = datos({ ...conAcero(), usaMadera: true, maderaGrupos: conMadera().maderaGrupos });
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});

describe('la puerta', () => {
  it('con los tres materiales apagados está listo, pero no hay nada que publicar', () => {
    const vacio: MaterialesState = {
      ...defaultMaterialesState(),
      usaHormigon: false,
      usaAceroEstructural: false,
      usaMadera: false,
    };
    const ev = evaluar(vacio);
    expect(ev.listo).toBe(true);
    expect(hayMaterialesResueltos(ev)).toBe(false);
    expect(datosPublicacion(vacio, ev)).toBeNull();
    publicarResultado(vacio, ev);
    expect(leerPublicacion(MODULO_PUB)).toBeNull();
  });

  it('con un hueco rojo no se publica, y no pisa lo publicado antes', () => {
    const bueno = conHormigon();
    publicarResultado(bueno, evaluar(bueno));
    const antes = leerPublicacion(MODULO_PUB);
    expect(antes).not.toBeNull();

    const roto: MaterialesState = {
      ...bueno,
      elementos: [{ ...filaDesdePreset('Forjados'), situacion: '' }],
    };
    const ev = evaluar(roto);
    expect(ev.listo).toBe(false);
    expect(datosPublicacion(roto, ev)).toBeNull();
    publicarResultado(roto, ev);
    // Un consumidor prefiere un dato fechado a ninguno: la fecha del sobre ya
    // le dice que es viejo.
    expect(leerPublicacion(MODULO_PUB)).toEqual(antes);
  });
});
