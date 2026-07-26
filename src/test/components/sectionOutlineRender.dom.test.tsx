// El contorno compartido, ya montado en los dos módulos de acero.
//
// Lo que ancla este test es la DIVERGENCIA que motivó el cambio: el perímetro
// del perfil estaba escrito dos veces y las dos mal —vigas componía el tubo
// con rectángulos sueltos (esquinas en pico) y ninguno de los dos dibujaba los
// acuerdos del perfil en I—. Aquí se comprueba que los dos renderizadores
// pintan la MISMA cuenta de arcos que emite `sectionOutline`, así que si
// alguien vuelve a dibujar una sección por su cuenta, se entera.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SteelBeamsSVG } from '../../features/steel-beams/SteelBeamsSVG';
import { SteelColumnsSVG } from '../../features/steel-columns/SteelColumnsSVG';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { steelBeamDefaults, steelColumnDefaults } from '../../data/defaults';

afterEach(cleanup);

/**
 * El grupo de la sección se localiza por su `<title>` («Perfil IPE 300»), no
 * por el path más largo: en pilares la deformada de pandeo es más larga y el
 * test se estaría midiendo a sí mismo.
 */
function sectionGroup(container: HTMLElement): Element {
  const title = [...container.querySelectorAll('title')]
    .find((t) => (t.textContent ?? '').startsWith('Perfil'));
  expect(title, 'la sección debe llevar <title> Perfil …').toBeTruthy();
  return title!.parentElement!;
}

const sectionPath = (container: HTMLElement) => sectionGroup(container).querySelector('path');

/** Nº de comandos de arco en el `d` de la sección. */
const sectionArcs = (container: HTMLElement): number =>
  ((sectionPath(container)?.getAttribute('d') ?? '').match(/A /g) ?? []).length;

describe('Vigas de acero — sección dibujada', () => {
  it('el perfil en I lleva sus CUATRO acuerdos y ya no son tres rectángulos', () => {
    const { container } = render(
      <SteelBeamsSVG result={calcSteelBeam(steelBeamDefaults)} mode="screen" width={210} height={270} />,
    );
    expect(sectionArcs(container)).toBe(4);
    // Los tres rectángulos pegados eran la silueta de un perfil SOLDADO.
    expect(sectionGroup(container).querySelectorAll('rect')).toHaveLength(0);
  });

  it('el tubo rectangular sale con las esquinas redondeadas, como en pilares', () => {
    const rhs = { ...steelBeamDefaults, tipo: 'RHS' as const };
    const { container } = render(
      <SteelBeamsSVG result={calcSteelBeam(rhs)} mode="screen" width={210} height={270} />,
    );
    // 4 esquinas exteriores + 4 interiores.
    expect(sectionArcs(container)).toBe(8);
    expect(sectionPath(container)).toHaveAttribute('fill-rule', 'evenodd');
    expect(sectionGroup(container).querySelectorAll('rect')).toHaveLength(0);
  });

  it('el cajón de 2UPN sigue con sus primitivas: no tiene acuerdos que dibujar', () => {
    const box = { ...steelBeamDefaults, tipo: '2UPN' as const, size: 200 };
    const { container } = render(
      <SteelBeamsSVG result={calcSteelBeam(box)} mode="screen" width={210} height={270} />,
    );
    expect(sectionGroup(container).querySelectorAll('rect').length).toBeGreaterThan(0);
    expect(sectionArcs(container)).toBe(0);
  });

  it('el tubo circular sigue siendo una corona de dos circunferencias', () => {
    const chs = { ...steelBeamDefaults, tipo: 'CHS' as const };
    const { container } = render(
      <SteelBeamsSVG result={calcSteelBeam(chs)} mode="screen" width={210} height={270} />,
    );
    expect(sectionPath(container)?.getAttribute('d')).toMatch(/^M .* a /);
  });
});

describe('Pilares de acero — sección dibujada', () => {
  const renderCol = (inp: typeof steelColumnDefaults) =>
    render(
      <SteelColumnsSVG inp={inp} result={calcSteelColumn(inp)} mode="screen" width={520} height={300} />,
    );

  it('el perfil en I lleva sus CUATRO acuerdos', () => {
    const { container } = renderCol(steelColumnDefaults);
    expect(sectionArcs(container)).toBe(4);
  });

  it('el tubo rectangular mantiene sus ocho esquinas redondeadas', () => {
    const { container } = renderCol({ ...steelColumnDefaults, sectionType: 'RHS' });
    expect(sectionArcs(container)).toBe(8);
    expect(sectionPath(container)).toHaveAttribute('fill-rule', 'evenodd');
  });
});

describe('Los dos módulos dibujan la misma FORMA', () => {
  it('mismo perfil ⇒ misma cuenta de arcos en vigas y en pilares', () => {
    // No se comparan los `d`: cada panel tiene su encuadre y su escala. Lo que
    // no puede divergir es la geometría, y el nº de arcos la delata.
    const beam = render(
      <SteelBeamsSVG
        result={calcSteelBeam({ ...steelBeamDefaults, tipo: 'HEB', size: 200 })}
        mode="screen" width={210} height={270}
      />,
    );
    const arcsBeam = sectionArcs(beam.container);
    cleanup();
    const col = render(
      <SteelColumnsSVG
        inp={{ ...steelColumnDefaults, sectionType: 'HEB', size: 200 }}
        result={calcSteelColumn({ ...steelColumnDefaults, sectionType: 'HEB', size: 200 })}
        mode="screen" width={520} height={300}
      />,
    );
    expect(sectionArcs(col.container)).toBe(arcsBeam);
  });
});
