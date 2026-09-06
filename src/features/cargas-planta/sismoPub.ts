/**
 * El sismo que publica el módulo NCSE-02, leído como consumidor.
 *
 * Hermano de `nievePub.ts`, con una diferencia: la nieve se COPIA al estado del
 * módulo —se congela con su fecha, porque es un número que entra en la suma de
 * cargas y tiene que poder auditarse— y el sismo no. El sismo sólo se rotula en
 * el cuadro del plano, no interviene en ninguna cuenta de este módulo, así que
 * se lee del sobre cada vez y no se guarda: lo que se imprime es siempre lo
 * último publicado, y no hay dos versiones que puedan discrepar.
 *
 * La vida útil no es dato del módulo de sismo: vive en el cuadro de materiales
 * y viene de SU publicación (`concreta-pub-materiales`). El cuadro del plano la
 * enseña en la ficha del sismo porque es donde la pide el estudio, no porque la
 * calcule la NCSE-02.
 */

import type { ResumenSismoPlano } from '../../lib/acciones/cuadrosCargas';
import { leerPublicacion } from '../../lib/pub';
import {
  MODULO_PUB as MODULO_MATERIALES,
  PUB_VERSION as PUB_VERSION_MATERIALES,
  type PubMateriales,
} from '../materiales/state';
import {
  MODULO_PUB as MODULO_SISMO,
  PUB_VERSION as PUB_VERSION_SISMO,
  type PubSismo,
} from '../seismic-ncse02/state';

/** La vida útil declarada en el cuadro de materiales, si lo hay publicado. */
function vidaUtilPublicada(): number | undefined {
  const sobre = leerPublicacion<PubMateriales>(MODULO_MATERIALES, PUB_VERSION_MATERIALES);
  return sobre?.datos?.vidaUtilAnios;
}

/** Provincia de un INE, que puede venir con cinco dígitos o con dos. */
const provinciaDe = (ine: string | null) => (ine && ine.length >= 2 ? ine.slice(0, 2) : null);

/**
 * El bloque de sismo del cuadro del plano. `null` cuando no hay publicación —el
 * cuadro lo dice, igual que con el viento— y también cuando la que hay es de
 * OTRA obra.
 *
 * Ese segundo filtro no es celo: el módulo de sismo arranca con un caso de
 * ejemplo completo en Granada (ab = 0,23 g), y sin él bastaría con haberlo
 * abierto una vez para que el plano de una obra en Ávila declarase la
 * aceleración de Granada. Es exactamente el dato fantasma para el que `lib/pub`
 * mete la obra en el sobre. Se compara por PROVINCIA porque es lo que gobierna
 * la peligrosidad sísmica a esta escala, y sólo cuando las dos partes la
 * conocen: sin obra que comparar no hay discrepancia que demostrar, y un dato
 * fechado vale más que ninguno.
 *
 * @param provinciaObra INE de dos dígitos de la obra del cuadro; '' si no se ha
 *                      elegido.
 */
export function resumenSismoPublicado(provinciaObra = ''): ResumenSismoPlano | null {
  const sobre = leerPublicacion<PubSismo>(MODULO_SISMO, PUB_VERSION_SISMO);
  const d = sobre?.datos;
  if (!d) return null;
  const provinciaSobre = provinciaDe(d.ine ?? sobre.obra.ine);
  if (provinciaObra && provinciaSobre && provinciaSobre !== provinciaObra) return null;
  return {
    ac: d.ac,
    K: d.K,
    mu: d.mu,
    ...(d.ductilidad ? { ductilidad: d.ductilidad } : {}),
    ...(vidaUtilPublicada() !== undefined ? { vidaUtil: vidaUtilPublicada() } : {}),
    obligatoria: d.obligatoria,
    // Con la Norma no obligatoria, el impedimento ES el motivo de la exención y
    // ya viene redactado y con su artículo desde el módulo de sismo. Con la
    // Norma obligatoria puede haber impedimento igualmente (falta un dato, el
    // método simplificado no vale), pero eso no exime de nada y no se rotula en
    // el plano: lo que el cuadro no puede decir es «exento» sin decir por qué.
    ...(!d.obligatoria && d.impedimento ? { exencion: d.impedimento.texto } : {}),
  };
}
