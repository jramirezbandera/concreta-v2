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
  deriveHormigon,
  deriveMadera,
  dosificacion,
} from '../../lib/materiales/derive';
import type { ElementoHormigon, OpcionesObra } from '../../lib/materiales/types';

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
    expect(d.cminDurabilidad).toBe(15); // sólo queda el cmin de XC2 con CEM I
    expect(d.mensajes.some((m) => m.severidad === 'error')).toBe(true);
    expect(d.mensajes.find((m) => m.severidad === 'error')?.referencia).toBe(
      'CE tabla 44.2.1.1.b',
    );
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
