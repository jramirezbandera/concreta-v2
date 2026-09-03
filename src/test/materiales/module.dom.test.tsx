/**
 * Smoke de integración del módulo en jsdom.
 *
 * Lo que se prueba aquí y no se puede probar en los tests puros: que el cable
 * entre la pregunta de obra, el motor y la pantalla existe. Los fallos que
 * busca no lanzan ninguna excepción y son los que dejarían un plano mal:
 *
 *   1. que las columnas derivadas se queden congeladas al cambiar la situación
 *      —el usuario cree que ha cambiado el ambiente y el cuadro sigue igual;
 *   2. que el interruptor de costa no llegue al motor;
 *   3. que las pestañas del documento pinten algo distinto de lo que dice el
 *      editor;
 *   4. que un hueco sin resolver deje exportar.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { MaterialesModule } from '../../features/materiales';
import { STORAGE_KEY } from '../../features/materiales/state';

// El módulo usa el drawer del AppShell; fuera de él, `useDrawer` necesita el
// contexto. Doble mínimo para poder montarlo solo.
vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn() }),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/memorias/materiales']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ToastContainer />
          <MaterialesModule />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** La fila del editor cuyo nombre coincide, buscada por su input de nombre. */
function filaDe(nombre: string): HTMLElement {
  const inputs = screen.getAllByLabelText('Nombre del elemento') as HTMLInputElement[];
  const input = inputs.find((i) => i.value === nombre);
  if (!input) throw new Error(`no hay fila «${nombre}»`);
  return input.closest('tr')!;
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
});

describe('arranque', () => {
  it('abre en Datos con las cuatro filas del perfil por defecto', () => {
    montar();
    expect(screen.getByText('Cuadro de materiales')).toBeInTheDocument();
    const nombres = (screen.getAllByLabelText('Nombre del elemento') as HTMLInputElement[]).map(
      (i) => i.value,
    );
    expect(nombres).toEqual([
      'Cimentación',
      'Muros de sótano',
      'Forjados',
      'Hormigón de limpieza',
    ]);
  });

  it('las columnas derivadas ya vienen resueltas, sin tocar nada', () => {
    montar();
    const forjados = filaDe('Forjados');
    expect(within(forjados).getByText('XC1')).toBeInTheDocument();
    expect(within(forjados).getByText('30 mm')).toBeInTheDocument();
    expect(within(forjados).getByText('275 kg')).toBeInTheDocument();
    expect(within(forjados).getByText('0,60')).toBeInTheDocument();
    expect(within(forjados).getByText('HA-30/F/20/XC1')).toBeInTheDocument();
  });

  it('acero y madera están apagados: sus tablas no se pintan', () => {
    montar();
    expect(screen.queryByText('Acero estructural', { selector: 'h2' })).not.toBeInTheDocument();
    expect(screen.queryByText('Elementos de madera')).not.toBeInTheDocument();
  });
});

describe('cambiar la respuesta mueve los derivados', () => {
  it('pasar los forjados al exterior sube la clase, el cemento y el recubrimiento', () => {
    montar();
    const forjados = filaDe('Forjados');
    fireEvent.change(within(forjados).getByLabelText('Dónde va a estar'), {
      target: { value: 'exterior_lluvia' },
    });

    const actualizada = filaDe('Forjados');
    expect(within(actualizada).getByText('XC4')).toBeInTheDocument();
    expect(within(actualizada).getByText('300 kg')).toBeInTheDocument();
    expect(within(actualizada).getByText('0,55')).toBeInTheDocument();
    expect(within(actualizada).getByText('35 mm')).toBeInTheDocument();
  });

  it('bajar a HA-25 en un ambiente que exige 30 avisa y prescribe 30', () => {
    montar();
    const forjados = filaDe('Forjados');
    fireEvent.change(within(forjados).getByLabelText('Dónde va a estar'), {
      target: { value: 'exterior_lluvia' },
    });
    fireEvent.change(within(filaDe('Forjados')).getByLabelText('Resistencia del hormigón'), {
      target: { value: '25' },
    });

    // La tipificación sale con 30, no con el 25 que se ha pedido.
    expect(within(filaDe('Forjados')).getByText('HA-30/F/20/XC4')).toBeInTheDocument();
    // Sale dos veces a propósito: en el título del icono de la fila y en la
    // lista de avisos de debajo de la tabla.
    expect(screen.getAllByText(/prevalece la de durabilidad/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 aviso/)).toBeInTheDocument();
  });
});

describe('el interruptor de costa', () => {
  it('endurece el muro con cara vista y no toca la cimentación', () => {
    montar();
    fireEvent.click(screen.getByRole('checkbox'));

    const muro = filaDe('Muros de sótano');
    expect(within(muro).getByText('XC2 + XS1')).toBeInTheDocument();
    expect(within(muro).getByText('300 kg')).toBeInTheDocument();
    expect(within(muro).getByText('40 mm')).toBeInTheDocument();

    const cimentacion = filaDe('Cimentación');
    expect(within(cimentacion).getByText('XC2')).toBeInTheDocument();
    expect(within(cimentacion).getByText('275 kg')).toBeInTheDocument();
  });

  it('explica que los 40 mm son de la cara marina', () => {
    montar();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText(/caras no expuestas a ese ambiente bastaría 30 mm/)).toBeInTheDocument();
  });
});

describe('conmutadores de material', () => {
  it('encender madera abre su tabla y añadir un grupo deriva servicio y uso', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Madera' }));
    expect(screen.getByText('Elementos de madera')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Añadir grupo' }));
    const nombre = screen.getByLabelText('Nombre del grupo');
    fireEvent.change(nombre, { target: { value: 'Vigas y pilares' } });

    const fila = nombre.closest('tr')!;
    expect(within(fila).getByText('II')).toBeInTheDocument(); // clase de servicio
    expect(within(fila).getByText('NP1')).toBeInTheDocument(); // tratamiento
    expect(within(fila).getByText('1,25')).toBeInTheDocument(); // γM de la laminada
  });

  it('encender acero estructural deriva la clase de ejecución', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Acero estructural' }));
    expect(screen.getByText('EXC2')).toBeInTheDocument();

    // CC3 + SC2 + PC2 es la única combinación que llega a EXC4.
    fireEvent.change(screen.getByLabelText(/qué pasaría si fallara/i), { target: { value: 'CC3' } });
    fireEvent.change(screen.getByLabelText(/tipo de cargas/i), { target: { value: 'SC2' } });
    fireEvent.change(screen.getByLabelText(/se fabrica/i), { target: { value: 'PC2' } });
    expect(screen.getByText('EXC4')).toBeInTheDocument();
  });
});

describe('las pestañas del documento', () => {
  it('el cuadro de plano dice lo mismo que el editor', () => {
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));

    expect(screen.getByText('HORMIGÓN (CÓDIGO ESTRUCTURAL)')).toBeInTheDocument();
    expect(screen.getByText('HA-30/F/20/XC1')).toBeInTheDocument();
    expect(screen.getByText('HL-150/B/20')).toBeInTheDocument();
    // El corrugado del perfil de estudio, con su resistencia de cálculo. Los
    // 435 N/mm² salen dos veces: corrugado y mallazo comparten fyk = 500.
    expect(screen.getByText('B 500 SD')).toBeInTheDocument();
    expect(screen.getAllByText('435 N/mm²')).toHaveLength(2);
  });

  it('la pestaña Memoria transpone el mismo cuadro', () => {
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Memoria' }));
    expect(screen.getByText('ELEMENTO ESTRUCTURAL')).toBeInTheDocument();
    expect(screen.getByText('Recubrimiento nominal de las armaduras (mm)')).toBeInTheDocument();
  });

  it('la de anclajes trae la tabla del plano y sólo los hormigones de la obra', () => {
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Anclajes' }));
    // Las cuatro filas por defecto son todas HA-30: no debe salir HA-25.
    expect(screen.getAllByText('HA-30/B500SD')).toHaveLength(2); // anclaje y solape
    expect(screen.queryByText('HA-25/B500SD')).not.toBeInTheDocument();
    expect(screen.getAllByText('Ø25')).toHaveLength(2); // cabecera de anclaje y de solape
  });
});

describe('huecos y exportación', () => {
  it('una fila nueva sin situación se cuenta como hueco', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir elemento' }));
    expect(screen.getByText(/1 sin resolver/)).toBeInTheDocument();
  });

  it('con huecos, exportar avisa en vez de exportar', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir elemento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    expect(screen.getByText('Resuelva los huecos rojos antes de exportar')).toBeInTheDocument();
  });
});

describe('modo Ayuda y persistencia', () => {
  it('apagar Ayuda retira las explicaciones', () => {
    montar();
    expect(screen.getByText(/Marque lo que lleva esta obra/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ayuda/ }));
    expect(screen.queryByText(/Marque lo que lleva esta obra/)).not.toBeInTheDocument();
  });

  it('lo editado sobrevive a recargar el módulo', () => {
    montar();
    fireEvent.change(within(filaDe('Forjados')).getByLabelText('Dónde va a estar'), {
      target: { value: 'exterior_lluvia' },
    });
    expect(localStorage.getItem(STORAGE_KEY)).toContain('exterior_lluvia');

    cleanup();
    montar();
    expect(within(filaDe('Forjados')).getByText('XC4')).toBeInTheDocument();
  });
});
