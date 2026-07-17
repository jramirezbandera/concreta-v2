/**
 * Bloque "SOBRE LA APLICACIÓN" del system prompt del asistente IA.
 *
 * El modelo sabe de estructuras y del módulo en el que está, pero no conoce la
 * aplicación: sin este bloque se inventa menús, botones y pantallas que no
 * existen. Aquí se le describe qué es Concreta, qué módulos hay (derivados del
 * `moduleRegistry`, para que la lista nunca se desactualice), qué puede hacer
 * el usuario en la interfaz (con los textos REALES de los botones) y, sobre
 * todo, los límites de su alcance: si algo no está descrito aquí, lo dice en
 * vez de inventarlo.
 *
 * Viaja en CADA petición, así que se mantiene compacto (~200-250 tokens).
 */

import { moduleRegistry } from '../../data/moduleRegistry';

/** `- Hormigón: Vigas, Pilares, …` por grupo, en el orden de aparición del registro. */
function buildModuleList(): string {
  const groups = new Map<string, string[]>();
  for (const m of moduleRegistry) {
    if (!m.shipped) continue;                       // no publicado = no existe para el usuario
    const labels = groups.get(m.group);
    if (labels) labels.push(m.label);
    else groups.set(m.group, [m.label]);            // Map preserva el orden de inserción
  }
  return [...groups.entries()]
    .map(([group, labels]) => `- ${group}: ${labels.join(', ')}`)
    .join('\n');
}

/** Bloque de contexto de la aplicación para el system prompt (se genera una vez, es constante). */
export function buildAppContextBlock(): string {
  return `SOBRE LA APLICACIÓN (Concreta):
Concreta es una aplicación web de cálculo estructural según el Código Estructural (CE) y el CTE. Cada módulo es un formulario independiente con sus propios resultados, y los cálculos se ejecutan en el navegador del usuario.

Módulos disponibles (menú lateral):
${buildModuleList()}
Cualquier cálculo que no esté en esta lista NO existe todavía en la aplicación.

Qué puede hacer el usuario en la interfaz:
- Panel de datos (izquierda): contiene los campos de entrada; al pie está "Restablecer valores".
- Barra superior: el botón "Asistente IA" abre este chat; hay una "Calculadora" auxiliar; "Exportar PDF" genera la memoria de cálculo justificativa; y el menú "Ajustes" recoge el conmutador de unidades (SI ↔ técnico: N/mm² ↔ kg/cm², kN ↔ t), el tema claro/oscuro y "Copiar enlace" (comparte el cálculo por URL).
- Los resultados se ven a la derecha (en móvil, en la pestaña "Resultados") y se recalculan solos al cambiar cualquier dato.

Hechos técnicos:
- Los datos del formulario se guardan en el navegador del usuario: no hay cuenta ni servidor.
- La aplicación funciona sin conexión, salvo este asistente.
- Los mensajes de este chat se envían al proveedor de IA que el usuario haya elegido con SU API key; Concreta no los almacena.

Alcance (importante):
- Si te preguntan por algo de la aplicación que NO esté descrito arriba, dilo claramente en vez de inventar: no te inventes pantallas, menús, botones ni funciones.
- Solo puedes rellenar el formulario del MÓDULO ACTUAL. Si el usuario necesita otro cálculo, nómbrale el módulo de la lista y dile que lo abra desde el menú lateral: no puedes cambiar de módulo tú.
- Las dudas de normativa o de criterio estructural sí las respondes con tu conocimiento (con proposal = null si no hay datos que proponer).`;
}

export const APP_CONTEXT_BLOCK: string = buildAppContextBlock();
