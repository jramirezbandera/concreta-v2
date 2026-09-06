/**
 * La fuente de los PDF: una Arimo embebida que suplanta a la Helvetica de jsPDF.
 *
 * ## El problema que resuelve
 *
 * Las fuentes core de jsPDF hablan Latin-1 y nada más. Con ellas, `pdfStr()`
 * tenía que degradar cada símbolo técnico antes de escribirlo: «Δcdev» salía
 * «Deltacdev», «γc» salía «gc», «fck ≥ 30» salía «fck >= 30» y «λ̄» y «λ» —dos
 * magnitudes distintas— salían las dos «lam». No era sólo feo: el PDF quedaba
 * sin buscar («Delta» no se encuentra buscando «Δ») y un dato normativo se
 * convertía en una aproximación tipográfica.
 *
 * Peor todavía era el fallo cuando alguien se saltaba el saneado: jsPDF, ante
 * un carácter sin hueco en WinAnsi, emite la cadena ENTERA en UTF-16BE, que el
 * visor pinta byte a byte («E s b e l t e z») y que además ocupa el DOBLE del
 * ancho que declara `getTextWidth` — o sea que se sale de su columna y pisa la
 * de al lado. Mojibake y descuadre eran el mismo bug.
 *
 * ## Por qué se llama «helvetica»
 *
 * Las caras se registran con el nombre `helvetica`, que es el que ya usan las
 * 340 llamadas a `setFont()` repartidas por los 21 exportadores. Suplantar el
 * nombre en vez de renombrar los sitios de llamada tiene dos ventajas que
 * compensan la rareza: no hay diff que revisar en 21 ficheros de maquetado
 * milimetrado, y no queda ninguna llamada rezagada apuntando a la fuente core
 * —que es justo donde volvería el mojibake, en el sitio donde nadie mira—.
 *
 * Se puede hacer porque Arimo es métricamente compatible con Arial, y Arial lo
 * es con Helvetica: medido sobre cadenas reales de la app, `getTextWidth` se
 * desvía como mucho un 0,78 %, que en una columna de 170 mm son 1,3 mm. Ninguna
 * tabla se descuadra. Ver `scripts/subset-pdf-font.py` para la procedencia, la
 * licencia (SIL OFL 1.1) y el repertorio subseteado.
 *
 * ## Cómo se usa
 *
 * Nadie construye un `jsPDF` a mano: se llama a `await crearPdf()`, que lo
 * construye Y registra las caras. Un documento sin registrar volvería a la
 * Helvetica core sin avisar de nada, así que hay un test que falla si aparece
 * un `new jsPDF(` suelto en `src/lib/pdf/`.
 */

import jsPDF from 'jspdf';
import type { jsPDFOptions } from 'jspdf';

/**
 * Los estilos que tienen cara embebida. `setFont('helvetica', <otro>)` caería a
 * la fuente core y perdería el Unicode; el test de `fuente` lo vigila.
 */
export const ESTILOS_CON_CARA: readonly string[] = ['normal', 'bold', 'italic'];

/**
 * Las tres caras, traídas sólo cuando alguien exporta de verdad.
 *
 * El `import()` es lo que las mantiene en un chunk propio. Con importación
 * estática, los 139 kB de base64 acababan en el chunk COMPARTIDO por la docena
 * de módulos que exportan PDF —105 kB gzip más— y se descargaban al abrir
 * «Vigas» aunque nadie fuese a exportar nada. Aquí sólo se pagan al pulsar el
 * botón. El resultado se cachea en el módulo: el segundo PDF no vuelve a pedirlo.
 */
async function caras(): Promise<readonly [fichero: string, estilo: string, datos: string][]> {
  const { ARIMO_BOLD_B64, ARIMO_ITALIC_B64, ARIMO_REGULAR_B64 } = await import('./fuenteArimo');
  return [
    ['Arimo-Regular.ttf', 'normal', ARIMO_REGULAR_B64],
    ['Arimo-Bold.ttf', 'bold', ARIMO_BOLD_B64],
    ['Arimo-Italic.ttf', 'italic', ARIMO_ITALIC_B64],
  ];
}

/** Nombre de familia con el que se registran. Ver la cabecera. */
export const FAMILIA = 'helvetica';

/**
 * Mete las tres caras en el documento. Idempotente por documento —jsPDF guarda
 * el VFS en la instancia—, pero sólo hace falta llamarla una vez, y de eso ya
 * se encarga `crearPdf()`.
 */
export async function registrarFuente(doc: jsPDF): Promise<void> {
  for (const [fichero, estilo, datos] of await caras()) {
    doc.addFileToVFS(fichero, datos);
    doc.addFont(fichero, FAMILIA, estilo);
  }
  // `addFont` no cambia la fuente activa: sin esto el documento seguiría con la
  // Helvetica core hasta el primer `setFont`, y lo que se escribiera antes
  // saldría en la fuente vieja.
  doc.setFont(FAMILIA, 'normal');
}

/** A4 vertical en milímetros: lo que usan todos los exportadores menos tres. */
const POR_DEFECTO: jsPDFOptions = { orientation: 'portrait', unit: 'mm', format: 'a4' };

/**
 * El único sitio donde se construye un documento PDF en toda la app.
 */
export async function crearPdf(opciones: jsPDFOptions = POR_DEFECTO): Promise<jsPDF> {
  const doc = new jsPDF(opciones);
  await registrarFuente(doc);
  return doc;
}
