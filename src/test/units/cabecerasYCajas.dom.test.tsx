/**
 * Las dos fugas mecánicas de los módulos antiguos, barridas de una vez:
 *
 *   A · la unidad escrita a mano en el chip de una caja que se teclea, que
 *       sigue diciendo «kN/m³» mientras el resto del módulo ya va en toneladas;
 *   B · la cabecera de una tabla o el rótulo de un eje escritos a mano encima
 *       de valores que sí conmutan.
 *
 * La comprobación de fondo no es que no quede el símbolo —eso lo caza un
 * barrido de texto—, sino que el rótulo y la cifra salgan del MISMO sistema.
 * Un «kg/m²» sobre un número en kN miente más que un rótulo en el SI, porque
 * no hay nada que delate la inconsistencia. Por eso aquí las equivalencias se
 * escriben a mano (g = 9,80665) en vez de pedírselas al catálogo, que es lo
 * que se está comprobando.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { RCColumnInteractionSVG } from '../../features/rc-columns/RCColumnInteractionSVG';
import { SteelColumnInteractionSVG } from '../../features/steel-columns/SteelColumnInteractionSVG';
import { RockfillWallResults } from '../../features/rockfill-wall/RockfillWallResults';
import { IsolatedFootingInputsPanel } from '../../features/isolated-footing/IsolatedFootingInputsPanel';
import { MicropilesInputsPanel } from '../../features/micropiles/MicropilesInputsPanel';
import { calcRCColumn, buildColumnInteraction } from '../../lib/calculations/rcColumns';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { calcRockfillWall } from '../../lib/calculations/rockfillWall';
import {
  rcColumnDefaults,
  steelColumnDefaults,
  rockfillWallDefaults,
  isolatedFootingDefaults,
  micropilesDefaults,
} from '../../data/defaults';

/** kN → Tn y kNm → mt: 1 kp = 9,80665 N. */
const aTn = (kN: number, dec = 0) => (kN / 9.80665).toFixed(dec).replace('.', ',');
/** kN/m → kg/m. */
const aKgM = (kNm: number, dec = 0) => ((kNm * 1000) / 9.80665).toFixed(dec).replace('.', ',');

const noop = () => {};

function conProvider(nodo: React.ReactElement) {
  return render(<UnitSystemProvider>{nodo}</UnitSystemProvider>);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('unitSystem', 'tecnico');
});

afterEach(() => {
  cleanup();
});

// ── B · cabeceras y ejes ────────────────────────────────────────────────────

describe('Diagramas de interacción — el eje y la cifra, en el mismo sistema', () => {
  const rc = buildColumnInteraction(rcColumnDefaults, calcRCColumn(rcColumnDefaults));
  const acero = calcSteelColumn(steelColumnDefaults).interaction!;

  it('pilares de hormigón: con el técnico puesto, los ejes van en Tn y mt', () => {
    const { container } = render(<RCColumnInteractionSVG data={rc.y!} system="tecnico" />);
    const texto = container.textContent ?? '';
    expect(texto).toContain('N (Tn)');
    expect(texto).toContain('M (mt)');
    expect(texto).not.toContain('kN');
  });

  it('…y el marcador solicitante trae el valor convertido, no sólo el eje', () => {
    const { container } = render(<RCColumnInteractionSVG data={rc.y!} system="tecnico" />);
    const marcador = [...container.querySelectorAll('text')]
      .map((t) => t.textContent ?? '')
      .find((t) => t.startsWith('('))!;
    expect(marcador).toBe(`(${aTn(rc.y!.applied.N)}; ${aTn(rc.y!.applied.M, 1)})`);
    // Y no el número en kN bajo un eje que ya dice Tn, que es la fuga peor.
    expect(marcador).not.toContain(rc.y!.applied.N.toFixed(0));
  });

  it('sin sistema se queda en el SI, que es como lo da el motor', () => {
    const { container } = render(<RCColumnInteractionSVG data={rc.y!} mode="pdf" />);
    const texto = container.textContent ?? '';
    expect(texto).toContain('N (kN)');
    expect(texto).toContain('M (kNm)');
    expect(texto).not.toContain('Tn');
  });

  it('pilares de acero: los dos ejes del contorno biaxial y el marcador', () => {
    const { container } = render(<SteelColumnInteractionSVG data={acero} system="tecnico" />);
    const texto = container.textContent ?? '';
    expect(texto).toContain('My (mt)');
    expect(texto).toContain('Mz (mt)');
    expect(texto).not.toContain('kN');
    const marcador = [...container.querySelectorAll('text')]
      .map((t) => t.textContent ?? '')
      .find((t) => t.startsWith('('))!;
    expect(marcador).toBe(`(${aTn(acero.applied.My, 1)}; ${aTn(acero.applied.Mz, 1)})`);
  });

  it('acero sin sistema: SI, el valor por defecto de la prop', () => {
    const { container } = render(<SteelColumnInteractionSVG data={acero} mode="pdf" />);
    expect(container.textContent ?? '').toContain('My (kNm)');
  });
});

describe('Escollera — la tabla hilada a hilada', () => {
  const result = calcRockfillWall(rockfillWallDefaults);

  it('la cabecera rotula la unidad activa y las celdas la siguen', () => {
    conProvider(
      <MemoryRouter>
        <RockfillWallResults result={result} inp={rockfillWallDefaults} />
      </MemoryRouter>,
    );
    const tabla = document.querySelector('table')!;
    const cabeceras = [...tabla.querySelectorAll('th')].map((th) => th.textContent?.trim());
    expect(cabeceras).toContain('N (kg/m)');
    expect(cabeceras).toContain('Q (kg/m)');
    expect(cabeceras).not.toContain('N (kN/m)');
    // La última hilada —la que la tabla siempre incluye—, con el N convertido:
    // la celda va desnuda y es la cabecera la que dice en qué unidad está.
    const ultima = result.courses[result.courses.length - 1];
    const filas = within(tabla).getAllByRole('row');
    expect(filas.some((tr) => tr.textContent?.includes(aKgM(ultima.N)))).toBe(true);
  });
});

// ── A · las cajas que se teclean ────────────────────────────────────────────

describe('Cajas con la unidad escrita a mano', () => {
  it('zapatas: el peso específico del terreno pasa a t/m³ y convierte', () => {
    conProvider(<IsolatedFootingInputsPanel state={isolatedFootingDefaults} setField={noop} />);
    // 18 kN/m³ son 1,84 t/m³.
    const caja = screen.getByLabelText('γs (t/m³)') as HTMLInputElement;
    expect(caja.value).toBe('1,84');
  });

  it('micropilotes: la presión de inyección pasa a kg/cm² y convierte', () => {
    conProvider(
      <MicropilesInputsPanel
        state={micropilesDefaults}
        setField={noop}
        soil={[]}
        addLayer={noop}
        removeLayer={noop}
        updateLayer={noop}
      />,
    );
    // 300 kPa son 3,06 kg/cm².
    const caja = screen.getByLabelText('p,inj (kg/cm²)') as HTMLInputElement;
    expect(caja.value).toBe('3,06');
  });

  it('en el SI las dos siguen diciendo lo que decían', () => {
    localStorage.setItem('unitSystem', 'si');
    conProvider(<IsolatedFootingInputsPanel state={isolatedFootingDefaults} setField={noop} />);
    expect(screen.getByLabelText('γs (kN/m³)')).toBeInTheDocument();
    cleanup();
    conProvider(
      <MicropilesInputsPanel
        state={micropilesDefaults}
        setField={noop}
        soil={[]}
        addLayer={noop}
        removeLayer={noop}
        updateLayer={noop}
      />,
    );
    expect(screen.getByLabelText('p,inj (kPa)')).toBeInTheDocument();
  });
});
