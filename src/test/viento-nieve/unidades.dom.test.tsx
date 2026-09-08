/**
 * El módulo entero en un solo sistema de unidades.
 *
 * El lienzo ya convertía con `useFormato`, pero se habían quedado fuera las dos
 * entradas que se teclean —la presión dinámica y la sobrecarga de nieve, con su
 * «kN/m²» escrito a mano—, las cabeceras de las tablas de resultados, el
 * «qb·ce» de fachadas y la leyenda del alzado. Con el técnico puesto, el mismo
 * qe se leía en kg/m² en el dibujo y en kN/m² en la tabla de al lado.
 *
 * Lo que SÍ se queda en el SI son las designaciones normativas: la zona eólica
 * del mapa D.1 y el método simplificado del art. 3.3.2 se eligen por su nombre,
 * como un HA-25, y ese nombre lo fija la norma. Viven en un `<option>`, y ese
 * es el criterio que usa este test para distinguirlas de una fuga.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { VientoNieveModule } from '../../features/viento-nieve';

vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

/** Los símbolos del SI que no deben quedar visibles con el técnico puesto. */
const SIMBOLOS_SI = /kN\/m³|kN\/m²|kN·m|kNm|kN\/m|kN|N\/mm²|kPa|MPa/;

function montar() {
  return render(
    <MemoryRouter initialEntries={['/acciones/viento-nieve']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <VientoNieveModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/**
 * El texto visible que NO es una designación normativa. Una designación vive en
 * un `<option>`: es un nombre que se elige, no una medida que se calcula.
 */
function textoCalculado(): string[] {
  const salida: string[] = [];
  const paseo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = paseo.nextNode())) {
    const t = (n.textContent ?? '').trim();
    if (!t || n.parentElement?.closest('option')) continue;
    salida.push(t);
  }
  return salida;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('unitSystem', 'tecnico');
});

afterEach(() => {
  cleanup();
});

describe('Viento y nieve — un solo sistema de unidades', () => {
  it('con el técnico puesto no queda un símbolo del SI en lo calculado', () => {
    montar();
    expect(textoCalculado().filter((t) => SIMBOLOS_SI.test(t))).toEqual([]);
  });

  it('tampoco en las entradas que sólo aparecen al pedir «un valor propio»', () => {
    montar();
    // La presión dinámica tecleada y la sobrecarga de nieve tecleada: dos
    // desplegables que destapan sendas cajas con su unidad.
    fireEvent.change(screen.getByLabelText('Presión dinámica'), { target: { value: 'manual' } });
    fireEvent.change(screen.getByLabelText('Origen de sk'), { target: { value: 'manual' } });
    expect(screen.getByLabelText('Presión dinámica tecleada')).toBeInTheDocument();
    expect(screen.getByLabelText('sk tecleada')).toBeInTheDocument();
    expect(textoCalculado().filter((t) => SIMBOLOS_SI.test(t))).toEqual([]);
  });

  it('lo que se teclea va en la unidad activa y se guarda en SI', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Origen de sk'), { target: { value: 'manual' } });
    const sk = screen.getByLabelText('sk tecleada') as HTMLInputElement;
    // La sk de arranque, 1,0 kN/m², son 102 kg/m²: la caja abre ya convertida.
    expect(sk.value).toBe('102');
    // Y al teclear en kg/m² el dibujo enseña ese mismo número.
    fireEvent.change(sk, { target: { value: '82' } });
    expect(sk.value).toBe('82');
  });

  it('las designaciones normativas siguen en el SI, que es como las da el DB', () => {
    montar();
    // Zona eólica del mapa D.1 y método simplificado del art. 3.3.2.
    const opciones = [...document.querySelectorAll('option')].map((o) => o.textContent ?? '');
    expect(opciones.some((t) => /qb 0,42 kN\/m²/.test(t))).toBe(true);
    expect(opciones.some((t) => /0,5 kN\/m² simplificado/.test(t))).toBe(true);
  });


  it('las tablas de cubierta y fachadas rotulan la columna con la unidad activa', () => {
    montar();
    // Sin emplazamiento no hay resultado y las tablas no existen: «Ver ejemplo»
    // carga el caso completo de Aranda de Duero, con cubierta y fachadas.
    fireEvent.click(screen.getByRole('button', { name: 'Ver ejemplo' }));
    for (const vista of ['Cubierta', 'Fachadas']) {
      fireEvent.click(screen.getByRole('button', { name: vista }));
      const cabeceras = [...document.querySelectorAll('table th')].map((th) => th.textContent?.trim());
      expect(cabeceras.length, `${vista}: sin tablas que comprobar`).toBeGreaterThan(0);
      expect(cabeceras, vista).toContain('kg/m²');
      expect(cabeceras, vista).not.toContain('kN/m²');
      expect(textoCalculado().filter((t) => SIMBOLOS_SI.test(t)), vista).toEqual([]);
    }
  });

  /**
   * Los avisos del motor citan el articulado con la cifra del propio DB —«basta
   * considerar 1,0 kN/m² (art. 3.5.1-1)»—. No plantean ninguna operación: son
   * una cita, como la designación de un `<option>`, y se quedan en las unidades
   * de la norma para poder cotejarlas contra el papel. `lib/acciones` es además
   * un motor puro y no conoce el sistema de unidades.
   *
   * Se enumeran una a una a propósito: cualquier OTRO símbolo del SI que
   * aparezca en el módulo rompe el test.
   */
  const CITAS_DEL_ARTICULADO: Record<string, string[]> = {
    Edificio: [],
    Cubierta: [],
    Fachadas: [],
    Nieve: ['En cubiertas planas de edificios de pisos por debajo de 1000 m basta considerar 1,0 kN/m² (art. 3.5.1-1).'],
  };

  it('con el ejemplo cargado, sólo quedan en SI las citas del articulado', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Ver ejemplo' }));
    for (const vista of ['Edificio', 'Cubierta', 'Fachadas', 'Nieve']) {
      fireEvent.click(screen.getByRole('button', { name: vista }));
      expect(textoCalculado().filter((t) => SIMBOLOS_SI.test(t)), vista).toEqual(CITAS_DEL_ARTICULADO[vista]);
    }
  });

  /**
   * La fuga más traicionera no lleva símbolo del SI: es un rótulo YA convertido
   * sobre un valor que no lo está. «qb · zona B» daba «0,45 kg/m²» —el número
   * en kN/m² y la unidad en kg/m²—, y ningún barrido de símbolos lo caza. Aquí
   * se comprueba el número.
   */
  it('los coeficientes traen el valor convertido, no sólo el rótulo convertido', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Ver ejemplo' }));
    // Aranda de Duero cae en zona eólica B: qb = 0,45 kN/m², que son 46 kg/m².
    const fila = screen.getByText(/^qb · zona B$/).closest('div')!;
    expect(fila).toHaveTextContent('46 kg/m²');
    expect(fila).not.toHaveTextContent('0,45');
  });

  it('la presión de fachadas se deriva en la unidad activa', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Ver ejemplo' }));
    // «qb·ce» sale bajo «Lo que pone la norma»: es un calculado, no una cita.
    expect(document.body.textContent).toMatch(/qb·ce = [\d,]+ kg\/m²/);
  });
});
