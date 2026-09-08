/**
 * Montar el anejo: portada, índice y las piezas, en un PDF con numeración
 * continua. Entra por `import()` desde la pantalla: arrastra jsPDF (la
 * portada y el índice) y pdf-lib (pegar y repintar), y sólo lo paga quien
 * pulsa «Generar anejo».
 *
 * El punto fijo de la paginación (design doc, F6): el índice desplaza las
 * páginas que numera, y su propia altura depende de cuántos capítulos tiene.
 * Se resuelve en este orden:
 *
 *   1. leer el PDF de cada pieza y CONTAR sus páginas de verdad (no fiarse de
 *      las que apuntó el índice al guardar);
 *   2. medir el índice sin dibujarlo (`planIndice`) y numerar los capítulos
 *      con ese desplazamiento;
 *   3. dibujar portada e índice;
 *   4. concatenar todo, marcando cada fila conforme entra;
 *   5. VERIFICAR que cada número del índice es la página real donde empieza
 *      la pieza en el documento montado (`verificarIndice`, T8). Si no
 *      cuadra, se aborta con la pieza culpable: un índice mal es un fallo
 *      mudo en un documento que se firma;
 *   6. una sola pasada final de pies, con la página global.
 */

import { titledFilename } from '../export/filename';
import type { Obra } from '../obra';
import { frenteDelAnejo } from '../pdf/anejo';
import { leerBlob } from './blobs';
import {
  blobDePdf,
  concatenarPdfs,
  contarPaginas,
  ErrorDeConcatenacion,
  repintarPies,
  type ParteConcatenada,
} from './concatenar';
import { ErrorDeAnejo } from './errores';
import { capitulosDe, entradasDe, planIndice, type EntradaIndice } from './maqueta';
import type { Pieza } from './types';

export { ErrorDeAnejo } from './errores';

/** El id de la parte que es la portada y el índice, en la concatenación. */
export const ID_FRENTE = 'portada-e-indice';
export const ANEJO_FALLBACK_PDF = 'anejo-de-calculo.pdf';

export interface PeticionAnejo {
  /** Las piezas del índice; entran las marcadas como incluidas, en el orden del documento. */
  piezas: readonly Pieza[];
  obra: Obra | null;
  /** Nombre de la obra en el menú (vacío si no hay obra guardada). */
  nombreObra: string;
  /** Versión de Concreta que firma la portada. Por defecto, la de la app. */
  version?: string;
  fecha?: Date;
  /** Se llama con el id de cada pieza conforme entra en el documento. */
  onParte?: (id: string) => void;
}

export interface AnejoGenerado {
  blob: Blob;
  filename: string;
  paginas: number;
  paginasIndice: number;
  entradas: EntradaIndice[];
}

export interface FalloDeIndice {
  entrada: EntradaIndice;
  /** Dónde está de verdad la pieza, o `null` si no ha entrado en el documento. */
  real: ParteConcatenada | null;
}

/**
 * Cada número del índice contra la página real de su pieza en el documento
 * montado. `null` si todo cuadra; si no, la primera entrada que no.
 */
export function verificarIndice(entradas: readonly EntradaIndice[], partes: readonly ParteConcatenada[]): FalloDeIndice | null {
  const porId = new Map(partes.map((p) => [p.id, p]));
  for (const entrada of entradas) {
    const real = porId.get(entrada.id) ?? null;
    if (!real || real.desde !== entrada.pagina || real.paginas !== entrada.paginas) return { entrada, real };
  }
  return null;
}

export async function generarAnejo(p: PeticionAnejo): Promise<AnejoGenerado> {
  const capitulos = capitulosDe(p.piezas);
  if (capitulos.length === 0) throw new ErrorDeAnejo('vacio', null, 'No hay ninguna pieza marcada para incluir.');

  // 1. Los PDF, y sus páginas de verdad.
  const partes: { id: string; blob: Blob; paginas: number }[] = [];
  for (const c of capitulos) {
    const blob = await leerBlob(c.pieza.blobId);
    if (!blob) throw new ErrorDeAnejo('sin-pdf', c.id, 'Falta el PDF guardado: vuelve a guardarla desde el módulo.');
    let paginas: number;
    try {
      paginas = await contarPaginas(blob);
    } catch (e) {
      throw new ErrorDeAnejo('ilegible', c.id, 'El PDF guardado no se puede leer: vuelve a guardarla desde el módulo.', e);
    }
    partes.push({ id: c.id, blob, paginas });
  }

  // 2. Medir el índice y numerar con su desplazamiento.
  const paginasIndice = planIndice(capitulos).paginas;
  const entradas = entradasDe(capitulos, new Map(partes.map((x) => [x.id, x.paginas])), 1 + paginasIndice + 1);

  // 3. Portada e índice.
  const nombre = p.nombreObra.trim();
  const frente = await frenteDelAnejo(
    { obra: p.obra, nombre, fecha: p.fecha ?? new Date(), version: p.version ?? __APP_VERSION__ },
    entradas,
  );
  if (frente.paginasIndice !== paginasIndice) {
    throw new ErrorDeAnejo(
      'indice',
      null,
      `El índice ocupa ${frente.paginasIndice} páginas y se habían previsto ${paginasIndice}.`,
    );
  }

  // 4. Concatenar, marcando cada fila conforme entra.
  const titulo = nombre ? `Anejo de cálculo — ${nombre}` : 'Anejo de cálculo';
  let montado;
  try {
    montado = await concatenarPdfs([{ id: ID_FRENTE, blob: frente.blob }, ...partes], {
      titulo,
      onParte: (id) => {
        if (id !== ID_FRENTE) p.onParte?.(id);
      },
    });
  } catch (e) {
    if (e instanceof ErrorDeConcatenacion) {
      throw new ErrorDeAnejo(
        'ilegible',
        e.parteId === ID_FRENTE ? null : e.parteId,
        e.parteId === ID_FRENTE ? 'No se pudo montar la portada y el índice.' : 'El PDF guardado no se puede leer: vuelve a guardarla desde el módulo.',
        e,
      );
    }
    throw e;
  }

  // 5. Verificar el índice contra las páginas reales (T8).
  const frenteReal = montado.partes.find((x) => x.id === ID_FRENTE);
  if (!frenteReal || frenteReal.paginas !== frente.paginas) {
    throw new ErrorDeAnejo('indice', null, 'La portada y el índice no ocupan las páginas previstas en el documento montado.');
  }
  const fallo = verificarIndice(entradas, montado.partes);
  if (fallo) {
    const { entrada, real } = fallo;
    throw new ErrorDeAnejo(
      'indice',
      entrada.id,
      real
        ? `El índice dice que «${entrada.titulo}» empieza en la página ${entrada.pagina} y en el documento empieza en la ${real.desde}.`
        : `«${entrada.titulo}» no ha entrado en el documento.`,
    );
  }

  // 6. Los pies, con la página global. La portada no lleva.
  const bytes = await repintarPies(montado.bytes, {
    izquierda: nombre ? `Concreta · ${nombre}` : 'Concreta',
    derecha: (pagina, total) => `Anejo de cálculo · pág. ${pagina}/${total}`,
    desde: 2,
  });

  return {
    blob: blobDePdf(bytes),
    filename: titledFilename(nombre ? `Anejo de cálculo ${nombre}` : '', ANEJO_FALLBACK_PDF),
    paginas: montado.paginas,
    paginasIndice,
    entradas,
  };
}
