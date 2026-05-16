// Auto-narrative for RC beam section mode 'simple' (autoplan CEO HIGH).
//
// Genera una frase única interpretativa bajo los diagramas que explica
// "cómo trabaja la sección" en el caso particular. Convierte el viewer
// table-stakes en un evidence-pack tile.

import { type SectionAtMomentResult } from '../../lib/calculations/rcBeamsSection';

export function buildSectionNarrative(r: SectionAtMomentResult, MRd: number): string {
  // Casos degenerados primero
  if (r.mode === 'zero') {
    return 'Sección descargada. Strains y fuerzas movilizadas son cero.';
  }
  if (r.mode === 'over-capacity') {
    return `Md supera MRd: la sección NO resiste el momento aplicado. Diagrama muestra el estado al límite (ε hormigón = ε_cu, concreto crushed).`;
  }
  if (r.mode === 'uncracked') {
    return 'Sección NO fisurada. Md < Mcrit: el hormigón sigue trabajando elásticamente, fibra neutra al centroide bruto (h/2).';
  }

  // Régimen fisurado: caracterizar el estado del acero y la utilización.
  const utilization = MRd > 0 ? r.M / MRd : 0;
  const pct = (utilization * 100).toFixed(0);

  let stateLine: string;
  if (r.steelYielded_tens && r.concreteCrushed) {
    stateLine = 'sección al ELU (acero tracción yielded + hormigón crushed). Estado de capacidad última';
  } else if (r.steelYielded_tens) {
    stateLine = 'acero a tracción yielded (rótula plástica iniciada). Hormigón aún elástico';
  } else if (Math.abs(r.epsilon_s_tens) > 0.0001) {
    stateLine = 'acero a tracción trabajando elásticamente. Régimen lineal-cracked';
  } else {
    stateLine = 'sección apenas trabajando';
  }

  // As' compresión: cuánto colabora?
  let compLine = '';
  if (Math.abs(r.F_s_comp) < 5) {
    compLine = " As' apenas trabaja.";
  } else if (r.steelYielded_comp) {
    compLine = " As' compresión yielded.";
  }

  return `Sección al ${pct}% de capacidad: ${stateLine}.${compLine}`;
}
