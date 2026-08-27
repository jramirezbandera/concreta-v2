/**
 * El parser y las claves de busqueda del harvester del Anejo 1.
 *
 * Vive como `*.golden.test.ts` (proyecto `node`, excluido del typecheck de
 * `tsconfig.app.json`) porque importa un `.mjs` de `scripts/`, que no esta bajo
 * `include: ["src"]`. No usa red: el harvester solo barre cuando se le invoca
 * como programa.
 *
 * Lo que se protege aqui no es cosmetico. Si una clave de busqueda deja de
 * generarse, el municipio existe en el dataset pero el usuario NO lo encuentra,
 * y el modulo le dice "no figura en el Anejo 1", que ademas es un mensaje que
 * significa "la Norma no te obliga". Un fallo de indexado se disfraza de
 * exencion normativa.
 */
import { describe, expect, it } from 'vitest';

// @ts-expect-error - script de desarrollo en JS, sin tipos
import { clavesDe, parsearFila, plegar } from '../../../scripts/harvest-ign-hazard.mjs';
// @ts-expect-error - script de desarrollo en JS, sin tipos
import { suplementar } from '../../../scripts/ncse02-suplemento.mjs';

/** Fila tal cual la devuelve el servicio del IGN (verificada el 2026-08-26). */
const GRANADA = {
  gid: 1599,
  ine_mun: '18087',
  ine_pro: '18',
  nombre: 'Granada',
  x: '-33555.46',
  y: '371039.63',
  aceleracion: '0.23',
  coeficient: '(1.0)',
};

describe('parsearFila', () => {
  it('lee la fila real de Granada', () => {
    expect(parsearFila(GRANADA)).toEqual({
      ine: '18087',
      nombre: 'Granada',
      gid: 1599,
      ab: 0.23,
      k: 1.0,
    });
  });

  it('K viene entre parentesis, que es como lo denota el Anejo 1', () => {
    expect(parsearFila({ ...GRANADA, coeficient: '(1.3)' }).k).toBe(1.3);
    expect(parsearFila({ ...GRANADA, coeficient: '1.3' }).k).toBe(1.3);
  });

  it('ab y K nulos son DATO, no fallo: el municipio no figura en el Anejo 1', () => {
    const fuera = parsearFila({ ...GRANADA, ine_mun: '33044', nombre: 'Oviedo', aceleracion: null, coeficient: null });
    expect(fuera.ab).toBeNull();
    expect(fuera.k).toBeNull();
  });

  it('rompe si ab y K vienen desparejados', () => {
    expect(() => parsearFila({ ...GRANADA, aceleracion: null })).toThrow(/desparejados/);
    expect(() => parsearFila({ ...GRANADA, coeficient: null })).toThrow(/desparejados/);
  });

  it('rompe ante ab o K ilegibles en vez de escribir basura', () => {
    expect(() => parsearFila({ ...GRANADA, aceleracion: 'o,o4' })).toThrow(/ab ilegible/);
    expect(() => parsearFila({ ...GRANADA, coeficient: '(l,o)' })).toThrow(/K ilegible/);
  });

  it('rellena el codigo INE a cinco digitos', () => {
    expect(parsearFila({ ...GRANADA, ine_mun: '1001' }).ine).toBe('01001');
  });
});

describe('plegar', () => {
  it('quita acentos y enyes y baja a minusculas', () => {
    expect(plegar('Jávea')).toBe('javea');
    expect(plegar('A Coruña')).toBe('a coruna');
    expect(plegar('Sant Hipòlit de Voltregà')).toBe('sant hipolit de voltrega');
  });

  it('colapsa la puntuacion en espacios', () => {
    expect(plegar("L'Hospitalet de Llobregat")).toBe('l hospitalet de llobregat');
    expect(plegar('Vitoria-Gasteiz')).toBe('vitoria gasteiz');
  });
});

describe('clavesDe', () => {
  it('desinvierte el articulo que el IGN pone al final', () => {
    // 8,5 % de los nombres. Quien busca teclea "la union", no "union la".
    expect(clavesDe('Unión (La)')).toEqual(expect.arrayContaining(['union', 'la union']));
    expect(clavesDe('Coruña (A)')).toEqual(expect.arrayContaining(['coruna', 'a coruna']));
    expect(clavesDe('Bòrdes (Es)')).toEqual(expect.arrayContaining(['bordes', 'es bordes']));
  });

  it('indexa las DOS formas de un nombre bilingue', () => {
    // 1,4 % de los nombres. Sin esto, quien escribe "Alacant" no encuentra
    // Alicante, que es capital de provincia con ab alta.
    expect(clavesDe('Alicante/Alacant')).toEqual(expect.arrayContaining(['alicante', 'alacant']));
    expect(clavesDe('Jávea/Xàbia')).toEqual(expect.arrayContaining(['javea', 'xabia']));
    expect(clavesDe('Alcoy/Alcoi')).toEqual(expect.arrayContaining(['alcoy', 'alcoi']));
  });

  it('combina barra y articulo en el mismo nombre', () => {
    const c = clavesDe('Benitachell/Poble Nou de Benitatxell (el)');
    expect(c).toEqual(
      expect.arrayContaining([
        'benitachell',
        'poble nou de benitatxell',
        'el poble nou de benitatxell',
      ]),
    );
  });

  it('NO desinvierte un parentesis que no es articulo', () => {
    const c = clavesDe('Villanueva (Zaragoza)');
    expect(c).toContain('villanueva zaragoza');
    expect(c).not.toContain('zaragoza villanueva');
  });

  it('no devuelve claves vacias ni repetidas', () => {
    for (const n of ['Granada', 'Unión (La)', 'Alicante/Alacant', 'Vitoria-Gasteiz']) {
      const c: string[] = clavesDe(n);
      expect(c.every((s) => s.length > 0)).toBe(true);
      expect(new Set(c).size).toBe(c.length);
    }
  });

  it('indexa tambien el nombre oficial ENTERO, para quien lo pega', () => {
    // Las variantes cortas cubren a quien TECLEA; esta cubre a quien COPIA el
    // nombre del BOE, de un pliego o del rotulo de la propia aplicacion. Sin
    // ella fallaban 295 de los 2.610 municipios (11,3 %), Alicante incluido.
    expect(clavesDe('Alicante/Alacant')).toContain('alicante alacant');
    expect(clavesDe('Unión (La)')).toContain('union la');
    expect(clavesDe("Alfàs del Pi (l')")).toContain('alfas del pi l');
  });

  it('un nombre simple no gana claves por indexar el completo', () => {
    // El coste del cambio son solo los nombres con barra o parentesis.
    expect(clavesDe('Granada')).toEqual(['granada']);
    expect(clavesDe('Vitoria-Gasteiz')).toEqual(['vitoria gasteiz']);
  });
});

describe('suplementar', () => {
  const cosecha = () => [
    { ine: '11901', nombre: 'Benalup-Casas Viejas', ab: 0.05, k: 1.4 },
    { ine: '18020', nombre: 'Arenas del Rey', ab: 0.24, k: 1.0 },
    { ine: '18158', nombre: 'Pinos Puente', ab: 0.22, k: 1.0 },
    { ine: '18087', nombre: 'Granada', ab: 0.23, k: 1.0 },
  ];
  const buscar = (filas: { ine: string }[], ine: string) => filas.find((f) => f.ine === ine);

  it('anade los municipios que el Anejo 1 lista y la capa no resuelve', () => {
    const { filas, procedencia } = suplementar(cosecha());
    expect(buscar(filas, '51001')).toMatchObject({ nombre: 'Ceuta', ab: 0.05, k: 1.2 });
    expect(buscar(filas, '52001')).toMatchObject({ nombre: 'Melilla', ab: 0.08, k: 1.0 });
    expect(procedencia['51001'].tipo).toBe('anejo1-texto');
    // Y cita la entrada del BOE, para poder contrastarla sin fiarse.
    expect(procedencia['51001'].boe).toMatch(/CIUDAD DE CEUTA/);
  });

  it('corrige el K que la capa contradice, y deja dicho por que', () => {
    const { filas, procedencia, informe } = suplementar(cosecha());
    expect(buscar(filas, '11901')).toMatchObject({ ab: 0.05, k: 1.2 });
    expect(procedencia['11901'].tipo).toBe('correccion');
    expect(informe.corregidas).toBe(1);
  });

  it('un municipio posterior a 2002 hereda del termino del que salio', () => {
    const { filas, procedencia } = suplementar(cosecha());
    expect(buscar(filas, '18077')).toMatchObject({ nombre: 'Fornes', ab: 0.24, k: 1.0 });
    expect(procedencia['18077']).toMatchObject({
      tipo: 'segregado',
      padre: { ine: '18020', nombre: 'Arenas del Rey' },
      anio: 2018,
    });
  });

  it('si el padre no esta en el Anejo 1, el hijo tampoco entra', () => {
    // No es un hueco: es la respuesta correcta. El territorio esta por debajo
    // de 0,04 g y el municipio nuevo hereda esa exencion.
    const { filas } = suplementar([{ ine: '18087', nombre: 'Granada', ab: 0.23, k: 1.0 }]);
    expect(buscar(filas, '18077')).toBeUndefined();
    expect(buscar(filas, '15902')).toBeUndefined();
  });

  it('una fusion con dos padres se queda con el mas desfavorable', () => {
    // El termino nuevo cubre los dos anteriores, asi que no puede clasificarse
    // por el mas benigno de ellos.
    const { filas } = suplementar([
      { ine: '36011', nombre: 'Cerdedo', ab: 0.04, k: 1.0 },
      { ine: '36012', nombre: 'Cotobade', ab: 0.08, k: 1.2 },
    ]);
    expect(buscar(filas, '36902')).toMatchObject({ nombre: 'Cerdedo-Cotobade', ab: 0.08, k: 1.2 });
  });

  it('avisa de podar cuando el IGN arregla la capa por su cuenta', () => {
    // El mantenimiento de la tabla no puede depender de que alguien se acuerde:
    // en cuanto la cosecha traiga el dato bueno, el barrido lo canta.
    const arreglada = [
      ...cosecha().filter((f) => f.ine !== '11901'),
      { ine: '11901', nombre: 'Benalup-Casas Viejas', ab: 0.05, k: 1.2 },
      { ine: '51001', nombre: 'Ceuta', ab: 0.05, k: 1.2 },
      { ine: '18077', nombre: 'Fornes', ab: 0.24, k: 1.0 },
    ];
    const { informe } = suplementar(arreglada);
    const avisos = informe.avisos.join(' | ');
    expect(avisos).toMatch(/PODAR.*51001/);
    expect(avisos).toMatch(/PODAR.*11901/);
    expect(avisos).toMatch(/PODAR.*18077/);
  });

  it('avisa, y hace ganar al BOE, si la capa rellena el hueco con OTRO valor', () => {
    const distinta = [...cosecha(), { ine: '52001', nombre: 'Melilla', ab: 0.12, k: 1.0 }];
    const { filas, informe } = suplementar(distinta);
    expect(buscar(filas, '52001')).toMatchObject({ ab: 0.08 });
    expect(informe.avisos.join(' | ')).toMatch(/REVISAR.*52001/);
  });

  it('no muta lo que recibe', () => {
    const entrada = cosecha();
    suplementar(entrada);
    expect(entrada.find((f) => f.ine === '11901')?.k).toBe(1.4);
    expect(entrada).toHaveLength(4);
  });
});
