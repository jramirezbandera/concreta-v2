/**
 * La plantilla de la ficha DB SE, cotejada con las fichas del estudio.
 *
 * `lib/memoria/plantilla.ts` transcribe a mano los textos fijos de la ficha
 * colegial (JS-662) y de la ficha corta del estudio. Aquí se comprueba que la
 * transcripción es LITERAL contra `fixtures/dbse-plantilla.json`, el volcado de
 * los dos .docx que hace `scripts/extract-dbse-plantilla.py`.
 *
 * Todo lo que la plantilla dice distinto de las fichas está declarado en este
 * fichero, y sólo aquí: en `CORRECCIONES` lo que se enmienda (la EFHE derogada,
 * la «Instrucción CE», una numeración errada) y en `REDACTADOS` lo que se
 * escribe nuevo (fórmulas que eran objetos OLE, casillas convertidas en frases,
 * los apartados de fábrica y madera). Un texto que no esté en las fichas ni en
 * esas dos listas es un error de transcripción, y el test lo dice.
 *
 * Y dos guardias que no son de transcripción: ningún carácter sin glifo en la
 * fuente de los PDF (saldría INVISIBLE, no como interrogante), y ningún dato
 * de la obra de ejemplo —Madrid, Sevilla, la empresa geotécnica— colado en el
 * texto fijo, que es exactamente el dato fantasma que este módulo existe para
 * impedir.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as plantilla from '../../lib/memoria/plantilla';
import { tieneGlifo } from '../../lib/pdf/utils';

type Bloque = { tipo: 'p'; texto: string } | { tipo: 'tabla'; filas: string[][] };
interface Fixture {
  [doc: string]: { fichero: string; bloques: Bloque[] };
}

const fixture: Fixture = JSON.parse(readFileSync(join('src', 'test', 'fixtures', 'dbse-plantilla.json'), 'utf8'));

/** Espacios y saltos de línea reducidos a uno: las celdas del Word llevan líneas, la plantilla frases. */
const compacto = (t: string) => t.replace(/\s+/g, ' ').trim();

/**
 * Lo que la plantilla ENMIENDA de las fichas: se aplica sobre el texto de la
 * fixture antes de comparar, así cada enmienda queda escrita aquí y no puede
 * colarse otra sin declararla.
 */
const CORRECCIONES: [string, string][] = [
  // La EHE/«Instrucción» está derogada por el Código Estructural.
  ['en la Instrucción CE.', 'en el Código Estructural.'],
  ['justificación de la CE.', 'justificación del Código Estructural.'],
  ['tabla 3.1 y CE,', 'tabla 3.1 y el Código Estructural,'],
  // Errata de numeración de la JS-662: materiales es el 3.1.5.4, no el 3.1.1.5.
  ['3.1.1.5. Características de los materiales:', '3.1.5.4. Características de los materiales:'],
  // La ficha corta escribe la delta como ∆ (U+2206), que la fuente no tiene.
  ['∆', 'Δ'],
];

/** Un texto de las fichas, compactado y con las enmiendas aplicadas. */
function corregir(t: string): string {
  let c = compacto(t);
  for (const [de, a] of CORRECCIONES) c = c.split(de).join(a);
  return c;
}

/** Cada párrafo, cada celda (líneas unidas) y cada línea de celda, ya corregidos. */
function corpus(): string[] {
  const out: string[] = [];
  const meter = (t: string) => {
    const c = corregir(t);
    if (c) out.push(c);
  };
  for (const doc of Object.values(fixture)) {
    for (const b of doc.bloques) {
      if (b.tipo === 'p') meter(b.texto);
      else {
        for (const fila of b.filas) {
          for (const celda of fila) {
            meter(celda);
            for (const linea of celda.split('\n')) meter(linea);
          }
        }
      }
    }
  }
  return out;
}

const CORPUS = corpus();
const estaEnLasFichas = (texto: string) => {
  const t = compacto(texto);
  return CORPUS.some((c) => c.includes(t));
};

/** Recorre la plantilla y devuelve cada cadena con su ruta. Las funciones (frases con hueco) se saltan. */
function textos(valor: unknown, ruta: string): { ruta: string; texto: string }[] {
  if (typeof valor === 'string') return [{ ruta, texto: valor }];
  if (typeof valor === 'function' || valor === null || typeof valor !== 'object') return [];
  return Object.entries(valor as Record<string, unknown>).flatMap(([k, v]) => textos(v, `${ruta}.${k}`));
}

const TODOS = Object.entries(plantilla).flatMap(([nombre, valor]) => textos(valor, nombre));

/** Por debajo de esto un texto es un rótulo; los rótulos se cotejan aparte, por lista. */
const LARGO_MINIMO = 40;

/**
 * Lo que la plantilla REDACTA y no está en ninguna ficha, con su motivo. Un
 * texto de esta lista que SÍ aparezca en las fichas también falla: la lista
 * tiene que ser exacta en los dos sentidos.
 */
const REDACTADOS: Record<string, string> = {
  [plantilla.CE.titulo]: 'numeración y las cuatro líneas del encabezado unidas en una',
  [plantilla.CE.subtitulo]: 'ídem',
  [plantilla.CE.coeficientes.titulo]: 'numeración añadida (3.1.5.5)',
  [plantilla.CE.cargas.combinaciones.texto]: 'dos líneas de una celda, unidas con barra',
  [plantilla.CE.cargas.termicas.conJuntas('una junta', '40')]: 'frase con hueco',
  [plantilla.CE.cargas.termicas.sinJuntas]: 'rama sin juntas: la JS-662 la deja en casillas sin marcar',
  [plantilla.CE.cargas.termicas.sinJuntasNiTermicas]: 'ídem',
  [plantilla.NCSE.textos.medidas]: 'cuatro líneas de una celda, unidas con punto',
  [plantilla.NCSE.textos.rhoEspecial]: 'la ficha del estudio sólo tiene la rama de importancia normal',
  [plantilla.FORJADOS.intro]: 'sustituye al RD 642/2002 (EFHE), derogado por el Código Estructural',
  [plantilla.FORJADOS.unidireccional.observaciones]: 'sin la comprobación por canto mínimo de la EFHE (art. 15.2.2)',
  [plantilla.FORJADOS.reticular.unidades]: 'una sola redacción para casetón perdido y recuperable',
  [plantilla.SEA.bases.criterios.manual]: 'la casilla «Manualmente» convertida en frase',
  [plantilla.SEA.bases.modelado.pilaresYVigas]: 'la casilla «la estructura está formada por pilares y vigas» convertida en frase',
  [plantilla.SEA.bases.modelado.termicasSi]: 'la pregunta «¿Se han tenido en cuenta…?» contestada',
  [plantilla.SEA.bases.modelado.termicasNo]: 'ídem',
  [plantilla.SEA.bases.elu.leyendaEstabilidad]: 'la fórmula era un objeto OLE; va como texto',
  [plantilla.SEA.bases.elu.leyendaResistencia]: 'ídem',
  [plantilla.SEA.bases.elu.segundoOrden]: 'ídem («Al evaluar Ed y Rd»)',
  [plantilla.SEA.bases.els.leyenda]: 'ídem',
  [plantilla.SEA.materiales.tabla41.caption]: 'rótulo de la tabla, que la JS-662 no titula',
  [plantilla.SEA.elu.secciones.items[4]]: 'tres viñetas anidadas en una línea',
  [plantilla.SEA.elu.barras.items[3]]: 'dos viñetas anidadas en una línea',
  [plantilla.TITULO_FORJADO.solera]: 'tipología de Cargas por planta sin ficha colegial',
  [plantilla.TITULO_FORJADO.chapa]: 'ídem',
  [plantilla.TITULO_FORJADO.madera]: 'ídem',
  [plantilla.TITULO_FORJADO.otro]: 'ídem',
  [plantilla.TIPO_ESTRUCTURA_SISMO['porticos-ha-pantallas']]: 'sistema del módulo de sismo',
  [plantilla.TIPO_ESTRUCTURA_SISMO['acero-triangulado']]: 'ídem',
};

/** Apartados escritos de cero: ninguna ficha del estudio los desarrolla. */
const APARTADOS_NUEVOS = ['SEF.', 'SEM.'];

describe('transcripción literal de las fichas del estudio', () => {
  const largos = TODOS.filter((t) => t.texto.length >= LARGO_MINIMO && !APARTADOS_NUEVOS.some((p) => t.ruta.startsWith(p)));

  it('hay plantilla que cotejar', () => {
    expect(largos.length).toBeGreaterThan(60);
    expect(CORPUS.length).toBeGreaterThan(300);
  });

  it.each(largos.map((t) => [t.ruta, t.texto] as const))('%s', (_ruta, texto) => {
    if (texto in REDACTADOS) {
      // Redactado a propósito: entonces NO puede estar en las fichas, o la lista miente.
      expect(estaEnLasFichas(texto), `«${texto.slice(0, 60)}…» está en las fichas: sobra en REDACTADOS`).toBe(false);
    } else {
      expect(estaEnLasFichas(texto), `no está en las fichas ni en REDACTADOS: «${texto.slice(0, 90)}…»`).toBe(true);
    }
  });

  it('los rótulos de la tabla sísmica son los de la ficha del estudio, en su orden', () => {
    const corta = fixture.corta.bloques.find((b): b is Extract<Bloque, { tipo: 'tabla' }> => b.tipo === 'tabla' && b.filas.length > 20)!;
    const rotulosFicha = corta.filas.map((f) => corregir(f[0])).filter(Boolean);
    const rotulosPlantilla = Object.values(plantilla.NCSE.rotulos).map(compacto);
    // Todos los de la ficha están, y en el mismo orden (Observaciones es de la rama exenta, va aparte).
    const enPlantilla = rotulosFicha.map((r) => rotulosPlantilla.indexOf(r));
    expect(enPlantilla.every((i) => i >= 0), `faltan: ${rotulosFicha.filter((r) => !rotulosPlantilla.includes(r)).join(' | ')}`).toBe(true);
    expect(enPlantilla).toEqual([...enPlantilla].sort((a, b) => a - b));
    expect(rotulosFicha).toHaveLength(16);
  });

  it('los rótulos cortos que estructuran la ficha están en ella', () => {
    const rotulos = [
      plantilla.SE.bloque,
      plantilla.SE.proceso.rotulo,
      plantilla.SE.situaciones.rotulo,
      plantilla.SE.periodoServicio.rotulo,
      plantilla.SE.metodo.rotulo,
      plantilla.SE.definicion.rotulo,
      plantilla.SE.elu.rotulo,
      plantilla.SE.els.rotulo,
      plantilla.SE.acciones.rotulo,
      plantilla.SE.acciones.modelo.rotulo,
      plantilla.SE.estabilidad.rotulo,
      plantilla.SE.resistencia.rotulo,
      plantilla.SE.combinacion.rotulo,
      plantilla.SE.aptitud.rotulo,
      plantilla.SE.flechas.rotulo,
      plantilla.SE.desplome.rotulo,
      plantilla.SEAE.niveles.titulo,
      plantilla.SEC.bases.bloque,
      plantilla.SEC.geotecnia.bloque,
      ...Object.values(plantilla.SEC.geotecnia.rotulos),
      ...Object.values(plantilla.SEC.geotecnia.parametros.filas),
      plantilla.SEC.cimentacion.bloque,
      plantilla.SEC.contenciones.bloque,
      ...Object.values(plantilla.SEC.cimentacion.rotulos),
      plantilla.CE.estructura.rotulo,
      ...Object.values(plantilla.CE.programa.rotulos),
      ...Object.values(plantilla.CE.memoriaCalculo.rotulos),
      ...plantilla.CE.memoriaCalculo.cabeceraFlechas,
      plantilla.CE.cargas.verticales.bloque,
      plantilla.CE.cargas.cerramientos,
      plantilla.CE.cargas.barandillas.rotulo,
      plantilla.CE.cargas.viento.rotulo,
      plantilla.CE.cargas.termicas.rotulo,
      plantilla.CE.cargas.terreno.rotulo,
      plantilla.CE.durabilidad.exigidos.rotulo,
      plantilla.CE.durabilidad.recubrimientos.rotulo,
      plantilla.CE.durabilidad.cementoMin.rotulo,
      plantilla.CE.durabilidad.cementoMax.rotulo,
      plantilla.CE.durabilidad.resistenciaMin.rotulo,
      plantilla.CE.durabilidad.agua.rotulo,
      plantilla.FORJADOS.rotulos.material,
      plantilla.FORJADOS.rotulos.dimensiones,
      plantilla.FORJADOS.rotulos.cantoTotal,
      plantilla.FORJADOS.rotulos.intereje,
      plantilla.FORJADOS.rotulos.anchoNervio,
      plantilla.SEA.bases.criterios.bloque,
      plantilla.SEA.bases.modelado.bloque,
      plantilla.SEA.bases.elu.bloque,
      plantilla.SEA.bases.els.bloque,
      plantilla.SEA.bases.geometria.bloque,
      plantilla.SEA.materiales.rotulo,
      ...plantilla.SE.proceso.pasos,
      ...plantilla.SE.elu.items,
      ...plantilla.SE.els.items,
    ];
    const ausentes = rotulos.filter((r) => !estaEnLasFichas(r));
    expect(ausentes, ausentes.join(' | ')).toEqual([]);
  });
});

describe('lo que no puede haber en la plantilla', () => {
  /** Los caracteres de espacio, que no tienen glifo pero tampoco lo necesitan. */
  const esEspacio = (cp: number) => cp === 0x20 || cp === 0xa0;

  it('todo carácter tiene glifo en la fuente de los PDF', () => {
    const sinGlifo = new Map<string, string>();
    for (const { ruta, texto } of TODOS) {
      for (const ch of texto) {
        const cp = ch.codePointAt(0)!;
        if (!esEspacio(cp) && !tieneGlifo(cp)) sinGlifo.set(`${ch} (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`, ruta);
      }
    }
    expect([...sinGlifo.entries()].map(([c, r]) => `${c} en ${r}`)).toEqual([]);
  });

  it('ni restos del volcado, ni tabuladores, ni dobles espacios', () => {
    for (const { ruta, texto } of TODOS) {
      for (const malo of ['£', '∆', '[OLE]', '[sym', '\t', '  ', '[x]', '[ ]']) {
        expect(texto.includes(malo), `«${malo}» en ${ruta}`).toBe(false);
      }
    }
  });

  it('las fórmulas van con el símbolo, no con «<=»', () => {
    for (const f of Object.values(plantilla.FORMULAS)) {
      expect(f).toContain('≤');
      expect(f).not.toContain('<=');
    }
  });

  it('ningún dato de la obra de ejemplo se ha colado en el texto fijo', () => {
    // «Madrid está en zona A» en la ficha de Sevilla es el dato fantasma que
    // este módulo existe para impedir; la plantilla no puede llevarlo dentro.
    const PROHIBIDOS = ['Madrid', 'Sevilla', 'Málaga', 'Granada', 'Elabora', 'Entrenúcleos', 'JS-662', '0.07', '0,08'];
    for (const { ruta, texto } of TODOS) {
      for (const p of PROHIBIDOS) expect(texto.includes(p), `«${p}» en ${ruta}`).toBe(false);
    }
  });

  it('las frases con hueco lo rellenan y no dejan el hueco vacío', () => {
    expect(plantilla.SEAE.variables.climaticas.viento.zona('Málaga', 'A', '26')).toBe(
      'Málaga está en zona A, con lo que v=26 m/s, correspondiente a un periodo de retorno de 50 años.',
    );
    expect(plantilla.NCSE.textos.ab('0,07')).toBe('ab=0,07 g, (siendo g la aceleración de la gravedad)');
    expect(plantilla.SE.flechas.texto('1/500')).toContain('1/500 de la luz');
    expect(plantilla.CE.memoriaCalculo.redistribucion(15)).toContain('hasta un 15% de momentos negativos');
  });
});
