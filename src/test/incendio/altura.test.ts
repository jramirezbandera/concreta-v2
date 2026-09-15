/**
 * Las cotas y la altura de evacuación.
 *
 * La cuenta parece trivial y no lo es: el origen de cotas no es el suelo del
 * edificio sino el forjado de la PLANTA DE SALIDA, los sótanos quedan en
 * negativo, y la planta más alta puede no contar —si sólo tiene zonas de
 * ocupación nula, el Anejo A del DB SI la deja fuera—. Equivocarse en
 * cualquiera de las tres mete el edificio en otra columna de la tabla 3.1.
 */

import { describe, expect, it } from 'vitest';
import { alturasDeEvacuacion, bandaDeAltura, type PlantaParaAltura } from '../../lib/incendio/altura';

/** De abajo arriba, como las quiere la función. */
const p = (
  nombre: string,
  altura: number | null,
  o: { bajoRasante?: boolean; cuenta?: boolean; canto?: number | null } = {},
): PlantaParaAltura => ({
  nombre,
  altura,
  // El canto sólo lo usa el modo libre; en el modo total da igual lo que valga.
  canto: o.canto === undefined ? 0.3 : o.canto,
  bajoRasante: o.bajoRasante ?? false,
  cuenta: o.cuenta ?? true,
});

const cotas = (ps: PlantaParaAltura[]) =>
  Object.fromEntries(alturasDeEvacuacion(ps).plantas.map((x) => [x.nombre, x.cota]));

describe('las cotas', () => {
  it('arrancan en cero en el forjado de la planta de salida', () => {
    const r = cotas([p('Planta Baja', 3.2), p('Planta Primera', 3), p('Cubierta', null)]);
    expect(r).toEqual({ 'Planta Baja': 0, 'Planta Primera': 3.2, Cubierta: 6.2 });
  });

  it('los sótanos quedan en negativo', () => {
    const r = cotas([
      p('Sótano', 2.8, { bajoRasante: true }),
      p('Planta Baja', 3.2),
      p('Planta Primera', 3),
      p('Cubierta', null),
    ]);
    expect(r['Sótano']).toBeCloseTo(-2.8, 10);
    expect(r['Planta Baja']).toBe(0);
    expect(r['Cubierta']).toBeCloseTo(6.2, 10);
  });

  it('dos sótanos se acumulan hacia abajo', () => {
    const r = cotas([
      p('Sótano -2', 2.6, { bajoRasante: true }),
      p('Sótano -1', 2.8, { bajoRasante: true }),
      p('Planta Baja', 3.2),
      p('Cubierta', null),
    ]);
    expect(r['Sótano -2']).toBeCloseTo(-5.4, 10);
    expect(r['Sótano -1']).toBeCloseTo(-2.8, 10);
  });

  it('a la planta más alta no se le pide altura', () => {
    const a = alturasDeEvacuacion([p('Planta Baja', 3.2), p('Cubierta', null)]);
    expect(a.sinAltura).toEqual([]);
    expect(a.plantas[1].esLaMasAlta).toBe(true);
  });

  it('una altura que falta corta la cuenta de ahí para arriba, y entonces NO hay altura de evacuación', () => {
    const a = alturasDeEvacuacion([
      p('Planta Baja', 3.2),
      p('Planta Primera', null),
      p('Planta Segunda', 3),
      p('Cubierta', null),
    ]);
    expect(a.sinAltura).toEqual(['Planta Primera']);
    expect(a.plantas.map((x) => x.cota)).toEqual([0, 3.2, null, null]);
    // Antes devolvía 3,2 —la cota más alta que pudo acumular— y ese número,
    // más bajo que el real, entraba en la tabla 3.1 y salía impreso.
    expect(a.descendente).toBeNull();
    expect(a.avisos.join(' ')).toContain('Falta la altura de Planta Primera');
    expect(a.avisos.join(' ')).toContain('no se puede cerrar');
  });

  it('sin ninguna altura tecleada no da cero: da nada', () => {
    const a = alturasDeEvacuacion([
      p('Planta Baja', null),
      p('Planta Primera', null),
      p('Cubierta', null),
    ]);
    expect(a.descendente).toBeNull();
    expect(a.ascendente).toBe(0);
  });

  it('pero una altura que falta por ENCIMA del último origen no corta nada', () => {
    // La de la primera sólo hace falta para la cota de la cubierta, y la
    // cubierta no cuenta: la altura de evacuación está cerrada en 3,2.
    const a = alturasDeEvacuacion([
      p('Planta Baja', 3.2),
      p('Planta Primera', null),
      p('Cubierta', null, { cuenta: false }),
    ]);
    expect(a.descendente).toBe(3.2);
    expect(a.sinAltura).toEqual(['Planta Primera']);
    expect(a.avisos.join(' ')).toContain('No cambia la altura de evacuación');
  });

  it('un sótano sin altura corta la ascendente y deja la descendente', () => {
    const a = alturasDeEvacuacion([
      p('Sótano', null, { bajoRasante: true }),
      p('Planta Baja', 3.2),
      p('Planta Primera', 3),
      p('Cubierta', null, { cuenta: false }),
    ]);
    // La descendente llega al forjado de la primera (la cubierta no cuenta).
    expect(a.descendente).toBeCloseTo(3.2, 10);
    expect(a.ascendente).toBeNull();
  });

  it('y un sótano que no se ocupa puede quedarse sin altura sin cortar nada', () => {
    const a = alturasDeEvacuacion([
      p('Sótano', null, { bajoRasante: true, cuenta: false }),
      p('Planta Baja', 3.2),
      p('Cubierta', null, { cuenta: false }),
    ]);
    // Sólo cuenta la planta de salida: cero, como en el edificio de una planta.
    expect(a.descendente).toBe(0);
    expect(a.ascendente).toBe(0);
  });
});

describe('la altura de evacuación', () => {
  const edificio = (cubiertaCuenta: boolean) => [
    p('Planta Baja', 3.2),
    p('Planta Primera', 3),
    p('Cubierta', null, { cuenta: cubiertaCuenta }),
  ];

  it('no llega hasta la cubierta cuando ésta es de ocupación nula', () => {
    const a = alturasDeEvacuacion(edificio(false));
    expect(a.descendente).toBe(3.2);
    expect(a.avisos.join(' ')).toContain('No se cuentan como origen de evacuación: Cubierta');
  });

  it('y sí cuando la cubierta es transitable', () => {
    expect(alturasDeEvacuacion(edificio(true)).descendente).toBeCloseTo(6.2, 10);
  });

  it('un edificio de una sola planta sobre rasante da cero, no null', () => {
    const a = alturasDeEvacuacion([p('Planta Baja', 3.2), p('Cubierta', null, { cuenta: false })]);
    expect(a.descendente).toBe(0);
    expect(a.ascendente).toBe(0);
  });

  it('la ascendente sale del sótano ocupado más bajo, en positivo', () => {
    const a = alturasDeEvacuacion([
      p('Sótano -2', 2.6, { bajoRasante: true }),
      p('Sótano -1', 2.8, { bajoRasante: true }),
      p('Planta Baja', 3.2),
      p('Cubierta', null, { cuenta: false }),
    ]);
    expect(a.ascendente).toBeCloseTo(5.4, 10);
    expect(a.descendente).toBe(0);
    expect(a.avisos.join(' ')).toContain('evacuación ascendente');
  });

  it('un sótano que no se ocupa no da altura ascendente', () => {
    const a = alturasDeEvacuacion([
      p('Sótano', 2.8, { bajoRasante: true, cuenta: false }),
      p('Planta Baja', 3.2),
      p('Cubierta', null, { cuenta: false }),
    ]);
    expect(a.ascendente).toBe(0);
  });

  it('sin ninguna planta sobre rasante no hay cota de referencia', () => {
    const a = alturasDeEvacuacion([
      p('Sótano -1', 2.8, { bajoRasante: true }),
      p('Sótano -2', 2.6, { bajoRasante: true }),
    ]);
    expect(a.descendente).toBeNull();
    expect(a.ascendente).toBeNull();
    expect(a.avisos.join(' ')).toContain('sin planta de salida');
  });

  it('sin plantas, ni cuenta ni avisa', () => {
    expect(alturasDeEvacuacion([])).toEqual({
      plantas: [],
      descendente: null,
      ascendente: null,
      sinAltura: [],
      avisos: [],
    });
  });
});

describe('la banda de la tabla 3.1', () => {
  it('parte en 15 y en 28, y los bordes caen en la banda de abajo', () => {
    expect(bandaDeAltura(0)).toBe('h15');
    expect(bandaDeAltura(15)).toBe('h15');
    expect(bandaDeAltura(15.01)).toBe('h28');
    expect(bandaDeAltura(28)).toBe('h28');
    expect(bandaDeAltura(28.01)).toBe('mas28');
    expect(bandaDeAltura(50)).toBe('mas28');
  });
});

/**
 * El modo LIBRE, que es el que obliga a saber el canto.
 *
 * Tecleando la altura libre, subir de una planta a la de encima cuesta la libre
 * MÁS EL CANTO DEL FORJADO DE ARRIBA: la libre llega a la cara inferior de ese
 * forjado y la cota se mide en su cara superior. Confundirlo se come un canto
 * por planta, y en un edificio de diez plantas son tres metros —suficiente para
 * cambiar de columna en la tabla 3.1—.
 */
describe('tecleando la altura LIBRE', () => {
  const edificio = () => [
    p('Planta Baja', 2.9, { canto: 0.35 }),
    p('Planta Primera', 2.7, { canto: 0.3 }),
    p('Cubierta', null, { canto: 0.25, cuenta: false }),
  ];

  it('le suma el canto del forjado de ENCIMA, no el suyo', () => {
    const a = alturasDeEvacuacion(edificio(), 'libre');
    // Planta Baja: 2,90 libre + 0,30 del forjado de la primera = 3,20.
    expect(a.plantas[1].cota).toBeCloseTo(3.2, 10);
    // Planta Primera: 2,70 + 0,25 del forjado de cubierta = 2,95 → 6,15.
    expect(a.plantas[2].cota).toBeCloseTo(6.15, 10);
    expect(a.descendente).toBeCloseTo(3.2, 10);
  });

  it('y en modo total esas mismas cifras se leen tal cual', () => {
    const a = alturasDeEvacuacion(edificio(), 'total');
    expect(a.plantas[1].cota).toBeCloseTo(2.9, 10);
    expect(a.plantas[2].cota).toBeCloseTo(5.6, 10);
  });

  it('enseña la otra altura y el canto que ha usado', () => {
    const a = alturasDeEvacuacion(edificio(), 'libre');
    expect(a.plantas[0].cantoUsado).toBeCloseTo(0.3, 10);
    expect(a.plantas[0].subida).toBeCloseTo(3.2, 10);
    expect(a.plantas[0].otraAltura).toBeCloseTo(3.2, 10);
    // La más alta no tiene forjado encima: ni canto, ni subida, ni otra altura.
    expect(a.plantas[2].cantoUsado).toBeNull();
    expect(a.plantas[2].subida).toBeNull();
    expect(a.plantas[2].otraAltura).toBeNull();
  });

  it('en modo total, la otra altura es la libre que resulta de descontar el canto', () => {
    const a = alturasDeEvacuacion(edificio(), 'total');
    // 2,90 totales menos los 0,30 del forjado de encima = 2,60 libres.
    expect(a.plantas[0].otraAltura).toBeCloseTo(2.6, 10);
    expect(a.plantas[0].cantoUsado).toBeNull();
  });

  it('un canto que falta corta la cuenta y lo dice', () => {
    const a = alturasDeEvacuacion(
      [
        p('Planta Baja', 2.9, { canto: 0.35 }),
        p('Planta Primera', 2.7, { canto: null }),
        p('Cubierta', null, { canto: 0.25 }),
      ],
      'libre',
    );
    expect(a.plantas[1].cota).toBeNull();
    expect(a.avisos.join(' ')).toContain('falta el de Planta Primera');
    expect(a.avisos.join(' ')).toContain('Cargas por planta');
  });

  it('pero en modo total ese mismo canto que falta da igual', () => {
    const a = alturasDeEvacuacion(
      [
        p('Planta Baja', 2.9, { canto: 0.35 }),
        p('Planta Primera', 2.7, { canto: null }),
        p('Cubierta', null, { canto: 0.25 }),
      ],
      'total',
    );
    expect(a.plantas[1].cota).toBeCloseTo(2.9, 10);
    expect(a.avisos.join(' ')).not.toContain('canto');
  });

  it('los sótanos también bajan sumando el canto de arriba', () => {
    const a = alturasDeEvacuacion(
      [
        p('Sótano', 2.5, { bajoRasante: true, canto: 0.4 }),
        p('Planta Baja', 2.9, { canto: 0.35 }),
        p('Cubierta', null, { canto: 0.3, cuenta: false }),
      ],
      'libre',
    );
    // El sótano sube 2,50 libres + 0,35 del forjado de planta baja = 2,85.
    expect(a.plantas[0].cota).toBeCloseTo(-2.85, 10);
    expect(a.ascendente).toBeCloseTo(2.85, 10);
  });
});
