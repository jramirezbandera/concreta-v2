/**
 * Motor de derivación: los casos que los tres cuadros del estudio no cubren.
 *
 * Los oráculos son cuatro elementos de hormigón en dos ambientes benignos. Lo
 * que se rompe en el uso real —varias clases a la vez, una casilla «*» de la
 * norma, un fck por debajo del mínimo de durabilidad— hay que fijarlo aquí.
 */

import { describe, expect, it } from 'vitest';
import {
  clasesDeExposicion,
  deriveAcero,
  deriveHormigon,
  deriveMadera,
  dosificacion,
} from '../../lib/materiales/derive';
import type {
  ElementoAcero,
  ElementoHormigon,
  GrupoMadera,
  OpcionesObra,
} from '../../lib/materiales/types';

const OBRA: OpcionesObra = {
  vidaUtil: 50,
  cemento: 'CEM II/B-S',
  nivelControlEjecucion: 'normal',
};

const elemento = (parcial: Partial<ElementoHormigon>): ElementoHormigon => ({
  id: 'e',
  nombre: 'Elemento',
  tipoHormigon: 'armado',
  situacion: { ubicacion: 'interior_seco' },
  fckEspecificada: 30,
  consistencia: 'blanda',
  tamMaxArido: 20,
  ...parcial,
});

describe('situación de obra → clases de exposición', () => {
  it('cada ubicación cae en la clase de carbonatación que le corresponde', () => {
    const c = (ubicacion: ElementoHormigon['situacion']['ubicacion']) =>
      clasesDeExposicion({ ubicacion }, 'armado');
    expect(c('interior_muy_seco')).toEqual(['X0']);
    expect(c('interior_seco')).toEqual(['XC1']);
    expect(c('sumergido_agua_no_agresiva')).toEqual(['XC1']);
    expect(c('enterrado')).toEqual(['XC2']);
    expect(c('interior_humedo')).toEqual(['XC3']);
    expect(c('exterior_protegido')).toEqual(['XC3']);
    expect(c('exterior_lluvia')).toEqual(['XC4']);
  });

  it('el hormigón en masa no arrastra clases de corrosión', () => {
    // La tabla 43.2.1.a las deja en blanco para masa: si el motor las metiera,
    // la dosificación saldría de una casilla que no existe.
    expect(clasesDeExposicion({ ubicacion: 'enterrado' }, 'masa')).toEqual(['X0']);
    expect(
      clasesDeExposicion({ ubicacion: 'enterrado', helada: 'alta_con_sales' }, 'masa'),
    ).toEqual(['XF4']);
  });

  it('las clases se acumulan y salen ordenadas como en la tabla 27.1.a', () => {
    expect(
      clasesDeExposicion(
        {
          ubicacion: 'exterior_lluvia',
          marino: 'aereo',
          helada: 'moderada',
          erosion: 'moderada',
        },
        'armado',
      ),
    ).toEqual(['XC4', 'XS1', 'XF1', 'XM1']);
  });

  it('«obra en la costa» sólo alcanza a lo que tiene caras al aire libre', () => {
    const sit = { ubicacion: 'enterrado' } as const;
    expect(clasesDeExposicion(sit, 'armado', { costa: true })).toEqual(['XC2']);
    expect(
      clasesDeExposicion(sit, 'armado', { costa: true, expuestoAireExterior: true }),
    ).toEqual(['XC2', 'XS1']);
  });

  it('un ambiente marino declarado a mano gana al modificador de costa', () => {
    expect(
      clasesDeExposicion({ ubicacion: 'enterrado', marino: 'carrera_mareas' }, 'armado', {
        costa: true,
        expuestoAireExterior: true,
      }),
    ).toEqual(['XC2', 'XS3']);
  });
});

describe('modificadores de obra: heladas y terreno agresivo', () => {
  /**
   * Antes el motor sabía derivar XF y XA pero nadie podía pedírselo: el
   * formulario no lo preguntaba. Una obra de montaña o un geotécnico con
   * sulfatos no se podían representar.
   */
  it('«heladas» añade XF1 sólo a las caras al aire libre que reciben lluvia', () => {
    const heladas = { heladas: true, expuestoAireExterior: true };
    // CE 27.1.a, XF1: superficies verticales expuestas a la lluvia y a heladas.
    expect(clasesDeExposicion({ ubicacion: 'exterior_lluvia' }, 'armado', heladas)).toEqual([
      'XC4',
      'XF1',
    ]);
    // Un muro contra el terreno con cara vista también se moja y se hiela.
    expect(clasesDeExposicion({ ubicacion: 'enterrado' }, 'armado', heladas)).toEqual([
      'XC2',
      'XF1',
    ]);
    // Protegido de la lluvia no se satura: sin XF.
    expect(
      clasesDeExposicion({ ubicacion: 'exterior_protegido' }, 'armado', heladas),
    ).toEqual(['XC3']);
    // Y lo interior o sin caras al aire, ni se entera.
    expect(
      clasesDeExposicion({ ubicacion: 'interior_seco' }, 'armado', { heladas: true }),
    ).toEqual(['XC1']);
    expect(clasesDeExposicion({ ubicacion: 'enterrado' }, 'armado', { heladas: true })).toEqual([
      'XC2',
    ]);
  });

  it('el terreno agresivo añade su XA a lo enterrado y a nada más', () => {
    expect(
      clasesDeExposicion({ ubicacion: 'enterrado' }, 'armado', { terrenoAgresivo: 'debil' }),
    ).toEqual(['XC2', 'XA1']);
    expect(
      clasesDeExposicion({ ubicacion: 'enterrado' }, 'armado', { terrenoAgresivo: 'alta' }),
    ).toEqual(['XC2', 'XA3']);
    expect(
      clasesDeExposicion({ ubicacion: 'exterior_lluvia' }, 'armado', { terrenoAgresivo: 'debil' }),
    ).toEqual(['XC4']);
    expect(
      clasesDeExposicion({ ubicacion: 'enterrado' }, 'armado', { terrenoAgresivo: 'ninguna' }),
    ).toEqual(['XC2']);
  });

  it('una helada declarada en el elemento gana al modificador de obra', () => {
    expect(
      clasesDeExposicion({ ubicacion: 'exterior_lluvia', helada: 'alta' }, 'armado', {
        heladas: true,
        expuestoAireExterior: true,
      }),
    ).toEqual(['XC4', 'XF3']);
  });

  it('llegan al elemento por las opciones de obra y mueven la dosificación', () => {
    const d = deriveHormigon(
      elemento({ situacion: { ubicacion: 'exterior_lluvia' }, expuestoAireExterior: true }),
      { ...OBRA, heladas: true },
    );
    expect(d.clases).toEqual(['XC4', 'XF1']);
    expect(d.tipificacion).toBe('HA-30/B/20/XC4+XF1');
    expect(d.cementoMin).toBe(300);
    expect(d.acMax).toBe(0.55);
    // Tabla 44.3 con CEM II/B-S («otros», fck < 40): 20 mm, que no gobierna
    // sobre los 25 de XC4.
    expect(d.cnom).toBe(35);
  });

  it('un terreno XA1 con CEM II/B-S sube el recubrimiento a 50; un XA2 lo deja sin determinar', () => {
    const xa1 = deriveHormigon(elemento({ situacion: { ubicacion: 'enterrado' } }), {
      ...OBRA,
      terrenoAgresivo: 'debil',
    });
    expect(xa1.clases).toEqual(['XC2', 'XA1']);
    expect(xa1.cementoMin).toBe(325);
    expect(xa1.cnom).toBe(50); // tabla 44.4: 40 + Δcdev 10

    const xa2 = deriveHormigon(elemento({ situacion: { ubicacion: 'enterrado' } }), {
      ...OBRA,
      terrenoAgresivo: 'moderada',
    });
    expect(xa2.cnom).toBeNull();
    expect(xa2.mensajes.some((m) => m.severidad === 'error')).toBe(true);
  });
});

describe('dosificación con varias clases (CE 43.2.1)', () => {
  it('toma el criterio más exigente parámetro a parámetro, no una clase entera', () => {
    // XC4 pide a/c 0,55 y 300 kg; XS1 pide 0,50 y 300 kg; XF1 pide 0,55 y 300.
    // El resultado (0,50 y 300) no es la fila de ninguna clase suelta.
    const d = dosificacion(['XC4', 'XS1', 'XF1'], 'armado');
    expect(d.acMax).toBe(0.5);
    expect(d.cementoMin).toBe(300);
    expect(d.fckMin).toBe(30);
  });
});

describe('recubrimiento', () => {
  it('el margen Δcdev depende del nivel de control de ejecución', () => {
    const e = elemento({ situacion: { ubicacion: 'interior_seco' } });
    expect(deriveHormigon(e, OBRA).cnom).toBe(30); // 20 + 10
    expect(deriveHormigon(e, { ...OBRA, nivelControlEjecucion: 'in_situ_intenso' }).cnom).toBe(25);
    expect(deriveHormigon(e, { ...OBRA, nivelControlEjecucion: 'prefabricado_intenso' }).cnom).toBe(20);
  });

  it('el mínimo por adherencia manda cuando la barra es gruesa (CE 44.2.1.1 a)', () => {
    const d = deriveHormigon(
      elemento({ situacion: { ubicacion: 'interior_seco' }, diametroArmadura: 32 }),
      OBRA,
    );
    expect(d.cminDurabilidad).toBe(20);
    expect(d.cminAdherencia).toBe(32);
    expect(d.cmin).toBe(32);
    expect(d.cnom).toBe(45); // 42 redondeado al múltiplo de 5 superior
  });

  it('las clases XM suman sobre-espesor, no compiten por el máximo (tabla 44.5)', () => {
    const d = deriveHormigon(
      elemento({ situacion: { ubicacion: 'interior_seco', erosion: 'intensa' } }),
      OBRA,
    );
    expect(d.clases).toEqual(['XC1', 'XM2']);
    expect(d.cminDurabilidad).toBe(30); // 20 de XC1 + 10 de XM2
    expect(d.cnom).toBe(40);
  });

  it('con más de 50 mm avisa de la malla de reparto', () => {
    const d = deriveHormigon(
      elemento({
        situacion: { ubicacion: 'exterior_lluvia', marino: 'carrera_mareas' },
        fckEspecificada: 35,
      }),
      OBRA,
    );
    expect(d.cnom).toBe(75); // XS3 con CEM II/B-S: cmin 65 + 10
    expect(d.notas.map((n) => n.texto).join(' ')).toContain('malla de reparto');
  });

  it('una casilla «*» de la norma da error, no un número inventado', () => {
    const d = deriveHormigon(
      elemento({ situacion: { ubicacion: 'enterrado', cloruros: 'piscina' } }),
      { ...OBRA, cemento: 'CEM I' }, // familia «resto» → XD con «*»
    );
    expect(d.mensajes.some((m) => m.severidad === 'error')).toBe(true);
    expect(d.mensajes.find((m) => m.severidad === 'error')?.referencia).toBe(
      'CE tabla 44.2.1.1.b',
    );
    // Antes el motor se quedaba con los 15 mm de XC2 y el cuadro imprimía
    // «25 mm» para una piscina que en el CE es una casilla «*». Ahora el
    // recubrimiento queda sin determinar: guion en el cuadro y nota pegada.
    expect(d.cminDurabilidad).toBeNull();
    expect(d.cnom).toBeNull();
    const nota = d.notas.find((n) => n.columna === 'recubrimiento');
    expect(nota?.texto).toMatch(/Sin recubrimiento tabulado.*XD2/);
  });

  it('XA2 remite al autor del proyecto y lo dice', () => {
    const d = deriveHormigon(
      elemento({ situacion: { ubicacion: 'enterrado', quimico: 'moderada' } }),
      OBRA,
    );
    expect(d.clases).toEqual(['XC2', 'XA2']);
    const error = d.mensajes.find((m) => m.severidad === 'error');
    expect(error?.referencia).toBe('CE tabla 44.4, nota (1)');
    expect(error?.texto).toContain('autor del proyecto');
    expect(d.cnom).toBeNull();
  });

  it('en pretensado, la familia favorable frente a cloruros exige CEM I con la microsílice', () => {
    // Tabla 44.2.1.1.b: «CEM II/A-D o bien CEM I con adición de humo de sílice
    // superior al 6 %». Antes la microsílice valía con cualquier cemento.
    const xs1 = (cemento: OpcionesObra['cemento'], microsilice: boolean) =>
      deriveHormigon(
        elemento({
          tipoHormigon: 'pretensado',
          situacion: { ubicacion: 'exterior_lluvia', marino: 'aereo' },
        }),
        { ...OBRA, cemento, microsilice },
      ).cminDurabilidad;
    expect(xs1('CEM I', true)).toBe(30);
    expect(xs1('CEM II/A-D', false)).toBe(30);
    expect(xs1('CEM II/B-S', true)).toBe(45); // resto, aunque lleve microsílice
  });

  it('el hormigón en masa no lleva recubrimiento y un HM-20 no da error', () => {
    // CE 33.4 admite fck 20 en masa y la tabla 44.2.1.1.a sólo tabula X0
    // desde 25: sin esta salida, un HM-20 daba error de recubrimiento y
    // bloqueaba la exportación sin tener armadura que proteger.
    const d = deriveHormigon(elemento({ tipoHormigon: 'masa', fckEspecificada: 20 }), OBRA);
    expect(d.clases).toEqual(['X0']);
    expect(d.cnom).toBe(0);
    expect(d.cminDurabilidad).toBeNull();
    expect(d.mensajes.filter((m) => m.severidad === 'error')).toHaveLength(0);
  });

  it('la nota de los 70 mm contra el terreno se matiza cuando hay hormigón de limpieza', () => {
    // CE 44.2.1.1: los 70 mm no rigen «si se ha preparado el terreno y
    // dispuesto un hormigón de limpieza». Siguen rigiendo en los laterales
    // de una zapata sin encofrar, así que la nota no desaparece: cambia.
    const sin = deriveHormigon(
      elemento({ situacion: { ubicacion: 'enterrado' }, contraTerreno: true }),
      OBRA,
    );
    expect(sin.notas.map((n) => n.texto)).toContain('Contra el terreno: 70 mm.');

    const con = deriveHormigon(
      elemento({ situacion: { ubicacion: 'enterrado' }, contraTerreno: true, conHormigonLimpieza: true }),
      OBRA,
    );
    const nota = con.notas.find((n) => n.texto.startsWith('Contra el terreno'));
    expect(nota?.texto).toContain('no rige sobre el hormigón de limpieza');
  });
});

describe('acero estructural — CE 91.2.2.2', () => {
  /**
   * PC2 no es sólo «soldar en obra»: soldar acero de grado S355 o superior
   * es PC2 aunque se haga en taller. El formulario lo preguntaba con esa
   * etiqueta simplificada y admitía S355JR + soldadura + PC1 sin decir nada.
   */
  const soporte = (designacion: ElementoAcero['designacion'], union: ElementoAcero['union']): ElementoAcero => ({
    id: 's',
    nombre: 'Soportes',
    designacion,
    union,
    caracteristicasUnion: 'En ángulo',
    corrosividad: 'C1',
    proteccion: 'pintura',
    caracteristicasProteccion: 'Doble capa',
  });

  it('S355 soldado declarado PC1 pasa a PC2 y avisa', () => {
    const d = deriveAcero({
      nivelRiesgo: 'CC2',
      categoriaUso: 'SC1',
      categoriaEjecucion: 'PC1',
      elementos: [soporte('S355JR', 'soldadura')],
    });
    expect(d.categoriaEjecucionDeclarada).toBe('PC1');
    expect(d.categoriaEjecucion).toBe('PC2');
    expect(d.claseEjecucion).toBe(2); // CC2 + SC1 da EXC2 con PC1 y con PC2
    const aviso = d.mensajes.find((m) => m.severidad === 'aviso');
    expect(aviso?.referencia).toBe('CE 91.2.2.2');
    expect(aviso?.texto).toContain('Soportes');
  });

  it('y en CC1 la corrección sí cambia la clase de ejecución: de EXC1 a EXC2', () => {
    const d = deriveAcero({
      nivelRiesgo: 'CC1',
      categoriaUso: 'SC1',
      categoriaEjecucion: 'PC1',
      elementos: [soporte('S355J2', 'soldadura')],
    });
    expect(d.claseEjecucion).toBe(2);
  });

  it('S275 soldado, o S355 atornillado, se quedan en PC1 sin mensajes', () => {
    for (const el of [soporte('S275JR', 'soldadura'), soporte('S355JR', 'atornillado')]) {
      const d = deriveAcero({
        nivelRiesgo: 'CC2',
        categoriaUso: 'SC1',
        categoriaEjecucion: 'PC1',
        elementos: [el],
      });
      expect(d.categoriaEjecucion, el.designacion).toBe('PC1');
      expect(d.mensajes, el.designacion).toHaveLength(0);
    }
  });
});

describe('resistencia adoptada', () => {
  it('la durabilidad sube el fck por debajo del mínimo, y avisa', () => {
    const d = deriveHormigon(
      elemento({ situacion: { ubicacion: 'exterior_lluvia' }, fckEspecificada: 25 }),
      OBRA,
    );
    expect(d.fckMin).toBe(30);
    expect(d.fckAdoptada).toBe(30);
    expect(d.tipificacion).toBe('HA-30/B/20/XC4');
    const aviso = d.mensajes.find((m) => m.severidad === 'aviso');
    expect(aviso?.referencia).toBe('CE 43.2.1 y tabla 43.2.1.b');
  });

  it('no toca el fck cuando el proyectista pide más del mínimo', () => {
    const d = deriveHormigon(
      elemento({ situacion: { ubicacion: 'interior_seco' }, fckEspecificada: 40 }),
      OBRA,
    );
    expect(d.fckAdoptada).toBe(40);
    expect(d.mensajes.filter((m) => m.severidad === 'aviso')).toHaveLength(0);
    // Con fck ≥ 40 la tabla 44.2.1.1.a baja el recubrimiento un escalón.
    expect(d.cminDurabilidad).toBe(15);
  });
});

describe('clases forzadas a mano', () => {
  it('sustituyen a la derivación y quedan marcadas para la UI', () => {
    const d = deriveHormigon(
      elemento({ situacion: { ubicacion: 'interior_seco' }, clasesForzadas: ['XC4', 'XF1'] }),
      OBRA,
    );
    expect(d.clasesForzadas).toBe(true);
    expect(d.clases).toEqual(['XC4', 'XF1']);
    expect(d.trazas[0].explicacion).toContain('a mano');
  });
});

describe('madera', () => {
  it('la clase de servicio forzada gana y queda marcada', () => {
    const d = deriveMadera({
      id: 'g',
      nombre: 'Vigas',
      situacion: 'interior',
      tipo: 'maciza',
      claseResistente: 'C24',
      claseServicioForzada: 3,
    });
    expect(d.claseServicio).toBe(3);
    expect(d.claseServicioForzada).toBe(true);
    // La clase de uso NO se arrastra: son conceptos distintos del DB SE-M.
    expect(d.claseUso).toBe('1');
  });

  it('bajo cubierta no ventilada sin lámina la clase de uso es 3.1 (DB SE-M tabla 3.1, nota 3)', () => {
    // La clase de servicio no cambia (sigue a cubierto, 2); la de uso sí, y
    // con ella el tratamiento: de NP1 a NP2.
    const d = deriveMadera({
      id: 'g',
      nombre: 'Pares',
      situacion: 'cubierta_no_ventilada',
      tipo: 'maciza',
      claseResistente: 'C24',
    });
    expect(d.claseServicio).toBe(2);
    expect(d.claseUso).toBe('3.1');
    expect(d.nivelPenetracion).toBe('NP2');
  });

  it('el exterior sin proteger sube a clase de uso 3.2 y tratamiento NP3', () => {
    const d = deriveMadera({
      id: 'g',
      nombre: 'Pérgola',
      situacion: 'exterior_descubierto',
      tipo: 'laminada',
      claseResistente: 'GL24h',
    });
    expect(d.claseServicio).toBe(3);
    expect(d.claseUso).toBe('3.2');
    expect(d.nivelPenetracion).toBe('NP3');
    expect(d.proteccionHerrajes).toContain('Fe/Zn 25c');
    // Laminada en clase de servicio 3: hay que mirar el adhesivo.
    expect(d.mensajes.some((m) => m.referencia === 'DB SE-M tabla 4.1')).toBe(true);
  });
});

describe('CE 33.5 — consistencia', () => {
  /**
   * La tabla 33.5.a lista cinco clases, pero el texto que va debajo restringe
   * tres y prescribe una cuarta. Sin esto, el módulo ofrecía las cinco como si
   * fuesen intercambiables.
   */
  const avisos33 = (parcial: Partial<ElementoHormigon>) =>
    deriveHormigon(elemento(parcial), OBRA)
      .mensajes.filter((m) => m.referencia === 'CE 33.5')
      .map((m) => m.texto);

  it('seca y plástica avisan: no se emplean salvo justificación específica', () => {
    expect(avisos33({ consistencia: 'seca' })[0]).toMatch(/justificación específica/);
    expect(avisos33({ consistencia: 'plastica' })[0]).toMatch(/justificación específica/);
  });

  it('la líquida avisa de que exige superplastificante', () => {
    expect(avisos33({ consistencia: 'liquida' })[0]).toMatch(/superplastificantes/);
  });

  it('blanda y fluida no avisan de nada en un elemento cualquiera', () => {
    expect(avisos33({ consistencia: 'blanda' })).toEqual([]);
    expect(avisos33({ consistencia: 'fluida' })).toEqual([]);
  });

  it('en pilares, vigas y forjados la blanda sí avisa: el CE prescribe fluida', () => {
    const avisos = avisos33({ consistencia: 'blanda', prescripcionFluida: true });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/pilares, forjados y vigas/);
    expect(avisos33({ consistencia: 'fluida', prescripcionFluida: true })).toEqual([]);
  });

  it('la letra de la tipificación sale de la consistencia elegida', () => {
    expect(deriveHormigon(elemento({ consistencia: 'seca' }), OBRA).tipificacion).toContain('/S/');
    expect(deriveHormigon(elemento({ consistencia: 'liquida' }), OBRA).tipificacion).toContain(
      '/L/',
    );
  });
});

describe('CE 43.4.1 — el margen por control de ejecución', () => {
  /**
   * cnom = cmin + Δcdev. El recubrimiento que va al plano NO es el mínimo por
   * ambiente: lleva sumado el margen de la tabla 43.4.1, que depende de cómo
   * se controle la ejecución. Es la diferencia entre 20 y 30 mm en un XC2.
   */
  const cnom = (nivel: OpcionesObra['nivelControlEjecucion']) =>
    deriveHormigon(
      elemento({ situacion: { ubicacion: 'enterrado' } }),
      { ...OBRA, nivelControlEjecucion: nivel },
    );

  it('ejecución normal suma los 10 mm: XC2 pasa de 20 de mínimo a 30 nominales', () => {
    const d = cnom('normal');
    expect(d.cminDurabilidad).toBe(20);
    expect(d.deltaCdev).toBe(10);
    expect(d.cnom).toBe(30);
  });

  it('control intenso in situ suma 5, y el prefabricado con control intenso no suma nada', () => {
    expect(cnom('in_situ_intenso').cnom).toBe(25);
    expect(cnom('prefabricado_intenso').cnom).toBe(20);
  });

  it('el hormigón en masa no lleva recubrimiento: no hay armadura que proteger', () => {
    const d = deriveHormigon(elemento({ tipoHormigon: 'masa' }), OBRA);
    expect(d.cnom).toBe(0);
  });
});

describe('DB SE-M tabla C.1 — la calidad visual sale del par especie/clase', () => {
  /**
   * Antes el módulo escribía «ME-1» en toda fila de madera aserrada. Eso es
   * falso tres de cada cuatro veces: la calidad depende de a qué clase se
   * quiera llegar y con qué especie, y hay parejas que no existen.
   */
  const grupo = (parcial: Partial<GrupoMadera>): GrupoMadera => ({
    id: 'g',
    nombre: 'Grupo',
    situacion: 'cubierto_abierto',
    tipo: 'maciza',
    claseResistente: 'C24',
    ...parcial,
  });

  it('cada pino español pide su calidad, y no todos la misma', () => {
    const c = (especie: string, claseResistente: string) =>
      deriveMadera(grupo({ especie, claseResistente })).calidad;
    expect(c('Pinus sylvestris', 'C27')).toBe('ME-1');
    expect(c('Pinus sylvestris', 'C22')).toBe('MEG');
    expect(c('Pinus sylvestris', 'C18')).toBe('ME-2');
    expect(c('Pinus pinaster', 'C24')).toBe('ME-1');
    expect(c('Pinus radiata', 'C24')).toBe('ME-1');
    expect(c('Pinus nigra', 'C30')).toBe('ME-1'); // el laricio llega a C30
  });

  it('una clase no tabulada la cubre la superior de la misma especie, y se informa', () => {
    // El preset «Viguetas de forjado» es pino silvestre en C24, pareja que la
    // C.1 no trae (silvestre España: C18, C22, C27). Antes avisaba nada más
    // añadirlo; ahora pide ME-1, que da C27 ≥ C24, y lo dice como información.
    const d = deriveMadera(grupo({ especie: 'Pinus sylvestris', claseResistente: 'C24' }));
    expect(d.calidad).toBe('ME-1');
    expect(d.mensajes.filter((m) => m.severidad === 'aviso')).toHaveLength(0);
    const info = d.mensajes.find((m) => m.referencia === 'DB SE-M tabla C.1')!;
    expect(info.severidad).toBe('info');
    expect(info.texto).toMatch(/ME-1.*C27/);
  });

  it('una pareja que no existe avisa en vez de inventarse una calidad', () => {
    // El pino silvestre español no pasa de C27 por clasificación visual.
    const d = deriveMadera(grupo({ especie: 'Pinus sylvestris', claseResistente: 'C30' }));
    expect(d.calidad).toBeUndefined();
    const aviso = d.mensajes.find((m) => m.referencia === 'DB SE-M tabla C.1')!;
    expect(aviso.severidad).toBe('aviso');
    expect(aviso.texto).toMatch(/sólo alcanza C18, C22, C27/);
  });

  it('y sugiere la procedencia que sí la alcanza cuando la tabla la trae', () => {
    const d = deriveMadera(grupo({ especie: 'Pinus sylvestris', claseResistente: 'C30' }));
    // El mismo pino silvestre llega a C30 clasificado por DIN 4074 o INSTA 142.
    expect(d.mensajes.find((m) => m.referencia === 'DB SE-M tabla C.1')!.texto).toMatch(
      /Europa: Central, N y E.*S13.*DIN 4074/,
    );
  });

  it('las frondosas españolas traen su calidad de la UNE 56546, sin clase asignada', () => {
    const d = deriveMadera(grupo({ especie: 'Castanea sativa', claseResistente: 'D30' }));
    expect(d.calidad).toBe('MEF o MEF-G');
    expect(d.mensajes.find((m) => m.referencia === 'UNE 56546:2013')!.texto).toMatch(
      /UNE-EN 1912; el DB SE-M no la tabula/,
    );
  });

  it('la laminada no tiene calidad visual: se fabrica, no se clasifica en obra', () => {
    expect(
      deriveMadera(grupo({ tipo: 'laminada', claseResistente: 'GL24h', especie: 'Picea abies' }))
        .calidad,
    ).toBeUndefined();
  });

  it('una especie fuera de la tabla no avisa de nada: no hay nada que decir', () => {
    const d = deriveMadera(grupo({ especie: 'Populus sp.', claseResistente: 'C18' }));
    expect(d.calidad).toBeUndefined();
    expect(d.mensajes.filter((m) => m.referencia === 'DB SE-M tabla C.1')).toHaveLength(0);
  });
});
