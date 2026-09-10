/**
 * El anejo de cálculo: qué es una pieza y qué declara cada módulo para entrar.
 *
 * Una PIEZA es un CÁLCULO: el PDF que el usuario vio en pantalla —el mismo que
 * descarga «Exportar»— MÁS los datos con los que se hizo. Los dos entran
 * juntos y salen juntos, así que una pieza no puede contradecirse a sí misma.
 *
 * El PDF sigue sin regenerarse nunca por su cuenta: sale del exportador de
 * siempre, con el módulo en pantalla y pasando por la previsualización. Por
 * eso el anejo no puede llevar números distintos a los que se vieron. Lo que
 * los datos añaden es el camino de vuelta: pinchar una pieza la abre en su
 * módulo tal como se calculó, y volver a guardar actualiza ese capítulo.
 *
 * Dos almacenes. Los bytes del PDF viven en IndexedDB (`blobs.ts`) bajo
 * `blobId`; el índice de piezas —con los datos dentro— es la clave de proyecto
 * `concreta-anejo`, que viaja en el `.concreta` como cualquier otra. Los bytes
 * NO viajan, los datos SÍ: en otra máquina la pieza aparece sin su PDF, pero
 * se puede abrir en su módulo y volver a exportarla.
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
  /**
   * El estado del módulo con el que se hizo el PDF, clave por clave y en
   * crudo: la principal, sus satélites que no son sobres publicados —el
   * nombre del documento, el suelo de micropilotes— y la clave de versión de
   * esquema. Restaurar es volver a escribir esto tal cual; el anejo no sabe
   * ni tiene que saber qué hay dentro.
   *
   * `null` en las piezas guardadas antes de esta versión, que sólo tienen
   * PDF (`adoptarDatosDeModulos` recupera las que se pueda).
   *
   * Los sobres `concreta-pub-*` se quedan fuera a propósito: son derivados, y
   * reescribir uno al abrir una pieza cambiaría lo que ven OTROS módulos.
   * Como los cinco módulos que publican son exactamente los cinco de
   * `memoria`, y los de memoria no se restauran, no llega a poder pasar.
   */
  datos: Record<string, string> | null;
  /**
   * Si el PDF lleva arriba la banda del título, que es lo que hace repintable
   * el nombre al renombrar el capítulo.
   *
   * `false` cuando se exportó con el nombre vacío: entonces el H1 lo ocupa el
   * rótulo del módulo, no existe la línea de subtítulo, y meter un nombre
   * bajaría 5,5 mm todo el contenido de la página —eso ya no es repintar, es
   * rehacer el PDF—. `false` también en las piezas de antes de esta versión,
   * donde no hay manera de saberlo.
   */
  tituloEnPdf: boolean;
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
