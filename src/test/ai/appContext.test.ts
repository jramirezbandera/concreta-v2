// Tests del bloque "SOBRE LA APLICACIÓN" del system prompt (appContext.ts):
//   - cabecera presente;
//   - listado de módulos DERIVADO de moduleRegistry (grupos en el orden de
//     aparición, labels de las entradas shipped) — sin literales frágiles, para
//     que el bloque nunca se desactualice cuando se publique un módulo nuevo;
//   - los módulos NO publicados (shipped: false) no aparecen;
//   - textos REALES de la interfaz ("Rellenar con IA", "Exportar PDF",
//     "Copiar enlace"…), que son los que el usuario ve y por los que pregunta;
//   - reglas de alcance (no inventar UI, no cambiar de módulo, menú lateral);
//   - APP_CONTEXT_BLOCK es la constante de módulo = buildAppContextBlock().

import { describe, it, expect } from 'vitest';
import { APP_CONTEXT_BLOCK, buildAppContextBlock } from '../../lib/ai/appContext';
import { moduleRegistry } from '../../data/moduleRegistry';

const shipped = moduleRegistry.filter((m) => m.shipped);
const unshipped = moduleRegistry.filter((m) => !m.shipped);

/** Grupos en el orden de aparición en el registro, con sus labels shipped. */
function expectedGroups(): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const m of shipped) {
    const labels = groups.get(m.group);
    if (labels) labels.push(m.label);
    else groups.set(m.group, [m.label]);
  }
  return groups;
}

describe('buildAppContextBlock — cabecera y encuadre', () => {
  it('abre con la cabecera SOBRE LA APLICACIÓN', () => {
    expect(buildAppContextBlock()).toContain('SOBRE LA APLICACIÓN (Concreta):');
  });

  it('describe la app: CE + CTE, módulo = formulario independiente, cálculo en el navegador', () => {
    const block = buildAppContextBlock();
    expect(block).toContain('Código Estructural');
    expect(block).toContain('CTE');
    expect(block).toMatch(/módulo es un formulario independiente/i);
    expect(block).toMatch(/navegador/i);
  });
});

describe('buildAppContextBlock — listado de módulos (derivado del registro)', () => {
  it('lista cada grupo con sus labels shipped, en el orden del registro', () => {
    const block = buildAppContextBlock();
    for (const [group, labels] of expectedGroups()) {
      expect(block).toContain(`- ${group}: ${labels.join(', ')}`);
    }
  });

  it('los grupos aparecen en el orden de aparición del registro', () => {
    const block = buildAppContextBlock();
    const positions = [...expectedGroups().keys()].map((g) => block.indexOf(`- ${g}:`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('menciona que lo que no está en la lista no existe todavía', () => {
    expect(buildAppContextBlock()).toMatch(/no est[ée] en esta lista NO existe todav[ií]a/i);
  });

  it('no incluye labels de módulos no publicados (shipped: false)', () => {
    const block = buildAppContextBlock();
    if (unshipped.length === 0) {
      // Hoy TODOS los módulos del registro están publicados: el listado del
      // bloque es exactamente el registro completo.
      expect(shipped).toHaveLength(moduleRegistry.length);
      return;
    }
    // Un label puede repetirse entre grupos ("Vigas"): solo se puede afirmar la
    // ausencia de los que no comparte ningún módulo publicado.
    const shippedLabels = new Set(shipped.map((m) => m.label));
    const exclusive = unshipped.map((m) => m.label).filter((l) => !shippedLabels.has(l));
    for (const label of exclusive) expect(block).not.toContain(label);
    // Y ningún grupo compuesto SOLO por módulos no publicados aparece.
    const shippedGroups = new Set(shipped.map((m) => m.group));
    for (const m of unshipped) {
      if (!shippedGroups.has(m.group)) expect(block).not.toContain(`- ${m.group}:`);
    }
  });
});

describe('buildAppContextBlock — interfaz real', () => {
  it('nombra los botones con su texto EXACTO', () => {
    const block = buildAppContextBlock();
    expect(block).toContain('Rellenar con IA');
    expect(block).toContain('Exportar PDF');
    expect(block).toContain('Copiar enlace');
    expect(block).toContain('Restablecer valores');
    expect(block).toContain('Calculadora');
  });

  it('explica el conmutador de unidades y el recálculo automático de resultados', () => {
    const block = buildAppContextBlock();
    expect(block).toMatch(/unidades/i);
    expect(block).toContain('kg/cm²');
    expect(block).toMatch(/se recalculan solos/i);
    expect(block).toContain('Resultados');
  });

  it('recoge los hechos técnicos que pregunta el usuario (datos locales, offline, API key)', () => {
    const block = buildAppContextBlock();
    expect(block).toMatch(/no hay cuenta ni servidor/i);
    expect(block).toMatch(/sin conexión, salvo este asistente/i);
    expect(block).toMatch(/API key/i);
    expect(block).toMatch(/Concreta no los almacena/i);
  });
});

describe('buildAppContextBlock — reglas de alcance', () => {
  it('prohíbe inventarse la interfaz', () => {
    const block = buildAppContextBlock();
    expect(block).toMatch(/no te inventes/i);
    expect(block).toMatch(/pantallas, menús, botones ni funciones/i);
  });

  it('limita el relleno al módulo actual y remite al menú lateral', () => {
    const block = buildAppContextBlock();
    expect(block).toMatch(/solo puedes rellenar el formulario del MÓDULO ACTUAL/i);
    expect(block).toMatch(/menú lateral/i);
    expect(block).toMatch(/no puedes cambiar de módulo/i);
  });

  it('mantiene abiertas las dudas de normativa (con proposal = null)', () => {
    const block = buildAppContextBlock();
    expect(block).toMatch(/normativa/i);
    expect(block).toContain('proposal = null');
  });
});

describe('APP_CONTEXT_BLOCK', () => {
  it('es el resultado de buildAppContextBlock() evaluado a nivel de módulo', () => {
    expect(APP_CONTEXT_BLOCK).toBe(buildAppContextBlock());
  });

  it('es una constante no vacía y compacta (viaja en cada petición)', () => {
    expect(APP_CONTEXT_BLOCK.length).toBeGreaterThan(0);
    expect(APP_CONTEXT_BLOCK.length).toBeLessThan(2600); // ~250 tokens de holgura
  });
});
