/**
 * Del plan a un documento de la librería `docx`. Traduce; no decide.
 *
 * Todo lo que es criterio de maqueta —anchos, troceo de tablas anchas, qué
 * estilo lleva cada bloque, negritas— ya está resuelto en `plan.ts`, que es
 * puro y se testea sin abrir un zip. Aquí sólo queda el mapeo mecánico a
 * `Paragraph` / `Table` y las tres decisiones que SÍ son de este piso:
 *
 *  1. **Ni una fuente, ni un tamaño, ni un color.** No hay `styles.default`.
 *     Los estilos son los integrados de Word (`Heading1..3`, `Caption`,
 *     `TableGrid`), que Word materializa contra la plantilla del usuario. Ése
 *     es todo el diseño: el cuadro se pega en la memoria del proyecto y hereda
 *     su tipografía, su numeración y su índice.
 *  2. **A4 vertical explícito.** Un .docx sin `sectPr` lo abre Word en Letter
 *     en instalaciones en-US, y el cuadro se sale por la derecha.
 *  3. **Una sola sección.** Nada de apaisado: una sección apaisada arrastra su
 *     propio `sectPr`, y al pegar el cuadro Word inserta un salto de sección
 *     que gira todo lo que va detrás. Las tablas anchas se trocean (`plan.ts`).
 *
 * Igual que en `plan.ts`, el texto viaja verbatim: XML en UTF-8, sin `pdfStr`.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { Block } from '../materiales/cuadros';
import { planificarDocx, type BloquePlan, type EstiloParrafo, type FilaPlan } from './plan';

export interface MetaDocx {
  /** Título del usuario. Vacío ⇒ el documento no abre con encabezado. */
  titulo: string;
  /** dc:subject. Por defecto «Cuadro de materiales». */
  asunto?: string;
  /** dc:creator. Por defecto «Concreta». */
  autor?: string;
}

/** A4 vertical en twips (1/1440"), y márgenes de 2 cm. */
const A4 = { width: 11906, height: 16838 };
const MARGEN = 1134;

const NIVEL: Record<'Heading1' | 'Heading2' | 'Heading3', (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  Heading1: HeadingLevel.HEADING_1,
  Heading2: HeadingLevel.HEADING_2,
  Heading3: HeadingLevel.HEADING_3,
};

function parrafo(estilo: EstiloParrafo, texto: string): Paragraph {
  if (estilo === 'Heading1' || estilo === 'Heading2' || estilo === 'Heading3') {
    return new Paragraph({ heading: NIVEL[estilo], text: texto });
  }
  // `Caption` es un estilo latente: presente en cualquier plantilla de Word y
  // en LibreOffice, pero sin definición propia en este documento. Es lo que
  // deja las notas al pie del cuadro con el cuerpo pequeño de la plantilla.
  if (estilo === 'Caption') {
    return new Paragraph({ style: 'Caption', text: texto });
  }
  return new Paragraph({ text: texto });
}

/**
 * Una celda. Word exige que toda celda contenga al menos un párrafo, así que
 * las vacías (la esquina superior izquierda de los cuadros transpuestos) llevan
 * un párrafo con una cadena vacía, no `children: []`.
 */
function celda(texto: string, negrita: boolean, ancho: number): TableCell {
  return new TableCell({
    width: { size: ancho, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text: texto, bold: negrita })] })],
  });
}

function fila(f: FilaPlan, anchos: number[]): TableRow {
  return new TableRow({
    children: f.celdas.map((c, j) => celda(c.texto, c.negrita, anchos[j])),
    // La cabecera se repite en cada página; ninguna fila se parte por la mitad
    // entre dos páginas. Es la misma invariante «atomic row» que ya respeta
    // `drawTable` en los PDF del resto de la app.
    tableHeader: f.cabecera,
    cantSplit: true,
  });
}

function tabla(b: Extract<BloquePlan, { tipo: 'tabla' }>): Table {
  return new Table({
    rows: b.filas.map((f) => fila(f, b.anchos)),
    width: { size: 100, type: WidthType.PERCENTAGE },
    // Anchos en PORCENTAJE y layout fijo: un porcentaje sobrevive a pegar la
    // tabla en una plantilla con otros márgenes; un ancho absoluto se saldría
    // del cuadro de texto ajeno. Sin layout fijo, Word reparte a su gusto y el
    // cálculo de `plan.ts` no sirve de nada.
    layout: TableLayoutType.FIXED,
    style: 'TableGrid',
  });
}

export function documentoDeBloques(blocks: Block[], meta: MetaDocx): Document {
  const plan = planificarDocx(blocks, meta.titulo);
  const children: (Paragraph | Table)[] = [];

  for (const b of plan.bloques) {
    if (b.tipo === 'parrafo') {
      children.push(parrafo(b.estilo, b.texto));
      continue;
    }
    if (b.caption) {
      children.push(
        new Paragraph({ style: 'Caption', text: b.caption, alignment: AlignmentType.LEFT }),
      );
    }
    children.push(tabla(b));
    // Word pega dos tablas consecutivas en una sola si no hay nada en medio.
    // Los cuadros de anclajes son media docena seguidas: sin este párrafo
    // vacío, «Posición I / Posición II» de dos hormigones distintos saldrían
    // como una única tabla de cuatro filas sin saber cuál es cuál.
    children.push(new Paragraph({ text: '' }));
  }

  return new Document({
    title: plan.titulo || 'Cuadro de materiales',
    subject: meta.asunto ?? 'Cuadro de materiales',
    creator: meta.autor ?? 'Concreta',
    lastModifiedBy: meta.autor ?? 'Concreta',
    description:
      'Cuadro de materiales generado con Concreta (Código Estructural, CTE DB SE-A y DB SE-M)',
    keywords: 'hormigón, acero, madera, Código Estructural, cuadro de materiales',
    sections: [
      {
        properties: {
          page: {
            size: { width: A4.width, height: A4.height, orientation: PageOrientation.PORTRAIT },
            margin: { top: MARGEN, right: MARGEN, bottom: MARGEN, left: MARGEN },
          },
        },
        children,
      },
    ],
  });
}
