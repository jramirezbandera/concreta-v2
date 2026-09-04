/**
 * La hoja a un .xlsx, escribiendo el OOXML a mano.
 *
 * Por qué a mano y no con una librería: un .xlsx es un zip de XML igual que un
 * .docx, y jszip ya viaja en el árbol (viene dentro de `docx`). Las librerías de
 * Excel se dividen en las que no saben escribir estilos —inútiles cuando el
 * aspecto de la hoja ES el entregable, porque esto va a captura— y las que sí
 * pero pesan como una app entera. Aquí las partes son ocho más una por hoja, el
 * estilo es una tabla de siete formatos, y a cambio se controla al píxel lo que
 * sale.
 *
 * Excel es implacable con el esquema y no explica nada: ante cualquier fallo
 * dice «contenido no legible» y se acabó. Las reglas que cuestan un fichero
 * corrupto, todas comprobadas por `src/test/materiales/xlsxLibro.test.ts`:
 *
 *  - El ORDEN de los hijos de `<worksheet>` es fijo: sheetViews, sheetFormatPr,
 *    cols, sheetData y `mergeCells` DESPUÉS de sheetData, nunca antes.
 *  - En `<styleSheet>` el orden es fonts, fills, borders, cellStyleXfs, cellXfs,
 *    cellStyles. Y los dos primeros `fill` (none y gray125) son OBLIGATORIOS
 *    aunque no se usen: Excel los da por sentado en los índices 0 y 1.
 *  - El `border` de índice 0 tiene que estar vacío.
 *  - Cada `<row>` numerada y cada `<c>` con su referencia A1 correcta. Un salto
 *    en la numeración no da error: da filas fantasma.
 *
 * Las cadenas van EN LÍNEA (`t="inlineStr"`), no en una tabla de cadenas
 * compartidas: ahorra una parte entera y una indirección, y un cuadro de
 * materiales no tiene repetición suficiente para que compartirlas compense.
 */

import JSZip from 'jszip';
import type { EstiloCelda, Hoja } from './hoja';

// ── XML ─────────────────────────────────────────────────────────────────────

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Referencia A1 de una celda. La columna 27 es «AA», no «A1» ni «[27]». */
export function refCelda(fila: number, columna: number): string {
  let n = columna + 1;
  let letras = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras + String(fila + 1);
}

// ── Estilos ─────────────────────────────────────────────────────────────────

/**
 * Índice de cada estilo en `cellXfs`. El 0 se reserva al formato por defecto.
 * Son índices POSICIONALES: cambiar el orden de `cellXfs` sin cambiar esta
 * tabla descoloca la hoja entera y en silencio.
 */
const XF: Record<EstiloCelda, number> = {
  titulo: 1,
  cabecera: 2,
  etiqueta: 3,
  dato: 4,
  nota: 5,
  caption: 6,
  parrafo: 7,
};

/**
 * Blanco con bordes finos y cabeceras en gris claro.
 *
 * El cuadro del plano está rotulado en rojo sobre negro porque vive en el
 * espacio modelo de AutoCAD. Una captura arrastra su propio fondo, así que lo
 * que se pega tiene que ser lo que se IMPRIME: negro sobre blanco. Y por eso no
 * hay ni un color de marca aquí: el cuadro no es de Concreta, es del plano.
 */
const GRIS_CABECERA = 'FFEFEFEF';
const GRIS_BORDE = 'FF808080';

function styles(): string {
  const fonts = [
    '<font><sz val="10"/><name val="Arial"/></font>',
    '<font><b/><sz val="11"/><name val="Arial"/></font>',
    '<font><b/><sz val="9"/><name val="Arial"/></font>',
    '<font><sz val="8"/><name val="Arial"/></font>',
    '<font><b/><i/><sz val="9"/><name val="Arial"/></font>',
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="' +
      GRIS_CABECERA +
      '"/><bgColor indexed="64"/></patternFill></fill>',
  ];
  const lado = (n: string) =>
    '<' + n + ' style="thin"><color rgb="' + GRIS_BORDE + '"/></' + n + '>';
  const linea = lado('left') + lado('right') + lado('top') + lado('bottom') + '<diagonal/>';
  const borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border>' + linea + '</border>',
  ];
  const cellXfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
  ];
  return (
    DECL +
    '<styleSheet xmlns="' + NS + '">' +
    '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
    '<fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
    '<borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + cellXfs.length + '">' + cellXfs.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

// ── La hoja ─────────────────────────────────────────────────────────────────

function sheet(hoja: Hoja, activa: boolean): string {
  const cols = hoja.anchos
    .map((w, j) => '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w + '" customWidth="1"/>')
    .join('');

  const fusiones: string[] = [];
  const filas = hoja.filas.map((f, i) => {
    const celdas: string[] = [];
    const fusion = f.fusion ?? 1;

    f.celdas.forEach((c, j) => {
      // `xml:space="preserve"` en TODAS: los marcadores de nota llegan como
      // " (*)" con espacio inicial y sin esto Excel se lo come.
      celdas.push(
        '<c r="' + refCelda(i, j) + '" s="' + XF[c.estilo] + '" t="inlineStr">' +
          '<is><t xml:space="preserve">' + esc(c.texto) + '</t></is></c>',
      );
    });

    if (fusion > 1 && f.celdas.length > 0) {
      // Las celdas tapadas por la fusión se escriben vacías y con el MISMO
      // estilo: si no, el fondo de la banda se corta en la primera columna.
      for (let j = 1; j < fusion; j++) {
        celdas.push('<c r="' + refCelda(i, j) + '" s="' + XF[f.celdas[0].estilo] + '"/>');
      }
      fusiones.push('<mergeCell ref="' + refCelda(i, 0) + ':' + refCelda(i, fusion - 1) + '"/>');
    }

    const alto = f.alto ? ' ht="' + f.alto + '" customHeight="1"' : '';
    return '<row r="' + (i + 1) + '"' + alto + '>' + celdas.join('') + '</row>';
  });

  return (
    DECL +
    '<worksheet xmlns="' + NS + '" xmlns:r="' + NS_R + '">' +
    // showGridLines="0": la captura no puede delatar que esto salió de una hoja.
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0"' +
    (activa ? ' tabSelected="1"' : '') +
    '/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="14.5"/>' +
    (cols ? '<cols>' + cols + '</cols>' : '') +
    '<sheetData>' + filas.join('') + '</sheetData>' +
    // mergeCells SIEMPRE después de sheetData.
    (fusiones.length
      ? '<mergeCells count="' + fusiones.length + '">' + fusiones.join('') + '</mergeCells>'
      : '') +
    '</worksheet>'
  );
}

// ── El libro ────────────────────────────────────────────────────────────────

export interface MetaXlsx {
  /** Título del documento (dc:title). */
  titulo?: string;
  autor?: string;
}

/**
 * Las partes de un .xlsx mínimo pero válido, más las propiedades.
 *
 * Multihoja porque una columna de Excel tiene UN ancho: los cuadros de anclaje,
 * cuyas celdas son números de dos cifras, salían estirados al compartir columna
 * con «Mín. contenido de cemento» del cuadro de hormigón. Cada hoja mide sus
 * columnas por su cuenta.
 *
 * Los identificadores de relación son POSICIONALES: rId1..rIdN son las hojas en
 * orden y la N+1 son los estilos. Descolocar uno no da error, da una hoja que
 * abre en blanco.
 */
export function partesDelLibro(hojas: Hoja[], meta: MetaXlsx = {}): Record<string, string> {
  const t = esc(meta.titulo?.trim() || 'Cuadro de materiales');
  const autor = esc(meta.autor ?? 'Concreta');
  const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const CORE_REL = NS_PKG_REL + '/metadata/core-properties';
  const rIdEstilos = 'rId' + (hojas.length + 1);
  const partesHoja: Record<string, string> = {};
  hojas.forEach((h, i) => {
    partesHoja['xl/worksheets/sheet' + (i + 1) + '.xml'] = sheet(h, i === 0);
  });
  return {
    ...partesHoja,
    '[Content_Types].xml':
      DECL +
      '<Types xmlns="' + CT + '">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      hojas
        .map(
          (_, i) =>
            '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
        )
        .join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>',
    '_rels/.rels':
      DECL +
      '<Relationships xmlns="' + NS_PKG_REL + '">' +
      '<Relationship Id="rId1" Type="' + NS_R + '/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="' + CORE_REL + '" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + NS_R + '/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>',
    'docProps/core.xml':
      DECL +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:title>' + t + '</dc:title>' +
      '<dc:creator>' + autor + '</dc:creator>' +
      '<cp:lastModifiedBy>' + autor + '</cp:lastModifiedBy>' +
      '</cp:coreProperties>',
    'docProps/app.xml':
      DECL +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      '<Application>Concreta</Application></Properties>',
    'xl/workbook.xml':
      DECL +
      '<workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '">' +
      '<sheets>' +
      hojas
        .map(
          (h, i) =>
            '<sheet name="' + esc(h.nombre) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>',
        )
        .join('') +
      '</sheets>' +
      '</workbook>',
    'xl/_rels/workbook.xml.rels':
      DECL +
      '<Relationships xmlns="' + NS_PKG_REL + '">' +
      hojas
        .map(
          (_, i) =>
            '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_R +
            '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>',
        )
        .join('') +
      '<Relationship Id="' + rIdEstilos + '" Type="' + NS_R + '/styles" Target="styles.xml"/>' +
      '</Relationships>',
    'xl/styles.xml': styles(),
  };
}

export async function escribirLibro(hojas: Hoja[], meta: MetaXlsx = {}): Promise<Blob> {
  const zip = new JSZip();
  for (const [ruta, xml] of Object.entries(partesDelLibro(hojas, meta))) zip.file(ruta, xml);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
  });
}
