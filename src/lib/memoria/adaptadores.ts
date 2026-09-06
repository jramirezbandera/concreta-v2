/**
 * De lo que publica el cuadro de materiales a lo que piden sus propios cuadros.
 *
 * `cuadroAceroEstructural`, `cuadroMadera`, `cuadroDurabilidadMadera` y
 * `cuadroCoeficientesMinoracion` (`lib/materiales/cuadros.ts`) reciben la
 * DERIVACIÓN interna del motor de materiales, no su publicación. Pero leen de
 * ella exactamente los campos que `PubAceroEstructural` y `PubMadera`
 * transportan —la publicación viaja ya derivada a propósito—, así que la ficha
 * los reutiliza tal cual con estos dos adaptadores, en vez de escribir cuatro
 * cuadros gemelos que un día dirían cosas distintas del mismo acero.
 *
 * Lo que la publicación no lleva y la derivación sí: los mensajes y trazas del
 * motor (van vacíos: son la conversación de aquel módulo con su usuario), la
 * exigencia de penetración en texto (sale de la misma tabla 3.1 del DB SE-M
 * que usó el motor) y el `id` de grupo (aquí, su índice).
 *
 * El hormigón NO se adapta: la ficha colegial lo imprime en un formato propio
 * —una tabla vertical por hormigón: tipificación, cemento, árido, a/c, cemento
 * mínimo, fck, acero, fyk, ubicación— y fabricar una `DerivacionHormigon`
 * entera para alimentar otro cuadro sería un objeto mentira.
 */

import { PROTECCION_POR_CLASE_USO, SITUACION_MADERA } from '../materiales/tablasMadera';
import type { DerivacionAcero, DerivacionMadera, SituacionMadera } from '../materiales/types';
import type { PubAceroEstructural, PubMadera } from '../../features/materiales/state';

export function aceroDesdePub(p: PubAceroEstructural): DerivacionAcero {
  return {
    nivelRiesgo: p.nivelRiesgo,
    categoriaUso: p.categoriaUso,
    categoriaEjecucionDeclarada: p.categoriaEjecucionDeclarada,
    categoriaEjecucion: p.categoriaEjecucion,
    claseEjecucion: p.claseEjecucion,
    elementos: p.elementos.map((e, i) => ({
      id: String(i),
      nombre: e.nombre,
      designacion: e.designacion,
      union: e.union,
      caracteristicasUnion: e.caracteristicasUnion,
      corrosividad: e.corrosividad,
      proteccion: e.proteccion,
      caracteristicasProteccion: e.caracteristicasProteccion,
    })),
    mensajes: [],
    trazas: [],
  };
}

/**
 * La situación no viaja en la publicación (es la pregunta de obra del cuadro
 * de materiales); se recupera de la pareja clase de servicio + clase de uso
 * que sí viaja, que es lo único que los cuadros leen de ella.
 */
function situacionDe(claseServicio: number, claseUso: string): SituacionMadera {
  const par = (Object.entries(SITUACION_MADERA) as [SituacionMadera, { claseServicio: number; claseUso: string }][]).find(
    ([, v]) => v.claseServicio === claseServicio && v.claseUso === claseUso,
  );
  return par ? par[0] : 'interior';
}

export function maderaDesdePub(p: PubMadera): DerivacionMadera[] {
  return p.grupos.map((g, i) => ({
    grupo: {
      id: String(i),
      nombre: g.nombre,
      situacion: situacionDe(g.claseServicio, g.claseUso),
      tipo: g.tipo,
      claseResistente: g.claseResistente,
      ...(g.especie !== null ? { especie: g.especie } : {}),
      ...(g.claseLaminas !== null ? { claseLaminas: g.claseLaminas } : {}),
    },
    claseServicio: g.claseServicio,
    claseServicioForzada: false,
    claseUso: g.claseUso,
    nivelPenetracion: g.nivelPenetracion,
    exigenciaPenetracion: PROTECCION_POR_CLASE_USO[g.claseUso].exigencia,
    gammaM: g.gammaM,
    gammaMExtraordinaria: p.gammaMExtraordinaria,
    proteccionHerrajes: g.proteccionHerrajes,
    ...(g.calidad !== null ? { calidad: g.calidad } : {}),
    notas: [],
    mensajes: [],
    trazas: [],
  }));
}
