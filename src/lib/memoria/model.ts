/**
 * El modelo del capítulo Memorias: los bloques de documento y los estados de
 * un valor de la ficha.
 *
 * `Block[]` es la frontera testeable del capítulo: un array plano de bloques
 * que luego pintan cinco renderers distintos —React en pantalla, .docx, .pdf,
 * .xlsx y .dxf— sin que ninguno tenga que volver a decidir qué dice el
 * documento. Nació en `lib/materiales/cuadros.ts` con el cuadro de materiales,
 * el primer módulo que lo necesitó, y se mudó aquí con la ficha DB SE, que es
 * el segundo y el que lo comparte con Cargas por planta y Viento y nieve.
 * `cuadros.ts` lo re-exporta: los veintidós ficheros que lo importan de allí
 * siguen valiendo.
 *
 * Lo que un bloque NO puede expresar, a propósito: énfasis dentro de un texto,
 * casillas, celdas combinadas, saltos de página. Cada renderer decide la
 * negrita por posición (cabecera y columna de etiquetas), y una casilla se
 * escribe con palabras («Procede» / «No procede»): en el PDF un glifo que la
 * fuente no tiene sale INVISIBLE, no como interrogante.
 */

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'kvTable'; caption?: string; rows: [string, string][] }
  | { kind: 'table'; caption?: string; head: string[]; rows: string[][] }
  | { kind: 'notes'; items: string[] };

// ── Estados de un valor de la ficha ─────────────────────────────────────────

/**
 * Los cuatro estados del diseño de Memorias, más «revisar», que es el ámbar de
 * lo tomado de una publicación:
 *
 *  - `falta`    rojo: sin valor. Bloquea exportar.
 *  - `heredado` ámbar: valor de la obra anterior sin confirmar. Bloquea.
 *  - `revisar`  ámbar: tomado de una publicación que ha cambiado desde que se
 *               tomó, o que es de otra obra. Bloquea.
 *  - `derivado` azul: lo puso la norma o una publicación. No bloquea.
 *  - `ok`       normal: tecleado o confirmado en esta obra. No bloquea.
 */
export type Estado = 'falta' | 'heredado' | 'revisar' | 'derivado' | 'ok';

/** De dónde sale un valor, para rotularlo en pantalla («Viento y nieve · 6/9/2026»). */
export type Origen =
  | 'tecleado'
  | 'heredado'
  | 'estudio'
  | 'norma'
  | 'obra'
  | 'materiales'
  | 'viento-nieve'
  | 'cargas-planta'
  | 'sismo';

export interface Valor<T> {
  /** `null` cuando falta. */
  valor: T | null;
  estado: Estado;
  origen: Origen;
  /** Una línea para el chip de origen o la nota al pie («zona de la capital; la provincia tiene frontera»). */
  nota?: string;
  /**
   * Los tres que convierten un valor en HUECO cuando su estado bloquea: la ruta
   * del campo (`obra.geotecnia.empresa`, `pub.materiales`), su etiqueta en
   * lenguaje de obra y el apartado donde se imprime. Un derivado no los lleva.
   */
  id?: string;
  etiqueta?: string;
  apartado?: ApartadoId;
}

/** Sí cuando el estado impide exportar. */
export function bloquea(estado: Estado): boolean {
  return estado === 'falta' || estado === 'heredado' || estado === 'revisar';
}

/** Identificador de apartado de la ficha, en el orden del documento. */
export type ApartadoId =
  | 'indice'
  | 'se'
  | 'seae'
  | 'sec'
  | 'ncse'
  | 'ce'
  | 'forjados'
  | 'sea'
  | 'sef'
  | 'sem';

/** Lo que el usuario tiene que resolver antes de exportar, en orden de documento. */
export interface Hueco {
  /** Ruta con puntos: `obra.geotecnia.empresa`, `pub.materiales`, `obra.forjados.reticular-30.intereje`. */
  id: string;
  apartado: ApartadoId;
  /** En lenguaje de obra, para la cola y el contador. */
  etiqueta: string;
  estado: Exclude<Estado, 'derivado' | 'ok'>;
  /** Qué botón lo resuelve. */
  accion: 'teclear' | 'confirmar' | 'usarPublicado' | 'publicarModulo';
}
