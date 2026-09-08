/**
 * El error de montar el anejo. Vive aparte para que la pantalla pueda
 * reconocerlo con `instanceof` sin cargar el montaje (`generar.ts` entra por
 * `import()` y arrastra pdf-lib y jsPDF; esto no arrastra nada).
 */

export type MotivoErrorAnejo =
  /** Nada marcado para incluir. La pantalla no llama así: el botón está deshabilitado con su porqué. */
  | 'vacio'
  /** El PDF de la pieza no está en esta máquina (obra traída de otra, o datos del sitio borrados). */
  | 'sin-pdf'
  /** El PDF guardado no se puede abrir. */
  | 'ilegible'
  /** Un número del índice no apunta a la página real de la pieza. Se aborta: nunca se entrega un índice mal. */
  | 'indice';

export class ErrorDeAnejo extends Error {
  readonly motivo: MotivoErrorAnejo;
  /** La pieza culpable, para pintar su fila en rojo con su salida; `null` si el fallo no es de ninguna. */
  readonly piezaId: string | null;

  constructor(motivo: MotivoErrorAnejo, piezaId: string | null, mensaje: string, causa?: unknown) {
    super(mensaje, causa === undefined ? undefined : { cause: causa });
    this.name = 'ErrorDeAnejo';
    this.motivo = motivo;
    this.piezaId = piezaId;
  }
}
