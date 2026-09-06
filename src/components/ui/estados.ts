/**
 * Los tintes de fondo de los cuatro estados de un campo del capítulo Memorias
 * (ver `lib/memoria/model.ts`): rojo para el hueco, ámbar para lo heredado o
 * por revisar. El azul del derivado y el normal del confirmado no tiñen.
 *
 * Nacieron en `features/viento-nieve/estilos.ts` (`HUECO`) y aquí los
 * comparten Viento y nieve y la ficha DB SE.
 */

/** Tinte de un hueco sin resolver: bloquea publicar y exportar. */
export const HUECO = { background: 'color-mix(in srgb, var(--color-state-fail) 8%, transparent)' } as const;

/** Tinte de un valor heredado de la obra anterior o tomado de una publicación que ha cambiado: hay que revisarlo. */
export const AMBAR = { background: 'color-mix(in srgb, var(--color-state-warn) 9%, transparent)' } as const;
