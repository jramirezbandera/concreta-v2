// @vitest-environment node
/**
 * Lectura REAL de estudios geotécnicos con el proveedor de IA, contra los
 * PDF de una carpeta. No corre en la suite: hay que pedirla con GEO_LIVE=1,
 * y cuesta dinero (o cupo de la clave compartida). Sirve para comprobar,
 * con informes de verdad, que el texto que saca pdf.js y el prompt dan datos
 * que un técnico firmaría; el veredicto lo da quien lee el volcado, no el
 * test, que sólo exige lo que ningún geotécnico deja de decir.
 *
 *   GEO_LIVE=1 bunx vitest run --mode development src/test/live
 *
 * `--mode development` hace que Vite cargue `.env.local` (la clave compartida
 * de Gemini de verdad) en vez de `.env.test`, que trae una ficticia.
 *
 * Variables: GEO_PDFS (carpeta con los PDF; por defecto ../ejemplos
 * geotecnico), GEO_PROVIDER (anthropic | openai | gemini; por defecto
 * gemini), GEO_KEY (clave propia; si no, la compartida del proveedor),
 * GEO_OUT (fichero JSON donde volcar las extracciones), GEO_SOLO (parte del
 * nombre de un PDF, para leer sólo ése).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extraerTextos } from '../../lib/ai/pdfPrep';
import { runChatTurn } from '../../lib/ai/providers';
import { sharedKeyFor } from '../../lib/ai/sharedKey';
import type { AiProviderId } from '../../lib/ai/types';
import { construirPeticion, esEscaneado, parseExtraccion, seleccionarTexto, CLAVES_GEOTECNICO } from '../../lib/memoria/geotecnico';

const vivo = process.env.GEO_LIVE === '1';
const carpeta = resolve(process.env.GEO_PDFS ?? '../ejemplos geotecnico');
const proveedor = (process.env.GEO_PROVIDER ?? 'gemini') as AiProviderId;
const solo = process.env.GEO_SOLO ?? '';
const pdfs = vivo && existsSync(carpeta) ? readdirSync(carpeta).filter((f) => /\.pdf$/i.test(f) && f.includes(solo)) : [];
const salida: Record<string, unknown> = {};

async function abrirEnNode(ruta: string) {
  const raiz = resolve('node_modules/pdfjs-dist/legacy/build');
  const pdfjs = (await import(/* @vite-ignore */ pathToFileURL(join(raiz, 'pdf.mjs')).href)) as typeof import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(raiz, 'pdf.worker.mjs')).href;
  // Las fuentes estándar, para que pdf.js no avise en cada página que no las encuentra.
  const standardFontDataUrl = `${pathToFileURL(resolve('node_modules/pdfjs-dist/standard_fonts')).href}/`;
  return pdfjs.getDocument({ data: new Uint8Array(readFileSync(ruta)), standardFontDataUrl }).promise;
}

describe.skipIf(!vivo)('lectura real de geotécnicos', () => {
  it.each(pdfs)('%s', async (nombre) => {
    const clave = process.env.GEO_KEY ?? sharedKeyFor(proveedor);
    expect(clave, `sin clave para ${proveedor}`).toBeTruthy();

    const t0 = Date.now();
    const doc = await abrirEnNode(join(carpeta, nombre));
    const textos = await extraerTextos(doc);
    const escaneado = esEscaneado(textos);
    expect(escaneado, 'el test en vivo sólo cubre informes con texto').toBe(false);
    const seleccion = seleccionarTexto(textos);
    const t1 = Date.now();

    const req = construirPeticion({ nombre, paginas: doc.numPages }, seleccion, []);
    const envelope = await runChatTurn(proveedor, clave!, req);
    const ex = parseExtraccion(envelope.proposal);
    const t2 = Date.now();

    const encontrados = CLAVES_GEOTECNICO.filter((k) => ex.datos[k].texto !== '');
    salida[nombre] = { paginas: doc.numPages, paginasMandadas: seleccion.paginas.length, chars: seleccion.chars, recortado: seleccion.recortado, msPdf: t1 - t0, msIa: t2 - t1, reply: envelope.reply, datos: ex.datos, avisos: ex.avisos };
    console.log(`\n■ ${basename(nombre)} · ${doc.numPages} pág. · ${seleccion.paginas.length} mandadas · ${seleccion.chars} chars · pdf ${t1 - t0} ms · ia ${t2 - t1} ms\n  ${envelope.reply}`);
    for (const k of CLAVES_GEOTECNICO) console.log(`  ${k.padEnd(20)} p.${String(ex.datos[k].pagina).padStart(3)}  ${ex.datos[k].texto || '—'}`);
    for (const a of ex.avisos) console.log(`  ! ${a}`);
    if (process.env.GEO_OUT) writeFileSync(process.env.GEO_OUT, JSON.stringify(salida, null, 2), 'utf-8');

    // Lo que ningún geotécnico deja de decir.
    expect(ex.datos.tensionAdmisible.texto).not.toBe('');
    expect(ex.datos.descripcionTerrenos.texto).not.toBe('');
    expect(ex.datos.empresa.texto).not.toBe('');
    expect(encontrados.length).toBeGreaterThanOrEqual(10);
  }, 240_000);
});
