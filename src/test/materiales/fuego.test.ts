/**
 * La resistencia al fuego exigida, que no es UNA cifra.
 *
 * El módulo nació con un solo desplegable de R para toda la obra, y eso no
 * describe a casi ningún edificio: el DB SI 6 tiene columna aparte para las
 * plantas de sótano y regla propia para la cubierta ligera, así que lo normal
 * es el sótano con aparcamiento por un lado, las plantas sobre rasante por
 * otro y la cubierta por un tercero.
 *
 * Lo que se fija aquí:
 *
 *  - con una sola exigencia de ámbito «toda la estructura» —la que hereda lo
 *    guardado con el esquema viejo— la nota sale REDACTADA IGUAL que antes;
 *  - con varias se enumeran, y la segunda frase deja de hablar de un número;
 *  - una exigencia a medio rellenar es un hueco: ni se imprime ni se publica,
 *    y bloquea exportar.
 */

import { describe, expect, it } from 'vitest';
import { cuadroCoeficientesMinoracion } from '../../lib/materiales/cuadros';
import {
  AMBITO_TODA_LA_ESTRUCTURA,
  exigenciasResueltas,
  fraseAmbito,
} from '../../lib/materiales/fuego';
import {
  datosPublicacion,
  defaultMaterialesState,
  evaluar,
  normalizar,
  type MaterialesState,
} from '../../features/materiales/state';

const notasDe = (blocks: ReturnType<typeof cuadroCoeficientesMinoracion>) => {
  const n = blocks.find((b) => b.kind === 'notes');
  if (n?.kind !== 'notes') throw new Error('sin notas');
  return n.items.join(' ');
};

const nota = (...fuego: { ambito: string; minutos: number }[]) =>
  notasDe(cuadroCoeficientesMinoracion({ hormigon: true }, fuego));

const conFuego = (filas: MaterialesState['exigenciasFuego']): MaterialesState => ({
  ...defaultMaterialesState(),
  exigenciasFuego: filas,
});

describe('la nota del cuadro', () => {
  it('con una sola R para toda la obra dice lo mismo que decía', () => {
    const n = nota({ ambito: AMBITO_TODA_LA_ESTRUCTURA, minutos: 60 });
    expect(n).toContain(
      'Resistencia al fuego exigida a la estructura: R60, según el CTE DB SI 6 (tabla 3.1).',
    );
    expect(n).toContain('La estructura alcanzará dicha resistencia');
    expect(n).toContain('que garanticen R60 en los elementos que no la alcancen por sí mismos');
  });

  it('con varias zonas las enumera, en el orden en que se tecleen', () => {
    const n = nota(
      { ambito: 'Sótano con aparcamiento', minutos: 120 },
      { ambito: 'Plantas sobre rasante', minutos: 60 },
      { ambito: 'Cubierta ligera', minutos: 30 },
    );
    expect(n).toContain(
      'Resistencia al fuego exigida a la estructura, según el CTE DB SI 6 (tabla 3.1): ' +
        'R120 en el sótano con aparcamiento; R60 en las plantas sobre rasante; ' +
        'R30 en la cubierta ligera.',
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
});

describe('huecos', () => {
  it('una exigencia a medio rellenar no se imprime', () => {
    expect(
      exigenciasResueltas([
        { ambito: 'Sótano', minutos: null },
        { ambito: '   ', minutos: 60 },
        { ambito: 'Cubierta ligera', minutos: 30 },
      ]),
    ).toEqual([{ ambito: 'Cubierta ligera', minutos: 30 }]);
  });

  it('y bloquea exportar y publicar, como una fila sin situación', () => {
    const sinR = evaluar(conFuego([{ id: 'f1', ambito: 'Sótano', minutos: null }]));
    expect(sinR.huecosFuego).toHaveLength(1);
    expect(sinR.listo).toBe(false);
    expect(datosPublicacion(conFuego([{ id: 'f1', ambito: 'Sótano', minutos: null }]), sinR)).toBeNull();

    const entera = conFuego([{ id: 'f1', ambito: 'Sótano', minutos: 120 }]);
    const ev = evaluar(entera);
    expect(ev.huecosFuego).toHaveLength(0);
    expect(ev.listo).toBe(true);
    expect(datosPublicacion(entera, ev)?.exigenciasFuego).toEqual([
      { ambito: 'Sótano', minutos: 120 },
    ]);
  });

  it('el estado por defecto no trae ninguna: sin indicar es sin indicar', () => {
    expect(defaultMaterialesState().exigenciasFuego).toEqual([]);
    expect(evaluar(defaultMaterialesState()).listo).toBe(true);
  });
});

describe('lo guardado con el esquema anterior', () => {
  it('la R suelta se hereda como una exigencia de toda la estructura', () => {
    expect(normalizar({ resistenciaFuego: 60 }).exigenciasFuego).toEqual([
      { id: expect.any(String), ambito: AMBITO_TODA_LA_ESTRUCTURA, minutos: 60 },
    ]);
    // Y la nota que sale de ahí es la de antes, palabra por palabra.
    expect(
      nota(...exigenciasResueltas(normalizar({ resistenciaFuego: 60 }).exigenciasFuego)),
    ).toContain('Resistencia al fuego exigida a la estructura: R60, según el CTE DB SI 6 (tabla 3.1).');
  });

  it('una R que no está en la lista no se hereda', () => {
    expect(normalizar({ resistenciaFuego: 45 }).exigenciasFuego).toEqual([]);
    expect(normalizar({ resistenciaFuego: 'R60' }).exigenciasFuego).toEqual([]);
    expect(normalizar({}).exigenciasFuego).toEqual([]);
  });

  it('la lista nueva se valida entrada por entrada, sin tirar las buenas', () => {
    const s = normalizar({
      exigenciasFuego: [
        { id: 'f1', ambito: 'Sótano', minutos: 120 },
        { id: 'f2', ambito: 'Cubierta', minutos: 45 },
        { ambito: 7, minutos: 30 },
        'basura',
      ],
    });
    expect(s.exigenciasFuego).toEqual([
      { id: 'f1', ambito: 'Sótano', minutos: 120 },
      // R45 no existe en el desplegable: la fila sobrevive como hueco.
      { id: 'f2', ambito: 'Cubierta', minutos: null },
      { id: expect.any(String), ambito: '', minutos: 30 },
    ]);
  });
});
