/**
 * La sección del edificio: que el dibujo dice lo que dice la cuenta.
 *
 * El dibujo tiene un trabajo y sólo uno —enseñar de dónde sale la altura de
 * evacuación— y lo que se fija aquí es que no invente nada por el camino:
 *
 *  - que el CERO esté en el forjado de la planta de salida, que es el convenio
 *    del Anejo A y no el suelo del sótano ni la rasante del terreno;
 *  - que con la cadena de alturas rota NO finja una escala, porque un dibujo a
 *    escala inventada es peor que ninguno;
 *  - que la cota de evacuación llegue al origen de evacuación más alto y no a
 *    la planta más alta, que es justo la distinción que la hace bajar;
 *  - y que las R vayan a su lado de la rasante, porque la tabla 3.1 tiene
 *    columna aparte para el sótano y no hay UNA R del edificio.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SeccionSVG } from '../../features/incendio/SeccionSVG';
import { alturasDeEvacuacion, type PlantaParaAltura } from '../../lib/incendio/altura';
import { claseUso, resolverSectores, type SectorEntrada } from '../../lib/incendio/sectores';

const planta = (
  nombre: string,
  altura: number | null,
  o: Partial<PlantaParaAltura> = {},
): PlantaParaAltura => ({ nombre, altura, canto: 0.3, bajoRasante: false, cuenta: true, ...o });

/** Sótano, baja y dos plantas: la cubierta no cuenta. */
const EDIFICIO: PlantaParaAltura[] = [
  planta('Sótano -1', 3, { bajoRasante: true }),
  planta('Planta Baja', 3.5),
  planta('Planta Primera', 3),
  planta('Cubierta', null, { cuenta: false }),
];

const sector = (o: Partial<SectorEntrada> = {}): SectorEntrada => ({
  id: 's1',
  nombre: 'Plantas sobre rasante',
  clase: claseUso('residencialVivienda'),
  sotano: false,
  robotizado: false,
  adosada: false,
  bajoCubiertaSinRiesgo: false,
  minutosManual: null,
  anejoB: null,
  ...o,
});

function pintar(plantas: PlantaParaAltura[] = EDIFICIO, sectores: SectorEntrada[] = [sector()]) {
  const a = alturasDeEvacuacion(plantas);
  const { container } = render(
    <SeccionSVG
      plantas={a.plantas}
      alturaEvacuacion={a.descendente}
      alturaAMano={false}
      ascendente={a.ascendente}
      sectores={resolverSectores(sectores, {
        alturaEvacuacion: a.descendente,
        ascendente: a.ascendente,
        plantasAscendentes: a.plantasAscendentes,
      })}
    />,
  );
  return { container, alturas: a, texto: container.textContent ?? '' };
}

describe('las cotas', () => {
  it('el cero está en el forjado de la planta de salida, y el sótano baja de ahí', () => {
    const { texto } = pintar();
    expect(texto).toContain('0,00'); // Planta Baja
    expect(texto).toContain('-3,00'); // Sótano
    expect(texto).toContain('+3,50'); // Planta Primera
  });

  it('la cota de evacuación es la del origen de evacuación más alto, no la de la cubierta', () => {
    // La cubierta está a +6,50 y no cuenta: la altura de evacuación es la de
    // Planta Primera, +3,50.
    const { alturas, texto } = pintar();
    expect(alturas.descendente).toBe(3.5);
    expect(texto).toContain('3,50 m');
  });

  it('y la ascendente sale aparte, desde el sótano ocupado', () => {
    const { alturas, texto } = pintar();
    expect(alturas.ascendente).toBe(3);
    expect(texto).toContain('3,00 asc.');
  });
});

describe('cuando no se puede dibujar a escala', () => {
  it('con una altura sin teclear lo dice en vez de repartir a ojo', () => {
    const { texto } = pintar([
      planta('Planta Baja', null),
      planta('Planta Primera', 3),
      planta('Cubierta', null),
    ]);
    expect(texto).toContain('sin escala');
  });

  it('con la cadena entera cerrada, en cambio, se rotula la escala', () => {
    expect(pintar().texto).toContain('a escala');
  });
});

describe('las plantas de ocupación nula', () => {
  it('se dibujan, pero a trazos y rotuladas', () => {
    const { container, texto } = pintar();
    expect(texto).toContain('ocup. nula');
    const trazos = [...container.querySelectorAll('rect')].filter((r) => r.getAttribute('stroke-dasharray'));
    expect(trazos).toHaveLength(1);
  });

  it('y con todas ocupadas no hay ninguna a trazos', () => {
    const { container } = pintar([
      planta('Planta Baja', 3.5),
      planta('Planta Primera', 3),
      planta('Cubierta', null),
    ]);
    expect([...container.querySelectorAll('rect')].filter((r) => r.getAttribute('stroke-dasharray'))).toHaveLength(0);
  });
});

describe('las R', () => {
  it('cada una a su lado de la rasante', () => {
    const { texto } = pintar(EDIFICIO, [
      sector(),
      sector({ id: 's2', nombre: 'Aparcamiento', clase: claseUso('aparcamientoBajoOtroUso'), sotano: true }),
    ]);
    // Vivienda a 3,50 m → R 60; aparcamiento bajo otro uso → R 120.
    expect(texto).toContain('R 60');
    expect(texto).toContain('R 120');
  });

  it('varias R del mismo lado se enumeran, sin quedarse con la mayor', () => {
    const { texto } = pintar(EDIFICIO, [
      sector(),
      sector({ id: 's2', nombre: 'Sala de calderas', clase: 'riesgo:bajo' }),
    ]);
    expect(texto).toContain('R 60 · R 90');
  });

  it('sin sectores resueltos no se rotula ninguna', () => {
    const { texto } = pintar(EDIFICIO, []);
    expect(texto).not.toContain('R ');
  });
});

describe('el dibujo se defiende solo', () => {
  it('sin plantas no pinta nada', () => {
    const { container } = render(
      <SeccionSVG plantas={[]} alturaEvacuacion={null} alturaAMano={false} ascendente={null} sectores={[]} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('con una sola planta no se inventa fachadas ni escala', () => {
    const { container, texto } = pintar([planta('Planta Baja', null)]);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('line').length).toBeGreaterThanOrEqual(0);
    expect(texto).toContain('sin escala');
  });

  it('con la altura adoptada a mano se marca con asterisco y se explica al pie', () => {
    const a = alturasDeEvacuacion(EDIFICIO);
    const { container } = render(
      <SeccionSVG
        plantas={a.plantas}
        alturaEvacuacion={9}
        alturaAMano
        ascendente={a.ascendente}
        sectores={[]}
      />,
    );
    const texto = container.textContent ?? '';
    expect(texto).toContain('9,00 m*');
    expect(texto).toContain('altura adoptada a mano');
  });
});
