/**
 * La tabla entera en un solo sistema de unidades.
 *
 * El fallo que cierra este test: lo tecleado (PP, lo que hay encima, el alzado
 * y la carga de los lineales) se quedaba en kN/m² mientras las columnas
 * derivadas de su MISMA fila —G, Q, qd, Gd— salían ya en kg/m². Una fila se
 * leía en dos sistemas a la vez y ninguna cabecera lo decía, porque estaban
 * escritas a mano. Aquí se monta el módulo con el sistema técnico puesto y se
 * comprueba que no queda un símbolo SI en pantalla y que los números de una
 * fila son coherentes entre sí.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { CargasPlantaModule } from '../../features/cargas-planta';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

/** Los símbolos del SI que no deben quedar visibles con el técnico puesto. */
const SIMBOLOS_SI = /kN\/m³|kN\/m²|kN·m|kNm|kN\/m|kN|N\/mm²|kPa|MPa/;

function montar() {
  return render(
    <MemoryRouter initialEntries={['/acciones/cargas-planta']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <CargasPlantaModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** Todo el texto visible, nodo a nodo: los rótulos de las cabeceras incluidos. */
function textosVisibles(): string[] {
  const salida: string[] = [];
  const paseo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = paseo.nextNode())) {
    const t = (n.textContent ?? '').trim();
    if (t) salida.push(t);
  }
  return salida;
}

const filaDe = (planta: string) =>
  screen.getByLabelText('Nombre de la planta', { selector: `input[value="${planta}"]` }).closest('tr') as HTMLTableRowElement;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('unitSystem', 'tecnico');
});

afterEach(() => {
  cleanup();
});

describe('Cargas por planta — un solo sistema de unidades', () => {
  it('con el técnico puesto no queda un símbolo del SI en pantalla', () => {
    montar();
    const fugas = textosVisibles().filter((t) => SIMBOLOS_SI.test(t));
    expect(fugas).toEqual([]);
  });

  it('tampoco en lo que sólo se ve al abrirlo: la ficha, los muros y los catálogos', () => {
    montar();
    // La ficha de una zona, con sus casos raros y lo que dice la norma.
    fireEvent.click(within(filaDe('Cubierta')).getByText('toda'));
    // El bloque del terreno, apagado de arranque.
    fireEvent.click(screen.getByRole('button', { name: 'La obra tiene muros de sótano o de contención' }));
    const fugas = textosVisibles().filter((t) => SIMBOLOS_SI.test(t));
    expect(fugas).toEqual([]);
  });

  it('las cabeceras dicen la unidad activa, no la que se escribió a mano', () => {
    montar();
    expect(screen.getByText(/¿Qué hay encima\? · kg\/m² · C\.5/)).toBeInTheDocument();
    expect(screen.getByText(/Cálculo · kg\/m² · DB SE 4\.1/)).toBeInTheDocument();
    expect(screen.getByText(/^Alzado \(kg\/m²\)$/)).toBeInTheDocument();
    expect(screen.getByText(/^Carga \(kg\/m\)$/)).toBeInTheDocument();
  });

  it('lo tecleado y lo calculado de una fila están en la misma unidad', () => {
    montar();
    // Reticular de 30 cm: 5 kN/m² de peso propio → 510 kg/m². Con el solado y
    // la tabiquería (1 + 1 kN/m²), G = 7 kN/m² → 714 kg/m².
    const fila = filaDe('Planta Baja');
    expect(within(fila).getByLabelText(/^Peso propio de Planta Baja/)).toHaveValue('510');
    expect(fila).toHaveTextContent('714');
    // Y la sobrecarga de viviendas, 2 kN/m² → 204 kg/m².
    expect(fila).toHaveTextContent('204');
  });

  it('lo que se teclea se lee en la unidad activa y vuelve a SI por dentro', () => {
    montar();
    const fila = filaDe('Planta Baja');
    const pp = within(fila).getByLabelText(/^Peso propio de Planta Baja/);
    // 600 kg/m² son 5,88 kN/m²; con el solado y la tabiquería, G = 7,88 → 804.
    fireEvent.change(pp, { target: { value: '600' } });
    expect(pp).toHaveValue('600');
    expect(fila).toHaveTextContent('804');
  });

  it('la sección rotula cada bloque con el mismo qd que su fila', () => {
    montar();
    // qd de las plantas de vivienda: 12,70 kN/m² → 1270 kg/m². El dibujo va al
    // lado de la tabla y con el mismo número: en kN/m² se leía «12,70».
    const seccion = screen.getByRole('img', { name: /Sección del edificio/ });
    expect(seccion).toHaveTextContent('1270');
    expect(seccion).not.toHaveTextContent('12,70');
    expect(filaDe('Planta Baja')).toHaveTextContent('1270');
  });

  it('la tabla de cargas lineales no mezcla el alzado con su Gd', () => {
    montar();
    // Cerramiento de fachada: 2,33 kN/m² de alzado → 238 kg/m², por 3 m son
    // 714 kg/m, y Gd = 1,35 · 7,00 kN/m → 964 kg/m.
    const alzado = screen.getByLabelText(/^Peso por metro cuadrado de alzado de Cerramiento de fachada/);
    expect(alzado).toHaveValue('238');
    const fila = alzado.closest('tr') as HTMLElement;
    expect(fila).toHaveTextContent('714');
    expect(fila).toHaveTextContent('964');
  });

  it('la ficha no plantea la densidad del hormigón como una multiplicación falsa', () => {
    montar();
    // El peso propio sale de la densidad sólo en losa y solera; el reticular de
    // arranque lo saca de la tabla C.5.
    fireEvent.change(within(filaDe('Planta Baja')).getByLabelText(/^Tipo de forjado/), { target: { value: 'losa' } });
    fireEvent.click(within(filaDe('Planta Baja')).getByText('toda'));
    // 25 kN/m³ → 2,55 t/m³ y una losa de 25 cm pesa 6,25 kN/m² → 637 kg/m².
    // Antes la frase decía «25 kN/m³ × 0,25 m = 637 kg/m²», que no cuadra.
    const texto = document.body.textContent ?? '';
    expect(texto).toContain('Hormigón armado, 2,55 t/m³ (tabla C.1), por un canto de 25 cm');
    expect(texto).not.toMatch(/×\s*0,25\s*m/);
  });
});
