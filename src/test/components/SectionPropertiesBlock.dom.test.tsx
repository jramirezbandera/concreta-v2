// El bloque de propiedades, ya montado en los dos módulos de acero.
//
// Lo que se afirma aquí y no puede afirmar el test del helper puro: DÓNDE se
// pinta (tras el veredicto, antes de "Valores"), que sobrevive a la rama de
// clase 4 —donde más falta hace— y que el panel estrecho del FEM 1D recibe
// solo la geometría.

import { describe, it, expect, afterEach } from 'vitest';
import { render as rtlRender, screen, cleanup } from '@testing-library/react';
import { SteelBeamsResults } from '../../features/steel-beams/SteelBeamsResults';
import { SteelColumnsResults } from '../../features/steel-columns/SteelColumnsResults';
import { SteelBarResults } from '../../features/fem-analysis/embedded/SteelBarResults';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { steelBeamDefaults, steelColumnDefaults } from '../../data/defaults';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import type { BarResult, DesignBar } from '../../features/fem-analysis/types';

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(ui, { wrapper: UnitSystemProvider });

afterEach(cleanup);

/** CHS 508×5 S275 → D/t = 101.6 > 90·ε²: clase 4 en los dos motores. */
const class4Tube = { chs_D: 508, chs_t: 5 } as const;

const orderOf = (container: HTMLElement, ...needles: string[]) =>
  needles.map((n) => (container.textContent ?? '').indexOf(n));

describe('Vigas de acero — bloque de propiedades', () => {
  it('se pinta entre el veredicto y "Valores"', () => {
    const result = calcSteelBeam(steelBeamDefaults);
    const { container } = render(<SteelBeamsResults result={result} deflLimit={300} />);

    const [verdict, block, values] = orderOf(
      container, 'Resultados calculados', 'Sección · IPE 300', 'Valores',
    );
    expect(verdict).toBeGreaterThanOrEqual(0);
    expect(block).toBeGreaterThan(verdict);
    expect(values).toBeGreaterThan(block);
  });

  it('muestra geometría y propiedades con sus valores de catálogo', () => {
    render(<SteelBeamsResults result={calcSteelBeam(steelBeamDefaults)} deflLimit={300} />);
    expect(screen.getByText('Geometría')).toBeInTheDocument();
    expect(screen.getByText('Propiedades')).toBeInTheDocument();
    expect(screen.getByText('tf — espesor de ala (mm)')).toBeInTheDocument();
    expect(screen.getByText('Iw (10³ cm⁶)')).toBeInTheDocument();
    expect(screen.getByText('42.2')).toBeInTheDocument();   // peso IPE 300
    expect(screen.getByText('8356')).toBeInTheDocument();    // Iy
  });

  it('parte Propiedades en dos subcolumnas leyendo hacia abajo, no a lo ancho', () => {
    // 10 filas apiladas hacían el bloque de 401 px y echaban la primera
    // comprobación fuera de pantalla a 1080p. El reparto es DENTRO del grupo:
    // Geometría y Propiedades siguen sin mezclarse.
    const { container } = render(
      <SteelBeamsResults result={calcSteelBeam(steelBeamDefaults)} deflLimit={300} />,
    );
    const propsGroup = [...container.querySelectorAll('div')]
      .find((d) => d.firstElementChild?.textContent === 'Propiedades');
    const cols = [...propsGroup!.querySelectorAll(':scope > div > div')];
    expect(cols).toHaveLength(2);

    const labels = (col: Element) =>
      [...col.children].map((row) => row.firstElementChild?.textContent);
    // Orden de presentación conservado: la primera mitad entera va arriba a la
    // izquierda; un grid-cols-2 con flujo por filas daría A | peso.
    expect(labels(cols[0])).toEqual([
      'A (cm²)', 'peso (kg/m, derivado)', 'Iy (cm⁴)', 'Iz (cm⁴)', 'Wel,y (cm³)',
    ]);
    expect(labels(cols[1])).toEqual([
      'Wel,z (cm³, derivado)', 'Wpl,y (cm³)', 'Wpl,z (cm³, derivado)', 'It (cm⁴)', 'Iw (10³ cm⁶)',
    ]);
  });

  it('sobrevive a la rama de clase 4 — junto al aviso "elija un perfil más robusto"', () => {
    const result = calcSteelBeam({
      ...steelBeamDefaults, tipo: 'CHS', ...class4Tube, tube_process: 'hot-finished',
    });
    render(<SteelBeamsResults result={result} deflLimit={300} />);
    expect(screen.getByText('Sección clase 4')).toBeInTheDocument();
    expect(screen.getByText('Sección · CHS Ø508×5 (EN 10210)')).toBeInTheDocument();
    expect(screen.getByText('D — diámetro exterior (mm)')).toBeInTheDocument();
  });

  it('la rama genérica (perfil no encontrado) no lo pinta: no hay sección', () => {
    const result = calcSteelBeam({ ...steelBeamDefaults, size: 999 });
    render(<SteelBeamsResults result={result} deflLimit={300} />);
    expect(screen.queryByText('Geometría')).toBeNull();
  });
});

describe('Pilares de acero — bloque de propiedades', () => {
  it('se pinta entre el veredicto y "Valores"', () => {
    const result = calcSteelColumn(steelColumnDefaults);
    const { container } = render(<SteelColumnsResults result={result} zeroLoads={false} />);

    const [verdict, block, values] = orderOf(
      container, 'Resultados calculados', 'Sección · HEB 200', 'Valores',
    );
    expect(block).toBeGreaterThan(verdict);
    expect(values).toBeGreaterThan(block);
  });

  it('NO se atenúa con SIN CARGAS — ese estado es el modo prontuario puro', () => {
    const zero = { ...steelColumnDefaults, Ned: 0, My_Ed: 0, Mz_Ed: 0 };
    const { container } = render(<SteelColumnsResults result={calcSteelColumn(zero)} zeroLoads />);

    expect(screen.getByText('SIN CARGAS')).toBeInTheDocument();
    const block = container.querySelector('section[aria-label="Propiedades de la sección"]');
    expect(block).not.toBeNull();
    expect(block!.querySelectorAll('.opacity-50')).toHaveLength(0);
    expect(block!.closest('.opacity-50')).toBeNull();
  });

  it('sobrevive a la rama inválida cuando es clase 4, y desaparece cuando no hay sección', () => {
    const class4 = calcSteelColumn({
      ...steelColumnDefaults, sectionType: 'CHS', ...class4Tube, chs_process: 'hot-finished',
    });
    const { unmount } = render(<SteelColumnsResults result={class4} zeroLoads={false} />);
    expect(screen.getByText('Sección clase 4')).toBeInTheDocument();
    expect(screen.getByText('Sección · CHS Ø508×5 (EN 10210)')).toBeInTheDocument();
    unmount();

    const missing = calcSteelColumn({ ...steelColumnDefaults, size: 999 });
    render(<SteelColumnsResults result={missing} zeroLoads={false} />);
    expect(screen.getByText('Sección no disponible')).toBeInTheDocument();
    expect(screen.queryByText('Geometría')).toBeNull();
  });
});

describe('FEM 1D — panel por barra (compact)', () => {
  it('pinta Geometría y NO Propiedades: 15 filas sepultarían el veredicto', () => {
    const steelResult = calcSteelBeam(steelBeamDefaults);
    const barResult = { steelResult } as unknown as BarResult;
    const bar = { steelSelection: { deflLimit: 300 } } as unknown as DesignBar;

    render(<SteelBarResults barResult={barResult} bar={bar} />);
    expect(screen.getByText('Geometría')).toBeInTheDocument();
    expect(screen.queryByText('Propiedades')).toBeNull();
    expect(screen.getByText('h — canto (mm)')).toBeInTheDocument();
    expect(screen.queryByText('Iy (cm⁴)')).toBeNull();
  });
});
