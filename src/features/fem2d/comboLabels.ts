// FEM 2D — copia en español del selector de combinaciones (capa de UI).
//
// checks.ts emite ESTRUCTURA (Fem2DComboView: grupo, principal, factores); aquí
// se deriva el texto (decisión 2B/C7 — nada de español dentro del motor). La
// etiqueta usa `formatCombo` VERBATIM (4C): la cadena del desplegable es idéntica
// carácter por carácter a la que la ficha atribuye a cada demanda gobernante
// ("1.35·G + 1.50·Q" arriba, "gobierna 1.35·G + 1.50·Q" abajo). Sin traducción
// mental, sin un segundo formateador que pueda divergir.

import { formatCombo, type Fem2DComboView } from './checks';
import { lcOptionLabel } from '../../lib/text/loadCases';

/** Tipo de combinación concreta, para el prefijo "<tipo> · <fórmula>". */
function comboKind(v: Fem2DComboView): 'ELU' | 'ELU permanente' | 'ELS característica' | 'ELS cuasi-permanente' {
  if (v.id === 'eluperm:G') return 'ELU permanente';
  if (v.id === 'els_cp') return 'ELS cuasi-permanente';
  if (v.group === 'ELS' || v.id === 'env:ELS_c') return 'ELS característica';
  return 'ELU';
}

/**
 * Optgroup bajo el que se lista la vista. Una envolvente COLAPSADA (único combo
 * del grupo) baja al grupo de combinaciones: en ese modelo ella ES esa
 * combinación, no una envoltura de varias. Las envolventes reales quedan arriba.
 */
export function comboOptgroupLabel(v: Fem2DComboView): string {
  if (v.group === 'hypothesis') return 'Hipótesis simples';
  if (v.group === 'envelope' && !v.collapsed) return 'Envolventes';
  return comboKind(v).startsWith('ELU') ? 'Combinaciones ELU' : 'Combinaciones ELS';
}

/**
 * Etiqueta del `<option>`. El prefijo de tipo se conserva SIEMPRE (incluso en
 * las combinaciones ELU, que en el desplegable abierto ya viven bajo su
 * optgroup) para que el `<select>` CERRADO, que muestra sólo el texto de la
 * opción sin su grupo, siga diciendo si es ELU o ELS.
 */
export function comboOptionLabel(v: Fem2DComboView): string {
  if (v.group === 'hypothesis' && v.lc) return lcOptionLabel(v.lc);
  if (v.group === 'envelope' && !v.collapsed) {
    return v.id === 'env:ELU' ? 'Envolvente ELU' : 'Envolvente ELS característica';
  }
  return `${comboKind(v)} · ${formatCombo(v.forceFactorSets[0])}`;
}

/**
 * Aviso al pie del lienzo, derivado del ESTADO de la vista (no del optgroup: una
 * env:ELU colapsada vive bajo «Combinaciones» y no puede decir "el veredicto es
 * el de la envolvente ELU", porque ella misma ES la envolvente). Cinco casos,
 * cuatro textos + null. El panel derecho no se mueve NUNCA: el aviso sólo explica
 * qué se está dibujando.
 */
export function comboNotice(v: Fem2DComboView): string | null {
  if (v.isEnvelope && !v.collapsed) return null; // envolvente real: nada que aclarar
  if (v.isEnvelope && v.collapsed) return 'Única combinación del grupo — es también la envolvente.';
  if (v.id === 'eluperm:G') return 'Duración permanente — fuera de la envolvente ELU (kmod 0.60, §3.1.3(2)).';
  if (v.group === 'hypothesis') return 'Hipótesis aislada — valores característicos sin mayorar (γ = 1).';
  return 'Vista de combinación — el veredicto sigue siendo el de los chequeos.';
}
