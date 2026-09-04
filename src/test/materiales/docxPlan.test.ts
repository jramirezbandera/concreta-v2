/**
 * El plan de .docx: la maqueta, sin librería y sin zip.
 *
 * Todo lo que se comprueba aquí —anchos que suman 100, una tabla de doce
 * columnas que se parte en dos, el «(*)» que llega con su espacio— es
 * exactamente lo que en un renderer normal habría que verificar empaquetando el
 * documento y descomprimiéndolo. Ese es el motivo de que `plan.ts` exista, así
 * que este fichero es también su justificación: no importa `docx` por ningún
 * lado.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_COLUMNAS,
  planificarDocx,
  type BloquePlan,
  type PlanDocx,
} from '../../lib/docx/plan';
import { cuadroAceros, cuadroCoeficientesMinoracion } from '../../lib/materiales/cuadros';
import type { Block } from '../../lib/materiales/cuadros';

type TablaPlan = Extract<BloquePlan, { tipo: 'tabla' }>;
type ParrafoPlan = Extract<BloquePlan, { tipo: 'parrafo' }>;

const tablas = (plan: PlanDocx): TablaPlan[] =>
  plan.bloques.filter((b): b is TablaPlan => b.tipo === 'tabla');

const parrafos = (plan: PlanDocx): ParrafoPlan[] =>
  plan.bloques.filter((b): b is ParrafoPlan => b.tipo === 'parrafo');

/** Una tabla de n columnas y m filas, con textos de longitud controlada. */
const tablaDe = (columnas: number, filas = 2, etiqueta = 'Etiqueta'): Block => ({
  kind: 'table',
  head: [etiqueta, ...Array.from({ length: columnas - 1 }, (_, j) => `Columna ${j + 1}`)],
  rows: Array.from({ length: filas }, (_, i) => [
    `Fila ${i + 1}`,
    ...Array.from({ length: columnas - 1 }, (_, j) => `v${i}${j}`),
  ]),
});

describe('párrafos: cada bloque de texto cae en su estilo integrado de Word', () => {
  /**
   * Los tres niveles tienen que mapear a Heading1/2/3 y no a un estilo propio:
   * si el renderer inventara estilos, el cuadro pegado en la memoria del cliente
   * saldría con otra tipografía y el índice automático no lo vería.
   */
  it('heading de nivel 1, 2 y 3 → Heading1, Heading2 y Heading3', () => {
    const plan = planificarDocx(
      [
        { kind: 'heading', level: 1, text: 'MATERIALES' },
        { kind: 'heading', level: 2, text: 'MADERA' },
        { kind: 'heading', level: 3, text: 'Durabilidad' },
      ],
      '',
    );
    expect(plan.bloques).toEqual([
      { tipo: 'parrafo', estilo: 'Heading1', texto: 'MATERIALES' },
      { tipo: 'parrafo', estilo: 'Heading2', texto: 'MADERA' },
      { tipo: 'parrafo', estilo: 'Heading3', texto: 'Durabilidad' },
    ]);
  });

  it('paragraph → Normal', () => {
    const plan = planificarDocx([{ kind: 'paragraph', text: 'Longitudes en cm.' }], '');
    expect(plan.bloques).toEqual([
      { tipo: 'parrafo', estilo: 'Normal', texto: 'Longitudes en cm.' },
    ]);
  });
});

describe('tablas: cabecera y negritas', () => {
  /**
   * La fila 0 tiene que declararse cabecera para que Word la repita al partir
   * la tabla entre páginas. Sin eso, la segunda página del cuadro de anclajes
   * es una parrilla de números sin saber a qué diámetro pertenecen.
   */
  it('la primera fila es cabecera y va entera en negrita', () => {
    const [tabla] = tablas(planificarDocx([tablaDe(4)], ''));
    expect(tabla.filas[0].cabecera).toBe(true);
    expect(tabla.filas[0].celdas.every((c) => c.negrita)).toBe(true);
    expect(tabla.filas[0].celdas.map((c) => c.texto)).toEqual([
      'Etiqueta',
      'Columna 1',
      'Columna 2',
      'Columna 3',
    ]);
  });

  it('en las filas de datos sólo la celda 0 va en negrita', () => {
    // La celda 0 es la etiqueta de la fila («Posición I», «Tipificación»): es
    // lo único que se lee en diagonal. Si se pusiera en negrita todo, o nada,
    // el cuadro deja de tener jerarquía.
    const [tabla] = tablas(planificarDocx([tablaDe(4)], ''));
    for (const fila of tabla.filas.slice(1)) {
      expect(fila.cabecera).toBe(false);
      expect(fila.celdas.map((c) => c.negrita)).toEqual([true, false, false, false]);
    }
  });
});

describe('anchos de columna', () => {
  /**
   * Los tres invariantes que hacen que la tabla no se descuadre al pegarla:
   * suma 100 exacta (Word reparte el sobrante o recorta si no), etiqueta legible
   * y ninguna columna aplastada.
   */
  const comprobarInvariantes = (anchos: number[]) => {
    expect(anchos.reduce((a, b) => a + b, 0)).toBe(100);
    expect(anchos[0]).toBeGreaterThanOrEqual(18);
    expect(anchos[0]).toBeLessThanOrEqual(40);
    for (const ancho of anchos.slice(1)) expect(ancho).toBeGreaterThanOrEqual(6);
  };

  it.each([2, 3, 5, 8])('con %i columnas suman 100 y respetan suelos y techo', (columnas) => {
    const [tabla] = tablas(planificarDocx([tablaDe(columnas)], ''));
    expect(tabla.anchos).toHaveLength(columnas);
    comprobarInvariantes(tabla.anchos);
  });

  it('una etiqueta kilométrica no se lleva la tabla: se acota al techo', () => {
    // El caso de `cuadroHormigonMemoria`: «Recubrimiento nominal de las
    // armaduras (mm)» contra columnas de «HA-30/F/20/XC1».
    const bloque: Block = {
      kind: 'table',
      head: ['ELEMENTO ESTRUCTURAL', 'CIMENTACIÓN', 'PILARES', 'FORJADO'],
      rows: [
        ['Recubrimiento nominal de las armaduras (mm)', '35', '30', '25'],
        ['Tipificación', 'HA-30/B/20/XC2', 'HA-30/F/20/XC1', 'HA-30/F/20/XC1'],
      ],
    };
    const [tabla] = tablas(planificarDocx([bloque], ''));
    comprobarInvariantes(tabla.anchos);
    expect(tabla.anchos[0]).toBeLessThanOrEqual(40);
  });

  it('columnas de datos anchísimas no dejan la etiqueta por debajo del suelo', () => {
    // Sin suelo, un reparto proporcional puro dejaría la columna 0 en el 3 % y
    // «Elemento» saldría una letra por línea.
    const bloque: Block = {
      kind: 'table',
      head: [
        'Elemento',
        'Durabilidad natural frente a hongos, duramen (UNE-EN 350-2)',
        'Durabilidad exigida (UNE-EN 460)',
        'Impregnabilidad albura (UNE-EN 350-2)',
      ],
      rows: [['Vigas', 'Clase 2 — durable', 'Clase 3', 'Clase 2 — poco impregnable']],
    };
    const [tabla] = tablas(planificarDocx([bloque], ''));
    comprobarInvariantes(tabla.anchos);
    expect(tabla.anchos[0]).toBe(18);
  });

  it('una tabla de una sola columna se la lleva entera', () => {
    const bloque: Block = { kind: 'table', head: ['Materiales'], rows: [['Hormigón']] };
    const [tabla] = tablas(planificarDocx([bloque], ''));
    expect(tabla.anchos).toEqual([100]);
  });
});

describe('tablas anchas: se parten por columnas, nunca se giran', () => {
  /**
   * El fallo que persigue este bloque es el apaisado: una sección horizontal
   * arrastra su `<w:sectPr>` y contagia el apaisado a todo lo que va detrás en
   * la memoria del cliente. Aquí se comprueba que la salida son varias tablas
   * verticales con la etiqueta repetida.
   */
  const ancha: Block = {
    kind: 'table',
    caption: 'HA-30/B500SD',
    head: ['ELEMENTO', ...Array.from({ length: 11 }, (_, j) => `E${j + 1}`)],
    rows: [
      ['Tipificación', ...Array.from({ length: 11 }, (_, j) => `HA-3${j % 5}`)],
      ['Recubrimiento', ...Array.from({ length: 11 }, (_, j) => `${25 + j}`)],
    ],
  };

  it('una tabla de 12 columnas produce más de una tabla, ninguna de más de 8', () => {
    const trozos = tablas(planificarDocx([ancha], ''));
    expect(trozos.length).toBeGreaterThan(1);
    for (const trozo of trozos) {
      expect(trozo.filas[0].celdas.length).toBeLessThanOrEqual(MAX_COLUMNAS);
      expect(trozo.anchos).toHaveLength(trozo.filas[0].celdas.length);
      expect(trozo.anchos.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it('todos los trozos repiten la columna 0 en la misma posición y con el mismo texto', () => {
    // Si la etiqueta no viaja con cada trozo, el segundo cuadro es una parrilla
    // de valores sin saber de qué propiedad son.
    for (const trozo of tablas(planificarDocx([ancha], ''))) {
      expect(trozo.filas[0].celdas[0].texto).toBe('ELEMENTO');
      expect(trozo.filas[1].celdas[0].texto).toBe('Tipificación');
      expect(trozo.filas[2].celdas[0].texto).toBe('Recubrimiento');
      expect(trozo.filas[1].celdas[0].negrita).toBe(true);
    }
  });

  it('la unión de las columnas de datos reconstruye las 11 originales, sin perder ni repetir', () => {
    const datos = tablas(planificarDocx([ancha], '')).flatMap((t) =>
      t.filas[0].celdas.slice(1).map((c) => c.texto),
    );
    expect(datos).toEqual(Array.from({ length: 11 }, (_, j) => `E${j + 1}`));

    // Y lo mismo con los valores de una fila de datos.
    const valores = tablas(planificarDocx([ancha], '')).flatMap((t) =>
      t.filas[2].celdas.slice(1).map((c) => c.texto),
    );
    expect(valores).toEqual(Array.from({ length: 11 }, (_, j) => `${25 + j}`));
  });

  it('los trozos 2..N llevan «(cont.)» en el caption', () => {
    const trozos = tablas(planificarDocx([ancha], ''));
    expect(trozos[0].caption).toBe('HA-30/B500SD');
    for (const trozo of trozos.slice(1)) expect(trozo.caption).toBe('HA-30/B500SD (cont.)');
  });

  it('si la tabla no traía caption, los trozos tampoco se lo inventan', () => {
    const sinCaption: Block = { ...ancha, caption: undefined };
    for (const trozo of tablas(planificarDocx([sinCaption], ''))) {
      expect(trozo.caption).toBeUndefined();
    }
  });

  it('el caption no se emite como párrafo suelto: viaja dentro de la tabla', () => {
    // Suelto, un troceado lo dejaría huérfano y el renderer no sabría a qué
    // trozo pertenece.
    const plan = planificarDocx([ancha], '');
    expect(parrafos(plan)).toHaveLength(0);
  });

  it('una tabla que cabe justo en MAX_COLUMNAS no se parte', () => {
    expect(tablas(planificarDocx([tablaDe(MAX_COLUMNAS)], ''))).toHaveLength(1);
  });
});

describe('kvTable', () => {
  const kv: Block = {
    kind: 'kvTable',
    rows: [
      ['Vida útil nominal del edificio', '50 AÑOS'],
      ['Clase de Ejecución', '2'],
    ],
  };

  it('sale una tabla de 2 columnas con anchos fijos 40/60', () => {
    const [tabla] = tablas(planificarDocx([kv], ''));
    expect(tabla.anchos).toEqual([40, 60]);
    for (const fila of tabla.filas) expect(fila.celdas).toHaveLength(2);
  });

  it('NINGUNA fila es cabecera, y la celda 0 va en negrita', () => {
    // Un kvTable no tiene encabezados, tiene pares: marcar la primera fila como
    // cabecera repetiría «Vida útil nominal del edificio» arriba de cada página.
    const [tabla] = tablas(planificarDocx([kv], ''));
    expect(tabla.filas.some((f) => f.cabecera)).toBe(false);
    expect(tabla.filas.map((f) => f.celdas.map((c) => c.negrita))).toEqual([
      [true, false],
      [true, false],
    ]);
    expect(tabla.filas[0].celdas.map((c) => c.texto)).toEqual([
      'Vida útil nominal del edificio',
      '50 AÑOS',
    ]);
  });
});

describe('notas', () => {
  /**
   * `recopilarNotas()` ya prefija cada ítem con su marcador (*), (**), (***), y
   * esos marcadores están apareados con las celdas vía `notas.marca()`. Una
   * viñeta los duplicaría y una numeración los contradiría; además hay ítems sin
   * marcador (durabilidad de la madera, coeficientes de minoración) y una lista
   * mezclaría dos cosas distintas.
   */
  it('un párrafo Caption por ítem, con el texto idéntico y sin viñeta añadida', () => {
    const items = [
      '(*) Contra el terreno: 70 mm.',
      '(**) Se dispondrá hormigón hidrófugo.',
      'Aplicable a los valores característicos.',
    ];
    const plan = planificarDocx([{ kind: 'notes', items }], '');
    expect(plan.bloques).toEqual(
      items.map((texto) => ({ tipo: 'parrafo', estilo: 'Caption', texto })),
    );
  });

  it('un bloque de notas vacío no emite nada', () => {
    expect(planificarDocx([{ kind: 'notes', items: [] }], '').bloques).toEqual([]);
  });
});

describe('el texto viaja verbatim', () => {
  /**
   * ESTE es el test que impide que alguien reutilice `pdfStr()` de
   * `src/lib/pdf/utils.ts` aquí «por coherencia». Aquella función existe porque
   * las fuentes core de jsPDF sólo hablan Latin-1; un .docx es XML en UTF-8 y no
   * tiene ese problema. Aplicarla degradaría «Δcdev» a «Deltacdev» y «N/mm²» a
   * «N/mm2» en un documento normativo firmado.
   */
  const RAROS = 'Δcdev ≤ 0,8·TM en N/mm² con γc y Ø12';

  it('los símbolos normativos llegan intactos a párrafos, cabeceras y celdas', () => {
    const plan = planificarDocx(
      [
        { kind: 'heading', level: 2, text: RAROS },
        { kind: 'paragraph', text: RAROS },
        { kind: 'table', head: ['Materiales', RAROS], rows: [['Hormigón', RAROS]] },
        { kind: 'kvTable', rows: [['γs', RAROS]] },
        { kind: 'notes', items: [RAROS] },
      ],
      RAROS,
    );

    const textos = plan.bloques.flatMap((b) =>
      b.tipo === 'parrafo' ? [b.texto] : b.filas.flatMap((f) => f.celdas.map((c) => c.texto)),
    );
    // Nada de Delta, Sum, ^2 ni interrogantes: el texto original, letra a letra.
    expect(textos.filter((t) => t === RAROS)).toHaveLength(7);
    expect(textos.join('')).not.toMatch(/Delta|Sum|\^2/);
    expect(plan.titulo).toBe(RAROS);
  });

  it('el espacio inicial de « (*)» no se recorta', () => {
    // `notas.marca()` devuelve `" (*)"` con espacio delante: pegado al valor de
    // la celda es lo que aparea la nota con el número. Un trim lo rompe.
    const plan = planificarDocx(
      [{ kind: 'table', head: ['Localización', ' (*)'], rows: [['Zapatas', '35 mm (**) ']] }],
      '',
    );
    const [tabla] = tablas(plan);
    expect(tabla.filas[0].celdas[1].texto).toBe(' (*)');
    expect(tabla.filas[1].celdas[1].texto).toBe('35 mm (**) ');
  });
});

describe('título del documento', () => {
  it('un título con texto abre el plan como Heading1', () => {
    const plan = planificarDocx([{ kind: 'paragraph', text: 'x' }], '  Cuadro de materiales  ');
    expect(plan.bloques[0]).toEqual({
      tipo: 'parrafo',
      estilo: 'Heading1',
      texto: 'Cuadro de materiales',
    });
    expect(plan.titulo).toBe('Cuadro de materiales');
  });

  it.each(['', '   ', '\n\t'])(
    'un título vacío (%j) no emite un Heading1 en blanco',
    (titulo) => {
      // Un Heading1 vacío sale en el índice automático de Word como una entrada
      // sin texto: peor que no tener título.
      const plan = planificarDocx([{ kind: 'paragraph', text: 'x' }], titulo);
      expect(plan.titulo).toBe('');
      expect(plan.bloques[0]).toEqual({ tipo: 'parrafo', estilo: 'Normal', texto: 'x' });
      expect(plan.bloques.some((b) => b.tipo === 'parrafo' && b.estilo === 'Heading1')).toBe(false);
    },
  );
});

describe('integración con los cuadros reales', () => {
  /**
   * Con bloques inventados se puede demostrar cualquier cosa. Estos dos cuadros
   * salen de `cuadros.ts` con datos de obra y tienen que atravesar el
   * planificador enteros.
   */
  it('el cuadro de coeficientes de minoración sale con su título, su tabla y sus notas', () => {
    const blocks = cuadroCoeficientesMinoracion(
      { maderaLaminada: true, aceroDeArmar: true, hormigon: true },
      30,
    );
    const plan = planificarDocx(blocks, 'Coeficientes');

    expect(plan.bloques[0]).toEqual({
      tipo: 'parrafo',
      estilo: 'Heading1',
      texto: 'Coeficientes',
    });
    expect(plan.bloques[1]).toEqual({
      tipo: 'parrafo',
      estilo: 'Heading2',
      texto: 'COEFICIENTES DE MINORACIÓN',
    });

    const [tabla] = tablas(plan);
    expect(tabla.filas[0].celdas.map((c) => c.texto)).toEqual([
      'Materiales',
      'Ordinaria',
      'Incendio',
    ]);
    // Tres materiales presentes → tres filas de datos bajo la cabecera.
    expect(tabla.filas).toHaveLength(4);
    expect(tabla.anchos.reduce((a, b) => a + b, 0)).toBe(100);

    // Las dos notas, en Caption y con la resistencia al fuego declarada.
    const captions = parrafos(plan).filter((p) => p.estilo === 'Caption');
    expect(captions.map((p) => p.texto)).toEqual([
      'Aplicable a los valores característicos.',
      'La estructura será R30 acorde al CTE DB SI.',
    ]);
  });

  it('el cuadro de aceros cabe en MAX_COLUMNAS y no se parte', () => {
    const blocks = cuadroAceros({
      aceroPasivo: 'B500SD',
      malla: 'ME-500 T',
      aceroEstructural: 'S275JR',
    });
    const plan = planificarDocx(blocks, '');
    const cuadros = tablas(plan);

    expect(cuadros).toHaveLength(1);
    expect(cuadros[0].filas).toHaveLength(4); // cabecera + corrugado + mallazo + estructural
    expect(cuadros[0].anchos).toHaveLength(5);
    expect(cuadros[0].anchos.reduce((a, b) => a + b, 0)).toBe(100);
    // La «γs» de la última columna llega sin traducir.
    expect(cuadros[0].filas[0].celdas[4].texto).toBe('γs');
  });
});
