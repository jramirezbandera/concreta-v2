/**
 * La resistencia al fuego exigida, que no es UNA cifra.
 *
 * El cuadro de materiales nació con un solo desplegable de R para toda la obra,
 * y eso no describe a casi ningún edificio: el DB SI 6 tiene columna aparte
 * para las plantas de sótano y regla propia para la cubierta ligera, así que lo
 * normal es el sótano con aparcamiento por un lado, las plantas sobre rasante
 * por otro y la cubierta por un tercero.
 *
 * Lo que se fija aquí:
 *
 *  - con una sola exigencia de ámbito «toda la estructura» —la que hereda lo
 *    guardado con el esquema viejo— la nota sale REDACTADA IGUAL que antes;
 *  - con varias se enumeran, y la segunda frase deja de hablar de un número;
 *  - una exigencia a medio rellenar no se imprime.
 *
 * La nota se sigue probando A TRAVÉS del cuadro de coeficientes de minoración,
 * que es quien la imprime en el plano y en la memoria: lo que importa es que
 * ese documento no cambie ni una coma al haberse mudado el dato de módulo.
 */

import { describe, expect, it } from 'vitest';
import { cuadroCoeficientesMinoracion } from '../../lib/materiales/cuadros';
import {
  AMBITO_TODA_LA_ESTRUCTURA,
  CITA_ANEJO_B,
  CITA_PROYECTISTA,
  CITA_TABLA_31,
  CITA_TABLA_32,
  exigenciasResueltas,
  fraseAmbito,
} from '../../lib/incendio/exigencias';
import { anejosFuego, presentesDeSobre } from '../../lib/incendio/notas';

const notasDe = (blocks: ReturnType<typeof cuadroCoeficientesMinoracion>) => {
  const n = blocks.find((b) => b.kind === 'notes');
  if (n?.kind !== 'notes') throw new Error('sin notas');
  return n.items.join(' ');
};

const nota = (...fuego: { ambito: string; minutos: number; cita?: string }[]) =>
  notasDe(cuadroCoeficientesMinoracion({ hormigon: true }, fuego));

/** Lo que publica un sector de uso resuelto por la tabla 3.1. */
const deTabla = (ambito: string, minutos: number) => ({ ambito, minutos, cita: CITA_TABLA_31 });

describe('la nota del cuadro', () => {
  it('con una sola R para toda la obra dice lo mismo que decía', () => {
    const n = nota({ ambito: AMBITO_TODA_LA_ESTRUCTURA, minutos: 60, cita: CITA_TABLA_31 });
    expect(n).toContain(
      'Resistencia al fuego exigida a la estructura: R60, según el CTE DB SI 6 (tabla 3.1).',
    );
    expect(n).toContain('La estructura alcanzará dicha resistencia');
    expect(n).toContain('que garanticen R60 en los elementos que no la alcancen por sí mismos');
  });

  it('con varias zonas las enumera, en el orden en que se tecleen', () => {
    const n = nota(
      deTabla('Sótano con aparcamiento', 120),
      deTabla('Plantas sobre rasante', 60),
      deTabla('Cubierta ligera', 30),
    );
    expect(n).toContain(
      'Resistencia al fuego exigida a la estructura, según el CTE DB SI 6 (tabla 3.1): ' +
        'R120 en el sótano con aparcamiento; R60 en las plantas sobre rasante; ' +
        'R30 en la cubierta ligera.',
    );
  });

  /**
   * El DB SI 6 admite cuatro caminos para la R y la nota los citaba todos como
   * «(tabla 3.1)»: en la memoria del módulo, la tabla de encima decía la
   * procedencia y la nota de debajo la contradecía; en el cuadro de materiales
   * y en la ficha del DB SE sólo se veía la cita equivocada.
   */
  it('y cuando no todas salen del mismo sitio, cada una dice el suyo', () => {
    const n = nota(
      deTabla('Plantas sobre rasante', 60),
      { ambito: 'Oficinas', minutos: 107, cita: CITA_ANEJO_B },
      { ambito: 'Zonas de riesgo especial', minutos: 120, cita: CITA_TABLA_32 },
    );
    expect(n).toContain(
      'Resistencia al fuego exigida a la estructura, según el CTE DB SI 6: ' +
        'R60 en las plantas sobre rasante (tabla 3.1); ' +
        'R107 en Oficinas (tiempo equivalente del Anejo B, § 3.1.b); ' +
        'R120 en las zonas de riesgo especial (tabla 3.2).',
    );
  });

  it('y la R que declara el proyectista se cita como lo que es', () => {
    const n = nota({ ambito: AMBITO_TODA_LA_ESTRUCTURA, minutos: 90, cita: CITA_PROYECTISTA });
    expect(n).toContain(
      'Resistencia al fuego exigida a la estructura: R90, según el CTE DB SI 6 (declarada en el proyecto).',
    );
  });

  it('un sobre viejo, sin procedencia, cita el DB SI 6 a secas', () => {
    // El campo es aditivo y no sube la versión del sobre: lo escrito antes de
    // llevarlo no puede imprimir una cita inventada.
    expect(nota({ ambito: AMBITO_TODA_LA_ESTRUCTURA, minutos: 60 })).toContain(
      'Resistencia al fuego exigida a la estructura: R60, según el CTE DB SI 6.',
    );
  });

  it('con varias R distintas la segunda frase deja de nombrar un número', () => {
    const n = nota(
      { ambito: 'Plantas de sótano', minutos: 120 },
      { ambito: 'Plantas sobre rasante', minutos: 60 },
    );
    expect(n).toContain('La estructura alcanzará en cada zona la resistencia exigida');
    expect(n).toContain('que garanticen la resistencia exigida en los elementos');
    // No hay UNA resistencia a la que referirse con «dicha».
    expect(n).not.toContain('dicha resistencia');
    // Y las dos vías siguen abiertas: eso no depende de cuántas zonas haya.
    expect(n).toContain('por su propia configuración');
    expect(n).toContain('protecciones adicionales');
  });

  it('dos zonas con la misma R vuelven a poder nombrarla', () => {
    const n = nota(
      { ambito: 'Plantas sobre rasante', minutos: 60 },
      { ambito: 'Escaleras y zonas protegidas', minutos: 60 },
    );
    expect(n).toContain('R60 en las plantas sobre rasante; R60 en las escaleras y las zonas protegidas.');
    expect(n).toContain('que garanticen R60');
  });

  it('un ámbito escrito a mano entra en la frase tal como se escribió', () => {
    const n = nota({ ambito: 'los soportes del voladizo de la cafetería', minutos: 90 });
    expect(n).toContain('R90 en los soportes del voladizo de la cafetería.');
    expect(fraseAmbito('los soportes del voladizo de la cafetería')).toBe(
      'los soportes del voladizo de la cafetería',
    );
  });

  it('sin exigencias no se imprime nada de fuego', () => {
    const n = nota();
    expect(n).not.toContain('DB SI');
    expect(n).toContain('Aplicable a los valores característicos.');
  });

  it('una R que no es de las tabuladas se imprime igual', () => {
    // El tiempo equivalente del Anejo B da minutos exactos. Nada en la
    // redacción supone que la R sea una de las seis clases.
    expect(
      nota({ ambito: AMBITO_TODA_LA_ESTRUCTURA, minutos: 97, cita: CITA_ANEJO_B }),
    ).toContain(
      'Resistencia al fuego exigida a la estructura: R97, según el CTE DB SI 6 '
        + '(tiempo equivalente del Anejo B, § 3.1.b).',
    );
  });
});

describe('los anejos que cita la nota', () => {
  it('nombra sólo los de los materiales que hay', () => {
    expect(anejosFuego({ hormigon: true })).toBe('del anejo C');
    expect(anejosFuego({ hormigon: true, aceroLaminado: true })).toBe('de los anejos C y D');
    expect(anejosFuego({ maderaLaminada: true, maderaMaciza: true })).toBe('del anejo E');
  });

  it('sin saber de qué es la obra, los nombra todos', () => {
    // Deja de ser teórico desde que las exigencias y los materiales vienen de
    // sobres distintos: puede haber uno y faltar el otro.
    expect(anejosFuego({})).toBe('de los anejos C a F');
    expect(anejosFuego(presentesDeSobre(null))).toBe('de los anejos C a F');
  });
});

describe('las exigencias resueltas', () => {
  it('una exigencia a medio rellenar no se imprime', () => {
    expect(
      exigenciasResueltas([
        { ambito: 'Sótano', minutos: null },
        { ambito: '   ', minutos: 60 },
        { ambito: 'Cubierta ligera', minutos: 30 },
      ]),
    ).toEqual([{ ambito: 'Cubierta ligera', minutos: 30, cita: CITA_PROYECTISTA }]);
  });
});

describe('de qué está hecha la obra, según el sobre', () => {
  it('ata el acero de armar al hormigón y lee los tipos de madera', () => {
    expect(
      presentesDeSobre({
        hormigon: { fck: 30 },
        aceroEstructural: null,
        madera: { grupos: [{ tipo: 'laminada' }] },
      }),
    ).toEqual({
      hormigon: true,
      aceroDeArmar: true,
      aceroLaminado: false,
      maderaLaminada: true,
      maderaMaciza: false,
    });
  });
});
