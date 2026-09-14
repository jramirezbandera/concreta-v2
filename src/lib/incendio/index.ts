/**
 * Resistencia al fuego de la estructura — motor (CTE DB SI 6).
 *
 * El capítulo del fuego, que hasta el 2026-09-13 era un bloque pequeño dentro
 * del cuadro de materiales: una tabla de «ámbito → R» tecleada a mano que sólo
 * servía para imprimir dos frases. Aquí vive ya como lo que es —las exigencias
 * del SI 6, el tiempo equivalente del Anejo B y las tablas de los anejos C y
 * D— y el cuadro de materiales se limita a imprimir lo que este módulo publica.
 *
 * Barrel propio y NO `lib/acciones`: aquel está rotulado «acciones climáticas
 * del DB SE-AE», y el fuego no es una acción sino una exigencia de resistencia
 * en situación accidental. Además chocarían los nombres: `lib/acciones`
 * exporta ya `TABLA_3_1` (las sobrecargas de uso del DB SE-AE) y el DB SI
 * tiene SU tabla 3.1, que es otra cosa.
 *
 * REGLA DE IMPORTACIÓN: `lib/materiales/*` y `lib/memoria/*` importan de las
 * HOJAS (`../incendio/notas`, `../incendio/exigencias`), nunca de este barrel.
 * `lib/materiales/cuadros.ts` re-exporta `Block` y lo importan veintitantos
 * ficheros; colar el barrel por ahí metería los anejos B, C y D en todos los
 * chunks de la app. Este barrel es para el módulo (`features/incendio`) y para
 * sus tests.
 */

export * from './exigencias';
export * from './notas';
