// Los DOS lectores de `result.section` en vigas de acero, con un tubo de
// CLASE 4.
//
// Poblar la sección en la rama de clase 4 (prerrequisito del bloque de
// propiedades) cambia lo que ven estos dos, y a mejor: hasta ahora `section` y
// `profile` eran ambos `undefined` en ese camino, así que
//   · el PDF caía al fallback `${tipo} ${size}` — en un tubo, basura: los
//     tubos se definen con chs_D/chs_t y NO usan `size`;
//   · el SVG dejaba el panel de sección (y la figura embebida del PDF) vacío.
// Arreglo latente, no regresión — pero es cambio de comportamiento y va con
// test propio. Los fixtures byte-estables no lo ven: sus casos por defecto son
// perfiles en I válidos que no pasan por esta rama.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { resetProbe, texts } from '../pdf/layoutProbe';
import { SteelBeamsSVG } from '../../features/steel-beams/SteelBeamsSVG';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { exportSteelBeamsPDF } from '../../lib/pdf/steelBeams';
import { steelBeamDefaults } from '../../data/defaults';

// jsPDF cuelga text() de la INSTANCIA, no del prototipo: se envuelve el
// constructor (mismo patrón que pdfLayout.dom.test.ts).
vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const { instrument } = await import('../pdf/layoutProbe');
  const Real = mod.default ?? mod.jsPDF;
  const Patched: any = function (...args: any[]) { return instrument(new Real(...args)); };
  return { ...mod, default: Patched, jsPDF: Patched };
});

// CHS 508×5 en S275: D/t = 101.6 > 90·ε² = 76.9 ⇒ clase 4.
const class4Inputs = {
  ...steelBeamDefaults,
  tipo: 'CHS' as const,
  chs_D: 508,
  chs_t: 5,
  tube_process: 'hot-finished' as const,
};

afterEach(cleanup);

describe('Tubo de clase 4 — etiqueta del PDF', () => {
  beforeEach(resetProbe);

  it('imprime el label real del tubo, no el fallback `${tipo} ${size}`', async () => {
    const result = calcSteelBeam(class4Inputs);
    expect(result.valid).toBe(false);
    expect(result.sectionClass).toBe(4);

    // El módulo exporta con `valid: true` hardcodeado a propósito: documentar
    // que un perfil NO cumple es un caso de uso.
    await exportSteelBeamsPDF(class4Inputs, { ...result, valid: true }, 'si', 'Viga 1');

    const printed = texts.map((t) => t.t);
    expect(printed).toContain('Ø508×5 (EN 10210)');
    // El fallback: `${inp.tipo} ${inp.size}` con el `size` heredado del
    // perfil en I por defecto — un tamaño que el tubo ni siquiera usa.
    expect(printed).not.toContain('CHS 300');
  });
});

describe('Tubo de clase 4 — figura de la sección', () => {
  it('dibuja la sección en vez de dejar el panel vacío', () => {
    const result = calcSteelBeam(class4Inputs);
    const { container } = render(
      <SteelBeamsSVG result={result} mode="screen" width={210} height={270} />,
    );
    // El anillo del CHS se dibuja como <path> con fill-rule evenodd.
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Ø508×5 (EN 10210)');
  });
});
