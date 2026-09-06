/**
 * La fuente embebida de los PDF, y los dos guardianes que la mantienen puesta.
 *
 * El fallo que vigilan no lanza ninguna excepción ni rompe ningún PDF: si un
 * documento se construye con `new jsPDF()` en vez de `crearPdf()`, o si alguien
 * pide un estilo sin cara registrada, jsPDF cae a la Helvetica CORE en silencio
 * y el papel vuelve a decir «?cdev» donde debería decir «Δcdev». Como el PDF
 * sigue saliendo y con buena pinta, nadie se entera hasta que un cliente lee la
 * memoria.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import jsPDF from 'jspdf';
import { ESTILOS_CON_CARA, FAMILIA, crearPdf, registrarFuente } from '../../lib/pdf/fuente';
import { ARIMO_GLIFOS, ARIMO_RANGOS } from '../../lib/pdf/cobertura';

const DIR = 'src/lib/pdf';
const ficheros = readdirSync(DIR).filter((f) => f.endsWith('.ts'));
const codigo = (f: string) => readFileSync(join(DIR, f), 'utf8');

/** Fuera comentarios: lo que se vigila es el código, no lo que se cuenta de él. */
const sinComentarios = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');

describe('nadie construye un jsPDF a mano', () => {
  it('el único `new jsPDF(` de src/lib/pdf está en fuente.ts', () => {
    const culpables = ficheros.filter(
      (f) => f !== 'fuente.ts' && sinComentarios(codigo(f)).includes('new jsPDF('),
    );
    expect(culpables, 'usa crearPdf() en vez de new jsPDF()').toEqual([]);
  });

  it('todos los exportadores crean su documento con `crearPdf`', () => {
    // Los que no exportan nada: los ayudantes compartidos, que reciben el `doc`
    // ya hecho, y los dos módulos generados por el script de la fuente.
    const AYUDANTES = ['bloques.ts', 'cobertura.ts', 'fuente.ts', 'fuenteArimo.ts', 'utils.ts'];
    const exportadores = ficheros.filter((f) => !AYUDANTES.includes(f));
    expect(exportadores.length).toBeGreaterThan(15);
    for (const f of exportadores) expect(codigo(f), f).toContain('crearPdf(');
  });

  it('la fuente viaja en su propio chunk: `import()` y no importación estática', () => {
    // Con importación estática los 139 kB de base64 caen en el chunk COMPARTIDO
    // por la docena de módulos que exportan PDF, y se descargan al abrir
    // «Vigas» aunque nadie vaya a exportar. Es el mismo error que ya se cometió
    // una vez con el `fallbackFilename` del .docx.
    const f = codigo('fuente.ts');
    expect(f).toContain("await import('./fuenteArimo')");
    expect(f).not.toMatch(/^import .*fuenteArimo/m);
  });
});

describe('ningún setFont pide un estilo sin cara', () => {
  it('sólo se usan los estilos registrados', () => {
    const malos: string[] = [];
    for (const f of ficheros) {
      for (const m of sinComentarios(codigo(f)).matchAll(/setFont\(\s*'(\w+)'\s*,\s*'(\w+)'/g)) {
        const [, familia, estilo] = m;
        if (familia === FAMILIA && !ESTILOS_CON_CARA.includes(estilo)) malos.push(`${f}: ${estilo}`);
      }
    }
    expect(malos, 'registra la cara en scripts/subset-pdf-font.py o usa otro estilo').toEqual([]);
  });

  it('los dos recuadros en `courier` sanean a Latin-1, que es lo que esa fuente habla', () => {
    const conCourier = ficheros.filter((f) => sinComentarios(codigo(f)).includes("setFont('courier'"));
    expect(conCourier.sort()).toEqual(['isolatedFooting.ts', 'masonryWalls.ts']);
    for (const f of conCourier) expect(codigo(f), f).toContain('pdfStrLatin1(');
  });
});

describe('registrarFuente', () => {
  it('deja las tres caras puestas y activa la normal', async () => {
    const doc = await crearPdf();
    const lista = doc.getFontList();
    expect(Object.keys(lista)).toContain(FAMILIA);
    for (const estilo of ESTILOS_CON_CARA) expect(lista[FAMILIA]).toContain(estilo);
    expect(doc.getFont().fontName).toBe(FAMILIA);
  });

  it('suplanta de verdad a la Helvetica core: mismo nombre, otras anchuras', async () => {
    const core = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    core.setFont(FAMILIA, 'normal');
    core.setFontSize(9);
    const embebida = await crearPdf();
    embebida.setFont(FAMILIA, 'normal');
    embebida.setFontSize(9);

    const muestra = 'Recubrimiento nominal de las armaduras (mm)';
    const a = core.getTextWidth(muestra);
    const b = embebida.getTextWidth(muestra);
    // Distintas —o sea que la suplantación ha surtido efecto— pero casi iguales:
    // Arimo es métricamente compatible con Arial, y Arial con Helvetica. Ese
    // «casi» es lo que permite cambiar de fuente sin remaquetar 21 documentos.
    expect(b).not.toBe(a);
    expect(Math.abs(b - a) / a).toBeLessThan(0.02);
  });

  it('sobre un documento ya creado también vale', async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await registrarFuente(doc);
    expect(doc.getFontList()[FAMILIA]).toContain('italic');
  });
});

describe('la cobertura declarada es la que trae la fuente', () => {
  it('los rangos van ordenados, sin solapes y sin tocarse', () => {
    let previo = -2;
    let total = 0;
    for (const [a, b] of ARIMO_RANGOS) {
      expect(a).toBeGreaterThan(previo + 1); // si se tocaran, estarían sin fundir
      expect(b).toBeGreaterThanOrEqual(a);
      total += b - a + 1;
      previo = b;
    }
    expect(total).toBe(ARIMO_GLIFOS);
  });

  it('cubre lo imprescindible: Latin-1 entero y el griego entero', () => {
    const cubre = (cp: number) => ARIMO_RANGOS.some(([a, b]) => cp >= a && cp <= b);
    for (let cp = 0x20; cp <= 0x7e; cp++) expect(cubre(cp), `U+${cp.toString(16)}`).toBe(true);
    for (let cp = 0xa0; cp <= 0xff; cp++) expect(cubre(cp), `U+${cp.toString(16)}`).toBe(true);
    for (const ch of 'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ') {
      expect(cubre(ch.codePointAt(0)!), ch).toBe(true);
    }
  });
});
