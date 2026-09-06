/**
 * Del plan a un documento de la librería `docx`. Traduce; no decide.
 *
 * Todo lo que es criterio de maqueta —anchos, troceo de tablas anchas, qué
 * estilo lleva cada bloque, negritas— ya está resuelto en `plan.ts`, que es
 * puro y se testea sin abrir un zip. Aquí sólo queda el mapeo mecánico a
 * `Paragraph` / `Table` y las tres decisiones que SÍ son de este piso:
 *
 *  1. **Tipografía propia, calcada de las memorias del estudio.** La primera
 *     versión no definía ni una fuente, apostando a que el documento heredaría
 *     la plantilla del usuario. Falso: un .docx recién creado no tiene plantilla,
 *     tiene la de Word, y salía con títulos azules de Calibri Light que no se
 *     parecen a nada de lo que firma un proyectista. Los tamaños salen de medir
 *     dos memorias entregadas del estudio: **Arial**, cuerpo 10 pt, títulos en
 *     **negrita y NEGRO** (14 y 12 pt) y tablas a **8 pt** con márgenes de celda
 *     de 70 twips. Se siguen usando los IDs integrados (`Heading1..3`, `Caption`,
 *     `TableGrid`), así que el esquema y el índice automático siguen funcionando
 *     y, al pegar con «Combinar formato», Word adopta la plantilla de destino.
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
  ShadingType,
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
  /** Título del documento: va como Heading1 al principio. Vacío = sin H1 (la ficha DB SE trae el suyo en los bloques). */
  titulo: string;
  asunto?: string;
  autor?: string;
  /** Metadatos del fichero (dc:title, dc:description, keywords) cuando el H1 no los da. */
  tituloDocumento?: string;
  descripcion?: string;
  palabrasClave?: string;
}

/** A4 vertical en twips (1/1440"), y márgenes de 2 cm. */
const A4 = { width: 11906, height: 16838 };
const MARGEN = 1134;

/**
 * La tipografía del estudio, medida sobre sus memorias entregadas. Los tamaños
 * van en medios puntos, que es la unidad de OOXML: 20 = 10 pt.
 */
const FUENTE = 'Arial';
const CUERPO = 20; // 10 pt
const TABLA = 16; // 8 pt — el de las tablas de la memoria de Abayalde
const NEGRO = '000000';
const GRIS_CABECERA = 'EFEFEF';
/** Márgenes de celda en twips: el texto no puede ir pegado al borde. */
const MARGEN_CELDA = { top: 40, bottom: 40, left: 70, right: 70 };

const ESTILOS = {
  default: {
    document: {
      run: { font: FUENTE, size: CUERPO, color: NEGRO },
      paragraph: { spacing: { after: 120 } },
    },
    heading1: {
      run: { font: FUENTE, size: 28, bold: true, color: NEGRO },
      paragraph: { spacing: { before: 280, after: 140 } },
    },
    heading2: {
      run: { font: FUENTE, size: 24, bold: true, color: NEGRO },
      paragraph: { spacing: { before: 240, after: 120 } },
    },
    heading3: {
      run: { font: FUENTE, size: 22, bold: true, color: NEGRO },
      paragraph: { spacing: { before: 200, after: 100 } },
    },
  },
  paragraphStyles: [
    {
      // El `Caption` integrado de Word es azul y cursiva. Las llamadas al pie de
      // un cuadro no son un pie de figura de folleto: negro, 8 pt y quietas.
      id: 'Caption',
      name: 'Caption',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { font: FUENTE, size: TABLA, color: NEGRO, italics: false },
      paragraph: { spacing: { before: 0, after: 60 } },
    },
  ],
};

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
 *
 * El `spacing.after` del cuerpo se anula dentro de la tabla: 120 twips debajo de
 * cada celda dejaba las filas el doble de altas de lo necesario.
 */
function celda(texto: string, negrita: boolean, ancho: number, cabecera: boolean): TableCell {
  return new TableCell({
    width: { size: ancho, type: WidthType.PERCENTAGE },
    shading: cabecera
      ? { type: ShadingType.CLEAR, color: 'auto', fill: GRIS_CABECERA }
      : undefined,
    margins: MARGEN_CELDA,
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: texto, bold: negrita, size: TABLA })],
      }),
    ],
  });
}

function fila(f: FilaPlan, anchos: number[]): TableRow {
  return new TableRow({
    children: f.celdas.map((c, j) => celda(c.texto, c.negrita, anchos[j], f.cabecera)),
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
    margins: { marginUnitType: WidthType.DXA, ...MARGEN_CELDA },
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
    styles: ESTILOS,
    title: plan.titulo || meta.tituloDocumento || 'Cuadro de materiales',
    subject: meta.asunto ?? 'Cuadro de materiales',
    creator: meta.autor ?? 'Concreta',
    lastModifiedBy: meta.autor ?? 'Concreta',
    description: meta.descripcion ?? 'Cuadro de materiales generado con Concreta (Código Estructural, CTE DB SE-A y DB SE-M)',
    keywords: meta.palabrasClave ?? 'hormigón, acero, madera, Código Estructural, cuadro de materiales',
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
