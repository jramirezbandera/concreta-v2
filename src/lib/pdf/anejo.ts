/**
 * La portada y el índice del anejo de cálculo: el «frente» que va delante de
 * las piezas. Con jsPDF, como el resto de documentos de la app (misma Arimo,
 * mismos márgenes que el capítulo Memorias), y luego pdf-lib lo pega delante
 * de las piezas (`lib/anejo/generar.ts`).
 *
 * El índice se dibuja en las posiciones que devuelve `planIndice`, que es el
 * mismo plan con el que la pantalla cuenta las páginas antes de generar. No
 * decide nada aquí: si el plan dice que una entrada va en la página 2 a 41 mm,
 * ahí se pinta. Al terminar se comprueba que el documento tiene exactamente
 * las páginas que el plan previó; si no, algo ha cambiado en uno de los dos
 * sitios y no en el otro, y es mejor un error que un índice desplazado.
 *
 * Los pies de las páginas del índice no se pintan aquí: los pone
 * `repintarPies` al final, con la numeración del documento entero. La
 * portada no lleva pie.
 */

import type { Obra } from '../obra';
import { emplazamientoDe, MAQUETA_INDICE, planIndice, type EntradaIndice } from '../anejo/maqueta';
import { crearPdf } from './fuente';
import { PAGE_H, PAGE_W, pdfStr, setGray, truncateToWidth } from './utils';
import type jsPDF from 'jspdf';

export interface DatosPortada {
  /** La obra guardada, si la hay: da la denominación, el uso y el emplazamiento. */
  obra: Obra | null;
  /** Nombre de la obra en el menú (si la obra no tiene denominación, es lo que se enseña). */
  nombre: string;
  fecha: Date;
  /** Versión de Concreta que genera el documento. */
  version: string;
}

export interface FrenteDelAnejo {
  blob: Blob;
  /** Portada + índice. */
  paginas: number;
  paginasIndice: number;
}

const M = MAQUETA_INDICE.M;

/** La denominación que va en la portada. */
export function denominacionDePortada(p: Pick<DatosPortada, 'obra' | 'nombre'>): string {
  return p.obra?.denominacion.trim() || p.nombre.trim() || 'Obra sin nombre';
}

/** Las líneas de datos de la portada, sólo las que la obra sabe. */
export function lineasDePortada(obra: Obra | null): [rotulo: string, valor: string][] {
  const lineas: [string, string][] = [];
  if (!obra) return lineas;
  if (obra.uso.trim()) lineas.push(['Uso', obra.uso.trim()]);
  const emplazamiento = emplazamientoDe(obra);
  if (emplazamiento) lineas.push(['Emplazamiento', emplazamiento]);
  if (obra.altitud !== null) lineas.push(['Altitud', `${obra.altitud} m`]);
  return lineas;
}

function dibujarPortada(doc: jsPDF, p: DatosPortada, capitulos: number): void {
  const ancho = PAGE_W - 2 * M;

  // Cabecera fina, como la banda de los documentos de módulo.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 140);
  doc.text('Concreta', M, M);
  doc.text(pdfStr('Anejo de cálculo'), PAGE_W - M, M, { align: 'right' });
  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 3, PAGE_W - M, M + 3);

  // El título del documento.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  setGray(doc, 20);
  doc.text(pdfStr('Anejo de cálculo'), M, 110);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setGray(doc, 110);
  doc.text(pdfStr('Memoria justificativa y cálculos de pieza'), M, 118);

  // La obra.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  setGray(doc, 30);
  const lineasTitulo: string[] = doc.splitTextToSize(pdfStr(denominacionDePortada(p)), ancho);
  let y = 140;
  doc.text(lineasTitulo, M, y);
  y += lineasTitulo.length * 7 + 4;

  doc.setFontSize(10);
  for (const [rotulo, valor] of lineasDePortada(p.obra)) {
    doc.setFont('helvetica', 'normal');
    setGray(doc, 120);
    doc.text(pdfStr(rotulo), M, y);
    doc.setFont('helvetica', 'normal');
    setGray(doc, 50);
    doc.text(pdfStr(valor), M + 32, y);
    y += 6;
  }

  // Pie de portada (la única página sin el pie del documento).
  const yPie = PAGE_H - M - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(pdfStr(`Fecha: ${p.fecha.toLocaleDateString('es-ES')}`), M, yPie);
  doc.text(pdfStr(`${capitulos} ${capitulos === 1 ? 'capítulo' : 'capítulos'}`), M, yPie + 5);
  doc.text(pdfStr(`Generado con Concreta v${p.version}`), PAGE_W - M, yPie, { align: 'right' });
}

const paginasTexto = (n: number) => `${n} ${n === 1 ? 'página' : 'páginas'}`;

function dibujarIndice(doc: jsPDF, entradas: readonly EntradaIndice[]): number {
  const plan = planIndice(entradas);
  const porId = new Map(entradas.map((e) => [e.id, e]));

  for (let i = 1; i <= plan.paginas; i++) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setGray(doc, 20);
    doc.text(pdfStr(i === 1 ? 'Índice' : 'Índice (continuación)'), M, M);
    doc.setLineWidth(0.3);
    setGray(doc, 200);
    doc.line(M, M + 4, PAGE_W - M, M + 4);
  }
  const primeraDelIndice = doc.getNumberOfPages() - plan.paginas;

  for (const s of plan.secciones) {
    doc.setPage(primeraDelIndice + s.posicion.pagina);
    const y = s.posicion.y + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setGray(doc, 100);
    doc.text(pdfStr(s.rotulo.toUpperCase()), M, y);
    doc.setLineWidth(0.2);
    setGray(doc, 220);
    doc.line(M, y + 1.5, PAGE_W - M, y + 1.5);
  }

  const xNumero = M + 8;
  const xTitulo = M + 11;
  const xPagina = PAGE_W - M;
  const anchoPagina = 12;
  for (const e of plan.entradas) {
    const entrada = porId.get(e.id);
    if (!entrada) throw new Error(`anejo: el plan del índice tiene una entrada sin datos (${e.id})`);
    doc.setPage(primeraDelIndice + e.posicion.pagina);
    const y = e.posicion.y + 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setGray(doc, 30);
    doc.text(`${entrada.numero}.`, xNumero, y, { align: 'right' });
    const titulo = truncateToWidth(doc, pdfStr(entrada.titulo), xPagina - anchoPagina - 4 - xTitulo);
    doc.text(titulo, xTitulo, y);

    const xIni = xTitulo + doc.getTextWidth(titulo) + 2;
    const xFin = xPagina - anchoPagina - 2;
    if (xFin > xIni) {
      doc.setLineDashPattern([0.3, 1.2], 0);
      doc.setLineWidth(0.25);
      setGray(doc, 170);
      doc.line(xIni, y, xFin, y);
      doc.setLineDashPattern([], 0);
    }
    setGray(doc, 30);
    doc.text(String(entrada.pagina), xPagina, y, { align: 'right' });

    doc.setFontSize(7.5);
    setGray(doc, 130);
    const detalle = [entrada.capitulo !== entrada.titulo ? entrada.capitulo : null, paginasTexto(entrada.paginas)]
      .filter((x): x is string => x !== null)
      .join(' · ');
    doc.text(pdfStr(detalle), xTitulo, y + 3.6);
  }
  return plan.paginas;
}

/**
 * La portada y el índice, con los números de página que le den. Lanza si el
 * documento no ocupa exactamente las páginas previstas por el plan.
 */
export async function frenteDelAnejo(portada: DatosPortada, entradas: readonly EntradaIndice[]): Promise<FrenteDelAnejo> {
  const doc = await crearPdf();
  dibujarPortada(doc, portada, entradas.length);
  const paginasIndice = dibujarIndice(doc, entradas);
  const paginas = doc.getNumberOfPages();
  if (paginas !== 1 + paginasIndice) {
    throw new Error(`anejo: la portada y el índice ocupan ${paginas} páginas y el plan preveía ${1 + paginasIndice}`);
  }
  return { blob: doc.output('blob'), paginas, paginasIndice };
}
