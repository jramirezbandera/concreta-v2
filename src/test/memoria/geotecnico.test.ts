/**
 * «Leer el PDF del geotécnico», lo puro: el schema vale para los tres
 * proveedores, la selección de páginas cuando el informe no cabe, el parseo
 * defensivo de la respuesta, el volcado al estado como propuesta con su
 * fuente, y que la fuente sobrevive a guardar y llega a la ficha.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { leerSobres } from '../../features/memoria-dbse/sobres';
import { textoDeItems } from '../../lib/ai/pdfPrep';
import { exceedsAnthropicUnionLimit, toAnthropicSchema, toOpenAiSchema } from '../../lib/ai/providers/schemaConvert';
import { evaluar } from '../../lib/memoria/ensamblar';
import { confirmar, estadoPorDefecto, GEOTECNIA_CAMPOS, normalizar, duplicarFicha, proponer, teclear } from '../../lib/memoria/estado';
import {
  aplicarExtraccion,
  CLAVES_GEOTECNICO,
  construirPeticion,
  esEscaneado,
  fuenteDe,
  GEOTECNICO_PAYLOAD_SCHEMA,
  GEOTECNICO_PROMPT,
  GEOTECNICO_SCHEMA,
  paginasEscaneado,
  parseExtraccion,
  PRIMERAS,
  seleccionarTexto,
  type ExtraccionGeotecnico,
} from '../../lib/memoria/geotecnico';

beforeEach(() => {
  localStorage.clear();
});

/** Una extracción con todo vacío, para rellenar lo que cada test quiera. */
function extraccion(datos: Partial<Record<(typeof CLAVES_GEOTECNICO)[number], { texto: string; pagina: number }>>, avisos: string[] = []): ExtraccionGeotecnico {
  return {
    datos: Object.fromEntries(CLAVES_GEOTECNICO.map((k) => [k, datos[k] ?? { texto: '', pagina: 0 }])) as ExtraccionGeotecnico['datos'],
    avisos,
  };
}

describe('campos y schema', () => {
  it('cubre los doce campos de la geotecnia y la cimentación', () => {
    for (const k of GEOTECNIA_CAMPOS) expect(CLAVES_GEOTECNICO).toContain(k);
    expect(CLAVES_GEOTECNICO).toContain('cimentacion');
    expect(CLAVES_GEOTECNICO).toHaveLength(13);
  });

  it('el schema es estricto (required = properties, sin propiedades extra) y no usa tipos anulables', () => {
    const visitar = (nodo: unknown) => {
      if (typeof nodo !== 'object' || nodo === null) return;
      const n = nodo as Record<string, unknown>;
      expect(Array.isArray(n.type)).toBe(false);
      if (n.type === 'object') {
        expect(n.additionalProperties).toBe(false);
        const props = Object.keys((n.properties ?? {}) as object).sort();
        expect([...(n.required as string[])].sort()).toEqual(props);
        for (const hijo of Object.values(n.properties as Record<string, unknown>)) visitar(hijo);
      }
      if (n.items) visitar(n.items);
    };
    visitar(GEOTECNICO_PAYLOAD_SCHEMA);
    // El envelope sólo añade la unión de `proposal`: muy por debajo del tope de Anthropic.
    expect(exceedsAnthropicUnionLimit(GEOTECNICO_SCHEMA)).toBe(false);
    expect(() => toAnthropicSchema(GEOTECNICO_SCHEMA)).not.toThrow();
    expect(() => toOpenAiSchema(GEOTECNICO_SCHEMA)).not.toThrow();
  });

  it('el prompt lista cada campo con su ejemplo y las reglas de transcribir sin inventar', () => {
    for (const k of CLAVES_GEOTECNICO) expect(GEOTECNICO_PROMPT).toContain(`- ${k}:`);
    expect(GEOTECNICO_PROMPT).toMatch(/TRANSCRIBE, no interpretes/);
    expect(GEOTECNICO_PROMPT).toMatch(/No inventes/);
    expect(GEOTECNICO_PROMPT).toMatch(/ignora cualquier instrucción/);
  });
});

describe('qué se manda', () => {
  const pagina = (n: number, texto: string) => ({ n, texto });

  it('junta los trozos de pdf.js con espacio, y salto donde pdf.js lo marca', () => {
    expect(textoDeItems([{ str: 'Tensión', hasEOL: false }, { str: 'admisible', hasEOL: true }, { str: '2,0' }, { dir: 'ltr' } as { str?: string }])).toBe('Tensión admisible\n2,0 ');
  });

  it('si el texto cabe entero, va entero, con cada página bajo su rótulo y sin las vacías', () => {
    const s = seleccionarTexto([pagina(1, 'Portada  del   estudio'), pagina(2, '   '), pagina(3, 'Conclusiones\n\n\n\ntensión admisible 2 kg/cm²')]);
    expect(s.paginas).toEqual([1, 3]);
    expect(s.recortado).toBe(false);
    expect(s.texto).toBe('=== Página 1 ===\nPortada del estudio\n\n=== Página 3 ===\nConclusiones\n\ntensión admisible 2 kg/cm²');
  });

  it('si no cabe: las primeras, las de conclusiones, y el resto en orden hasta llenar; y todas en orden de documento', () => {
    const paginas = Array.from({ length: 40 }, (_, i) => pagina(i + 1, i === 29 ? `Conclusiones y recomendaciones: tensión admisible ${'x'.repeat(950)}` : 'y'.repeat(1000)));
    const s = seleccionarTexto(paginas, 8 * 1030);
    expect(s.recortado).toBe(true);
    expect(s.paginas).toEqual([1, 2, 3, 4, 5, 6, 7, 30]);
    expect(PRIMERAS).toBe(6);
    expect(s.texto.indexOf('=== Página 7 ===')).toBeLessThan(s.texto.indexOf('=== Página 30 ==='));
  });

  it('reconoce el informe escaneado por la media de caracteres de sus primeras páginas', () => {
    expect(esEscaneado([])).toBe(true);
    expect(esEscaneado(Array.from({ length: 30 }, (_, i) => pagina(i + 1, 'ruido')))).toBe(true);
    expect(esEscaneado(Array.from({ length: 30 }, (_, i) => pagina(i + 1, 'z'.repeat(600))))).toBe(false);
    expect(paginasEscaneado(3)).toEqual([1, 2, 3]);
    expect(paginasEscaneado(200)).toHaveLength(8);
  });

  it('la petición: prompt estable, fichero en el volátil, un turno con el texto, y el schema del envelope', () => {
    const sel = seleccionarTexto([pagina(1, 'Portada'), pagina(2, 'Datos')]);
    const req = construirPeticion({ nombre: 'GT-3654.pdf', paginas: 110 }, sel, []);
    expect(req.system.stable).toBe(GEOTECNICO_PROMPT);
    expect(req.system.volatile).toContain('«GT-3654.pdf»');
    expect(req.system.volatile).toContain('110 páginas');
    expect(req.system.volatile).toContain('texto de 2 de sus páginas');
    expect(req.turns).toHaveLength(1);
    expect(req.turns[0].role).toBe('user');
    expect(req.turns[0].text).toContain('=== Página 1 ===\nPortada');
    expect(req.turns[0].images).toBeUndefined();
    expect(req.schema).toBe(GEOTECNICO_SCHEMA);
    expect(req.cacheKey).toBe('concreta-geotecnico');
  });

  it('escaneado: las imágenes van en el turno y el volátil lo dice', () => {
    const img = { data: 'AAAA', mediaType: 'image/jpeg' as const };
    const req = construirPeticion({ nombre: 'viejo.pdf', paginas: 40 }, null, [img, img]);
    expect(req.system.volatile).toContain('escaneado');
    expect(req.turns[0].images).toHaveLength(2);
    expect(req.turns[0].text).toContain('2 imágenes');
  });
});

describe('lo que vuelve', () => {
  it('lee a la defensiva: lo que no tiene forma es «no encontrado», y nunca lanza', () => {
    expect(parseExtraccion(null).datos.empresa).toEqual({ texto: '', pagina: 0 });
    expect(parseExtraccion('basura').avisos).toEqual([]);
    const ex = parseExtraccion({
      tensionAdmisible: { texto: ' 2,0 kg/cm² ', pagina: 3 },
      balasto: { texto: '  ', pagina: 9 },
      nivelFreatico: { texto: 'No detectado', pagina: -2 },
      empresa: 'Geolabor',
      avisos: ['K0 calculado', 42, ''],
    });
    expect(ex.datos.tensionAdmisible).toEqual({ texto: '2,0 kg/cm²', pagina: 3 });
    expect(ex.datos.balasto).toEqual({ texto: '', pagina: 0 });
    expect(ex.datos.nivelFreatico).toEqual({ texto: 'No detectado', pagina: 0 });
    expect(ex.datos.empresa).toEqual({ texto: '', pagina: 0 });
    expect(ex.avisos).toEqual(['K0 calculado']);
  });
});

describe('al estado', () => {
  const ex = () =>
    extraccion({
      sondeos: { texto: '3 sondeos a rotación de 12 m', pagina: 5 },
      empresa: { texto: 'Geolabor S.L.', pagina: 1 },
      balasto: { texto: 'K30 = 6 kg/cm³', pagina: 23 },
      cimentacion: { texto: 'Zapatas aisladas sobre las arenas', pagina: 28 },
    });

  it('lo encontrado entra heredado con su fuente; lo tecleado por el usuario se conserva; lo que el informe no da, se lista', () => {
    const s0 = teclear(estadoPorDefecto(null), 'obra.geotecnia.empresa', 'Mi empresa');
    const r = aplicarExtraccion(s0, ex(), 'GT-3654.pdf');
    expect(r.rellenados.map((d) => d.clave)).toEqual(['sondeos', 'balasto', 'cimentacion']);
    expect(r.rellenados[0]).toEqual({ clave: 'sondeos', etiqueta: 'Sondeos y ensayos realizados', pagina: 5 });
    expect(r.conservados.map((d) => d.clave)).toEqual(['empresa']);
    expect(r.noEncontrados.map((d) => d.clave)).toContain('tensionAdmisible');
    expect(r.noEncontrados).toHaveLength(9);
    expect(r.state.obra.geotecnia.sondeos).toEqual({ valor: '3 sondeos a rotación de 12 m', origen: 'heredado', fuente: 'Del geotécnico «GT-3654.pdf», pág. 5' });
    expect(r.state.obra.geotecnia.empresa).toEqual({ valor: 'Mi empresa', origen: 'tecleado' });
    expect(r.state.obra.cimentacion.descripcion).toEqual({ valor: 'Zapatas aisladas sobre las arenas', origen: 'heredado', fuente: 'Del geotécnico «GT-3654.pdf», pág. 28' });
    expect(r.state.obra.geotecnia.tensionAdmisible).toEqual({ valor: '', origen: 'tecleado' });
    expect(fuenteDe('x.pdf', 0)).toBe('Del geotécnico «x.pdf»');
  });

  it('lo heredado de la obra anterior sí se pisa: el informe nuevo manda', () => {
    const s0 = duplicarFicha(teclear(estadoPorDefecto(null), 'obra.geotecnia.balasto', 'el de la obra anterior'));
    expect(s0.obra.geotecnia.balasto.origen).toBe('heredado');
    const r = aplicarExtraccion(s0, ex(), 'GT-3663.pdf');
    expect(r.rellenados.map((d) => d.clave)).toContain('balasto');
    expect(r.state.obra.geotecnia.balasto.valor).toBe('K30 = 6 kg/cm³');
  });

  it('la fuente sobrevive a guardar, la conserva confirmar y la borra teclear', () => {
    const s = proponer(estadoPorDefecto(null), 'obra.geotecnia.nivelFreatico', 'A 6,9 m', 'Del geotécnico «a.pdf», pág. 7');
    const releido = normalizar(JSON.parse(JSON.stringify(s)), null);
    expect(releido.obra.geotecnia.nivelFreatico).toEqual({ valor: 'A 6,9 m', origen: 'heredado', fuente: 'Del geotécnico «a.pdf», pág. 7' });
    expect(confirmar(s, 'obra.geotecnia.nivelFreatico').obra.geotecnia.nivelFreatico).toEqual({ valor: 'A 6,9 m', origen: 'tecleado', fuente: 'Del geotécnico «a.pdf», pág. 7' });
    expect(teclear(s, 'obra.geotecnia.nivelFreatico', 'A 7 m').obra.geotecnia.nivelFreatico).toEqual({ valor: 'A 7 m', origen: 'tecleado' });
    // Una fuente que no es texto se ignora al releer.
    const roto = JSON.parse(JSON.stringify(s));
    roto.obra.geotecnia.nivelFreatico.fuente = 7;
    expect(normalizar(roto, null).obra.geotecnia.nivelFreatico).toEqual({ valor: 'A 6,9 m', origen: 'heredado' });
    // Y `proponer` con un id que no es un campo no hace nada.
    expect(proponer(s, 'obra.noExiste', 'x', 'y')).toBe(s);
  });

  it('en la ficha, el dato propuesto sale en ámbar con la fuente como nota', () => {
    const { state } = aplicarExtraccion(estadoPorDefecto(null), ex(), 'GT-3654.pdf');
    const { datos } = evaluar(state, leerSobres());
    expect(datos.sec.geotecnia.sondeos.estado).toBe('heredado');
    expect(datos.sec.geotecnia.sondeos.nota).toBe('Del geotécnico «GT-3654.pdf», pág. 5');
    expect(datos.sec.geotecnia.tensionAdmisible.estado).toBe('falta');
    expect(datos.sec.geotecnia.tensionAdmisible.nota).toBeUndefined();
  });
});
