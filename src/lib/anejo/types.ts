/**
 * El anejo de cálculo: qué es una pieza y qué declara cada módulo para entrar.
 *
 * Una PIEZA es un PDF que el usuario ya vio en pantalla —el mismo que descarga
 * «Exportar»— congelado con sus metadatos. No se regenera nunca: por eso el
 * anejo no puede llevar números distintos a los de la pantalla, y por eso
 * «RECALCULAR» significa exactamente «este PDF es de antes de que cambiaras el
 * cálculo». Los bytes viven en IndexedDB (`blobs.ts`) bajo `blobId`; el índice
 * de piezas es la clave de proyecto `concreta-anejo`, ligera, que viaja en el
 * `.concreta` como cualquier otra. Los bytes NO viajan: en otra máquina la
 * pieza aparece sin su PDF y la pantalla pide volver a guardarla.
 */

import type { EntradaProyecto } from '../../data/proyectoKeys';

/**
 * A qué sección del anejo va lo que produce el módulo:
 *
 *  - `memoria`  capítulo de la MEMORIA JUSTIFICATIVA, uno por obra: guardar
 *               otra vez REEMPLAZA el capítulo (cuadro de materiales, viento y
 *               nieve, cargas por planta, acción sísmica, ficha DB SE).
 *  - `piezas`   CÁLCULOS DE PIEZA: cada «Guardar en el anejo» AÑADE una pieza
 *               (la viga V-3 y la V-4 son dos capítulos).
 */
export type SeccionAnejo = 'memoria' | 'piezas';

export interface Pieza {
  /** Identidad de la pieza dentro del anejo. */
  id: string;
  /** `moduleRegistry.key` del módulo que la produjo ('concreta-rc-beams'). */
  modulo: string;
  /** Clave de estado del módulo en el momento de guardar (`entrada.clave`). */
  clave: string;
  /** Lo que el usuario tecleó como título del documento, o el rótulo del capítulo. */
  titulo: string;
  /** ISO 8601 del momento en que se guardó. */
  ts: string;
  /** Versión de esquema viva del módulo al guardar. Si cambia, la pieza pasa a «recalcular». */
  esquema: string;
  /** Clave del PDF en IndexedDB. */
  blobId: string;
  /** Páginas del PDF, para el contador de la pantalla y el índice del documento. */
  paginas: number;
  /**
   * Huella del estado del módulo al guardar (`huellaDeModulo`), o `null` si el
   * módulo no tenía nada guardado. Se compara con la huella actual para decidir
   * «AL DÍA» / «RECALCULAR». No está en el boceto del design doc: es lo que hace
   * calculable el ámbar.
   */
  huella: string | null;
  /** Casilla «incluir» de la pantalla del anejo. Nace en `true`. */
  incluida: boolean;
}

export interface AnejoFile {
  v: 1;
  /** En el orden del documento: la numeración de capítulos se deriva de aquí. */
  piezas: Pieza[];
}

/**
 * Lo que cada módulo declara para entrar en el anejo, en UN fichero de
 * `src/lib/anejo/modules/`. Espejo de `src/lib/ai/modules/`: meter un módulo
 * nuevo es escribir un adaptador, y si falta un campo no compila.
 *
 * Tras el giro del blob (design doc, «El giro») el adaptador no dibuja nada ni
 * conoce figuras: el PDF ya existe cuando se guarda.
 */
export interface AdaptadorAnejo {
  /** `moduleRegistry.key`. */
  modulo: string;
  seccion: SeccionAnejo;
  /** Rótulo del capítulo en el índice del anejo: «Vigas de hormigón». */
  capitulo: string;
  /** Su fila de `CLAVES_PROYECTO`: clave, clave de versión, esquema, versión viva y satélites. */
  entrada: EntradaProyecto;
  /** El título que el módulo tiene guardado ahora mismo (`title` del estado o su satélite `*-title`), o `null`. */
  tituloGuardado(): string | null;
}
