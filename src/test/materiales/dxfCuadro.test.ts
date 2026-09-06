/**
 * El cuadro dibujado: geometría y fichero DXF.
 *
 * Un DXF mal formado no da error: el CAD abre un dibujo vacío y se queda tan
 * ancho. Por eso lo que se prueba aquí no es que el fichero «parezca» un DXF,
 * sino las invariantes que lo hacen legible — pares código/valor completos,
 * códigos numéricos, capas declaradas antes de usarse — y las de la maqueta,
 * que no lanzan ninguna excepción y sólo se notan cuando el cuadro llega feo
 * al plano.
 */

import { describe, it, expect } from 'vitest';
import type { Block } from '../../lib/materiales/cuadros';
import { cuadroCoeficientesMinoracion } from '../../lib/materiales/cuadros';
import { COLOR_DE_CAPA, envolver, planificarDibujo } from '../../lib/dxf/cuadro';
import { anchoDeTexto } from '../../lib/dxf/anchos';
import { aLatin1, dxfStr, escribirDxf } from '../../lib/dxf/escribir';

const TABLA: Block = {
  kind: 'table',
  head: ['Localización', 'Tipificación', 'Mín. contenido de cemento'],
  rows: [
    ['Cimentación', 'HA-30/B/20/XC2', '275 kg'],
    ['Forjados', 'HA-30/F/20/XC1', '275 kg'],
  ],
};

const CUADRO: Block[] = [{ kind: 'heading', level: 2, text: 'HORMIGÓN' }, TABLA];

const pares = (dxf: string) => {
  const L = dxf.split('\r\n');
  L.pop(); // el fichero termina en salto
  return L;
};

describe('anchoDeTexto', () => {
  it('mide de verdad: una «W» no ocupa lo mismo que una «i»', () => {
    // Contar caracteres es lo que sacó el cuadro con los textos pisandose.
    expect(anchoDeTexto('W', 1)).toBeGreaterThan(anchoDeTexto('i', 1) * 3);
  });

  it('la altura de AutoCAD es la de una MAYÚSCULA, no el cuerpo de la fuente', () => {
    // En Arial la mayúscula mide 0,716 del cuerpo, así que los avances salen
    // ~1,4 veces los del cuerpo: por encima de 0,6 por carácter, no por debajo.
    const t = 'HA-30/B/20/XC2';
    expect(anchoDeTexto(t, 1) / t.length).toBeGreaterThan(0.7);
  });

  it('es aditivo y proporcional a la altura', () => {
    expect(anchoDeTexto('abc', 2)).toBeCloseTo(anchoDeTexto('abc', 1) * 2, 9);
    expect(anchoDeTexto('ab', 1) + anchoDeTexto('c', 1)).toBeCloseTo(anchoDeTexto('abc', 1), 9);
  });
});

describe('envolver', () => {
  it('corta por espacios y respeta el ancho medido', () => {
    const ancho = anchoDeTexto('Mín. contenido', 1);
    expect(envolver('Mín. contenido de cemento', ancho, 1)).toEqual([
      'Mín. contenido',
      'de cemento',
    ]);
  });

  it('no parte una palabra más larga que el hueco', () => {
    // Las palabras largas de un cuadro son designaciones normativas: partir
    // «HL(HM)-20/B/30/X0» la deja irreconocible, y sobresalir es menos malo.
    expect(envolver('HL(HM)-20/B/30/X0', 1, 1)).toEqual(['HL(HM)-20/B/30/X0']);
  });

  it('un texto vacío da una línea vacía, no cero líneas', () => {
    expect(envolver('   ', 10, 1)).toEqual(['']);
  });
});

describe('geometría del cuadro', () => {
  it('todo se escala con la altura del texto', () => {
    const a = planificarDibujo(CUADRO, { altura: 0.0025 });
    const b = planificarDibujo(CUADRO, { altura: 0.005 });
    expect(b.ancho).toBeCloseTo(a.ancho * 2, 9);
    expect(b.alto).toBeCloseTo(a.alto * 2, 9);
  });

  it('la tabla cierra: hay tantas horizontales como filas + 1', () => {
    const d = planificarDibujo([TABLA]);
    const horizontales = d.entidades.filter((e) => e.tipo === 'linea' && e.y1 === e.y2);
    const verticales = d.entidades.filter((e) => e.tipo === 'linea' && e.x1 === e.x2);
    expect(horizontales).toHaveLength(2 + 2); // cabecera + 2 filas + cierre
    expect(verticales).toHaveLength(4); // 3 columnas + 1
  });

  it('un kvTable no lleva banda de cabecera: sus etiquetas ya van a la izquierda', () => {
    // Dibujarla dejaba un recuadro vacío colgando encima de la primera fila.
    // Se ve en el bloque de VIENTO del cuadro de acciones de Cargas por planta
    // y en el de vida útil del cuadro de materiales.
    const filas: [string, string][] = [
      ['Zona eólica', 'A (velocidad básica 26 m/s)'],
      ['Grado de aspereza', 'IV (zona urbana)'],
    ];
    const d = planificarDibujo([{ kind: 'kvTable', rows: filas }]);
    const horizontales = d.entidades.filter((e) => e.tipo === 'linea' && e.y1 === e.y2);
    expect(horizontales).toHaveLength(3); // 2 filas + cierre, sin banda
    // Ni un texto en la capa de las cabeceras: no hay ninguna que rotular.
    expect(d.entidades.some((e) => e.tipo === 'texto' && e.capa === 'CUADRO-TITULO')).toBe(false);
    // Y el mismo contenido con cabecera de verdad ocupa más alto: la banda.
    const conBanda = planificarDibujo([{ kind: 'table', head: ['Acción', 'Valor'], rows: filas }]);
    expect(conBanda.alto).toBeGreaterThan(d.alto);
  });

  it('el rótulo va pegado a su tabla, no flotando', () => {
    // Sin esto el rótulo separaba y la tabla volvía a separar: el cuadro salía
    // con el título lejos de lo que titula.
    const conRotulo = planificarDibujo(CUADRO);
    const suelta = planificarDibujo([TABLA]);
    const rotulo = conRotulo.entidades.find((e) => e.tipo === 'texto')!;
    expect(rotulo.tipo === 'texto' && rotulo.texto).toBe('HORMIGÓN');
    // El alto de más que trae el rótulo es el suyo, no el suyo más un hueco.
    expect(conRotulo.alto - suelta.alto).toBeLessThan(0.0025 * 4);
  });

  it('los rótulos y las cabeceras van en la capa roja y los datos en la de texto', () => {
    const d = planificarDibujo(CUADRO);
    const capaDe = (t: string) => {
      const e = d.entidades.find((x) => x.tipo === 'texto' && x.texto === t);
      return e && e.tipo === 'texto' ? e.capa : undefined;
    };
    expect(capaDe('HORMIGÓN')).toBe('CUADRO-TITULO');
    expect(capaDe('Localización')).toBe('CUADRO-TITULO');
    expect(capaDe('Cimentación')).toBe('CUADRO-TEXTO');
    expect(COLOR_DE_CAPA['CUADRO-TITULO']).toBe(1); // rojo, como el cuadro del estudio
  });

  it('la etiqueta va a la izquierda y los valores centrados', () => {
    const d = planificarDibujo([TABLA]);
    const texto = (t: string) => d.entidades.find((e) => e.tipo === 'texto' && e.texto === t);
    const etiqueta = texto('Cimentación');
    const valor = texto('HA-30/B/20/XC2');
    expect(etiqueta?.tipo === 'texto' && etiqueta.centrado).toBe(false);
    expect(valor?.tipo === 'texto' && valor.centrado).toBe(true);
  });

  it('una cabecera larga se envuelve en vez de ensanchar su columna', () => {
    const estrecha = planificarDibujo([
      { kind: 'table', head: ['A', 'Mín. contenido de cemento'], rows: [['x', '275 kg']] },
    ]);
    const ancha = planificarDibujo([
      { kind: 'table', head: ['A', 'B'], rows: [['x', 'Mín. contenido de cemento']] },
    ]);
    // El mismo texto pesa MENOS en la cabecera que en un dato, porque envuelve.
    expect(estrecha.ancho).toBeLessThan(ancha.ancho);
    const lineas = estrecha.entidades.filter(
      (e) => e.tipo === 'texto' && e.texto.startsWith('Mín.'),
    );
    expect(lineas.length).toBeGreaterThan(0);
  });

  it('las notas se envuelven al ancho del cuadro y no lo desbordan', () => {
    const larga = 'x '.repeat(300).trim();
    const d = planificarDibujo([TABLA, { kind: 'notes', items: [larga] }]);
    const notas = d.entidades.filter((e) => e.tipo === 'texto' && e.texto.startsWith('x x'));
    expect(notas.length).toBeGreaterThan(3);
    for (const n of notas) {
      if (n.tipo === 'texto') expect(anchoDeTexto(n.texto, 0.0025)).toBeLessThanOrEqual(d.ancho);
    }
  });

  it('NINGÚN texto se sale de su celda', () => {
    // Es el fallo que llegó al plano: «HA-30/B/20/XC2» dibujado encima de
    // «20,0 N/mm²». Salió de estimar el ancho por número de caracteres y de no
    // saber que la altura de un TEXT de CAD es la de una MAYÚSCULA. Este test
    // recorre el cuadro entero y comprueba, celda a celda, que el texto cabe.
    const h = 0.0025;
    const d = planificarDibujo(
      [
        { kind: 'heading', level: 2, text: 'HORMIGÓN (CÓDIGO ESTRUCTURAL)' },
        {
          kind: 'table',
          head: [
            'Localización',
            'Tipificación',
            'Resistencia de cálculo',
            'Mín. contenido de cemento',
            'Valor nominal recubrimientos',
            'Nivel de control',
          ],
          rows: [
            ['Cimentación', 'HA-30/B/20/XC2', '20,0 N/mm²', '275 kg', '30 mm (*)', 'Estadístico'],
            ['Hormigón de limpieza', 'HL-150/B/20', '-', '-', '-', 'Según capítulos 13 y 14'],
          ],
        },
        ...cuadroCoeficientesMinoracion({ hormigon: true, aceroDeArmar: true }, 30),
      ],
      { altura: h },
    );

    const verticales = d.entidades.filter((e) => e.tipo === 'linea' && e.x1 === e.x2);
    const textos = d.entidades.filter((e) => e.tipo === 'texto');
    let comprobados = 0;

    for (const t of textos) {
      if (t.tipo !== 'texto') continue;
      // Los bordes de la tabla en la que cae este texto.
      const bordes = [
        ...new Set(
          verticales
            .filter((v) => v.tipo === 'linea' && v.y1 >= t.y && v.y2 <= t.y)
            .map((v) => (v.tipo === 'linea' ? v.x1 : 0)),
        ),
      ].sort((a, b) => a - b);
      if (bordes.length < 2) continue; // rótulos y notas: fuera de tabla

      const ancho = anchoDeTexto(t.texto, t.altura);
      const izq = t.centrado ? t.x - ancho / 2 : t.x;
      const der = izq + ancho;
      const bordeIzq = [...bordes].reverse().find((b) => b <= t.x + 1e-9)!;
      const bordeDer = bordes.find((b) => b > t.x + 1e-9)!;
      // 1e-9 de tolerancia: los bordes se acumulan sumando reales.
      expect(izq, `«${t.texto}» se sale por la izquierda`).toBeGreaterThanOrEqual(bordeIzq - 1e-9);
      expect(der, `«${t.texto}» se sale por la derecha`).toBeLessThanOrEqual(bordeDer + 1e-9);
      comprobados++;
    }
    expect(comprobados).toBeGreaterThan(20);
  });

  it('sin bloques no dibuja nada', () => {
    expect(planificarDibujo([]).entidades).toEqual([]);
  });
});

describe('dxfStr', () => {
  it('mapea las griegas a la letra que la fuente Symbol dibuja como esa griega', () => {
    // No es `pdfStr`: allí γ va a «g» pero Δ a «Delta», que en un cuadro de
    // plano no cabe. Aquí «Δcdev» sale «Dcdev», que es la abreviatura de obra.
    expect(dxfStr('γc')).toBe('gc');
    expect(dxfStr('γs')).toBe('gs');
    expect(dxfStr('Δcdev')).toBe('Dcdev');
    expect(dxfStr('α6')).toBe('a6');
    expect(dxfStr('σsd')).toBe('ssd');
  });

  it('los matemáticos van a su equivalente en ASCII', () => {
    expect(dxfStr('h ≤ 250 mm')).toBe('h <= 250 mm');
    expect(dxfStr('h ≥ 250')).toBe('h >= 250');
  });

  it('preserva lo que cp1252 SÍ sabe escribir', () => {
    // Ø, ², · y ° están en la tabla y son justo lo que un cuadro necesita.
    expect(dxfStr('Ø12 · 20,0 N/mm² a 45° en Cimentación de Málaga')).toBe(
      'Ø12 · 20,0 N/mm² a 45° en Cimentación de Málaga',
    );
  });

  it('tira lo que seguiría fuera de cp1252, en vez de inventar un byte', () => {
    expect(dxfStr('a中b')).toBe('ab');
    for (const c of dxfStr('γ Δ ≤ — “x” … ⁴ ₂ ∞')) {
      expect(c.charCodeAt(0)).toBeLessThan(256);
    }
  });
});

describe('el fichero DXF', () => {
  const dxf = () => escribirDxf(planificarDibujo(CUADRO));

  it('son pares código/valor, todos completos y con el código numérico', () => {
    // Un salto de línea de más y el CAD abre un dibujo vacío sin decir por qué.
    const L = pares(dxf());
    expect(L.length % 2).toBe(0);
    for (let i = 0; i < L.length; i += 2) expect(L[i]).toMatch(/^-?\d+$/);
  });

  it('trae las secciones de un R12 y cierra en EOF', () => {
    const L = pares(dxf());
    const secciones = L.map((v, i) => (L[i - 1] === '2' && L[i - 2] === 'SECTION' ? v : null));
    expect(secciones).toContain('HEADER');
    expect(secciones).toContain('TABLES');
    expect(secciones).toContain('ENTITIES');
    expect(L.slice(-2)).toEqual(['0', 'EOF']);
  });

  it('declara la versión y la tabla de caracteres', () => {
    // Sin $DWGCODEPAGE los acentos salen como símbolos.
    const d = dxf();
    expect(d).toContain('AC1009');
    expect(d).toContain('ANSI_1252');
  });

  it('declara toda capa que use, con su color', () => {
    const d = dxf();
    const usadas = [...d.matchAll(/\r\n8\r\n(CUADRO-[A-Z]+)\r\n/g)].map((m) => m[1]);
    expect(new Set(usadas).size).toBeGreaterThan(1);
    for (const capa of new Set(usadas)) {
      expect(d).toContain(`\r\n2\r\n${capa}\r\n70\r\n0\r\n62\r\n${COLOR_DE_CAPA[capa as never]}`);
    }
  });

  it('el texto centrado lleva su código de justificación y su punto', () => {
    // Sin el 11/21 el CAD ignora el 72 y todo sale alineado a la izquierda.
    const d = dxf();
    expect(d).toMatch(/\r\n72\r\n1\r\n11\r\n/);
  });

  it('el fichero sale en cp1252, un carácter un byte', () => {
    const bytes = aLatin1(escribirDxf(planificarDibujo([TABLA])));
    expect(bytes.every((b) => b <= 0xff)).toBe(true);
    // «Cimentación» con su acento, en un solo byte (0xF3 = ó).
    expect([...bytes]).toContain(0xf3);
  });

  it('no revienta con los bloques reales del módulo', () => {
    const bloques = cuadroCoeficientesMinoracion({ hormigon: true, aceroDeArmar: true }, 30);
    const d = escribirDxf(planificarDibujo(bloques));
    expect(d).toContain('R30');
    expect(pares(d).length % 2).toBe(0);
  });
});
