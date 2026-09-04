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
    fireEvent.click(screen.getByRole('checkbox', { name: /en la costa/ }));

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
    fireEvent.click(screen.getByRole('checkbox', { name: /en la costa/ }));
    expect(screen.getByText(/caras no expuestas a ese ambiente bastaría 30 mm/)).toBeInTheDocument();
  });
});

describe('heladas y terreno agresivo', () => {
  it('marcar «heladas» añade XF1 al muro con cara vista', () => {
    montar();
    fireEvent.click(screen.getByRole('checkbox', { name: /heladas/ }));
    expect(within(filaDe('Muros de sótano')).getByText('XC2 + XF1')).toBeInTheDocument();
    expect(within(filaDe('Cimentación')).getByText('XC2')).toBeInTheDocument();
  });

  it('un terreno XA1 sube la cimentación a XC2 + XA1 y 50 mm', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Agresividad del terreno'), {
      target: { value: 'debil' },
    });
    const cimentacion = filaDe('Cimentación');
    expect(within(cimentacion).getByText('XC2 + XA1')).toBeInTheDocument();
    expect(within(cimentacion).getByText('50 mm')).toBeInTheDocument();
  });

  it('un terreno XA2 deja el recubrimiento en guion y bloquea exportar', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Agresividad del terreno'), {
      target: { value: 'moderada' },
    });
    const cimentacion = filaDe('Cimentación');
    expect(within(cimentacion).getByText('XC2 + XA2')).toBeInTheDocument();
    // Anclado: las opciones de consistencia también dicen «(50-90 mm)».
    expect(within(cimentacion).queryByText(/^\d+ mm$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    expect(screen.getByText('Resuelva los huecos rojos antes de exportar')).toBeInTheDocument();
  });
});

describe('conmutadores de material', () => {
  it('encender madera abre su tabla y añadir un grupo deriva servicio y uso', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Madera' }));
    expect(screen.getByText('Elementos de madera')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Añadir grupo' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Vigas y pilares' }));

    const nombre = screen.getByLabelText('Nombre del grupo') as HTMLInputElement;
    expect(nombre.value).toBe('Vigas y pilares');
    const fila = nombre.closest('tr')!;
    expect(within(fila).getByText('II')).toBeInTheDocument(); // clase de servicio
    expect(within(fila).getByText('NP1')).toBeInTheDocument(); // tratamiento
    expect(within(fila).getByText('1,25')).toBeInTheDocument(); // γM de la laminada
  });

  it('con S355 soldado, el formulario avisa de que la categoría es PC2', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Acero estructural' }));
    fireEvent.change(screen.getByDisplayValue('S275 JR'), { target: { value: 'S355JR' } });
    expect(screen.getByText(/son categoría de ejecución PC2/)).toBeInTheDocument();
  });

  it('la resistencia al fuego sólo sale en el documento si se indica', () => {
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.queryByText(/La estructura será R/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Datos' }));
    fireEvent.change(screen.getByLabelText('Resistencia al fuego'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByText(/La estructura será R60/)).toBeInTheDocument();
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

describe('consistencia — CE 33.5', () => {
  it('el desplegable ofrece las cinco clases de la tabla 33.5.a, con su cono', () => {
    montar();
    const select = within(filaDe('Forjados')).getByLabelText(
      'Consistencia',
    ) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([
      'seca',
      'plastica',
      'blanda',
      'fluida',
      'liquida',
    ]);
    expect([...select.options].map((o) => o.textContent)).toContain('Blanda (50-90 mm)');
  });

  it('bajar un forjado de fluida a blanda avisa, y la tipificación cambia de letra', () => {
    montar();
    fireEvent.change(within(filaDe('Forjados')).getByLabelText('Consistencia'), {
      target: { value: 'blanda' },
    });
    expect(within(filaDe('Forjados')).getByText('HA-30/B/20/XC1')).toBeInTheDocument();
    expect(screen.getAllByText(/pilares, forjados y vigas/i).length).toBeGreaterThan(0);
  });

  it('la consistencia seca avisa de que necesita justificación específica', () => {
    montar();
    fireEvent.change(within(filaDe('Cimentación')).getByLabelText('Consistencia'), {
      target: { value: 'seca' },
    });
    expect(screen.getAllByText(/justificación específica/i).length).toBeGreaterThan(0);
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

  it('la Memoria lleva TODOS los materiales, no sólo el hormigón', () => {
    // El fallo que arregla este test: `bloquesMemoria` sólo construía el cuadro
    // de hormigón, así que encender acero o madera no cambiaba nada en esa
    // pestaña. Se veía como un problema de renderizado y era de construcción.
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Acero estructural' }));
    fireEvent.click(screen.getByRole('button', { name: 'Madera' }));
    anadir('+ Añadir grupo', 'Vigas y pilares');
    fireEvent.click(screen.getByRole('tab', { name: 'Memoria' }));

    expect(screen.getByText('ELEMENTO ESTRUCTURAL')).toBeInTheDocument();
    expect(screen.getByText('ACERO (SEGÚN CÓDIGO ESTRUCTURAL / DB-SE-A)')).toBeInTheDocument();
    expect(screen.getByText(/ELEMENTOS ESTRUCTURALES DE ACERO/)).toBeInTheDocument();
    expect(screen.getByText('MADERA')).toBeInTheDocument();
    expect(screen.getByText('DURABILIDAD MADERA')).toBeInTheDocument();
    expect(screen.getByText('COEFICIENTES DE MINORACIÓN')).toBeInTheDocument();
  });

  it('plano y memoria enseñan los mismos materiales, sólo cambia el hormigón', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Acero estructural' }));

    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    const enPlano = screen.getAllByRole('table').length;
    fireEvent.click(screen.getByRole('tab', { name: 'Memoria' }));
    expect(screen.getAllByRole('table').length).toBe(enPlano);
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

/** Abre el menú de añadir y elige una de sus opciones. */
function anadir(boton: string, opcion: string) {
  fireEvent.click(screen.getByRole('button', { name: boton }));
  fireEvent.click(screen.getByRole('menuitem', { name: opcion }));
}

describe('añadir elementos', () => {
  it('el nombre es texto libre: no le cuelga ninguna lista cerrada', () => {
    // Regresión del datalist que se retiró: la flecha hacía parecer que el
    // nombre se elegía de una lista, como los desplegables de al lado, cuando
    // una fila se puede llamar «Brochal del hueco de la escalera».
    montar();
    for (const i of screen.getAllByLabelText('Nombre del elemento')) {
      expect(i).not.toHaveAttribute('list');
    }
  });

  it('elegir un elemento habitual trae la fila ya resuelta', () => {
    montar();
    anadir('+ Añadir elemento', 'Pilares');

    const fila = filaDe('Pilares');
    expect((within(fila).getByLabelText('Dónde va a estar') as HTMLSelectElement).value).toBe(
      'interior_seco',
    );
    expect(within(fila).getByText('XC1')).toBeInTheDocument();
    // Con dígito delante: la leyenda del pie también dice «sin resolver».
    expect(screen.queryByText(/\d+ sin resolver/)).not.toBeInTheDocument();
  });

  it('el menú se cierra al elegir', () => {
    montar();
    anadir('+ Añadir elemento', 'Pilares');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('huecos y exportación', () => {
  it('una fila nueva sin situación se cuenta como hueco', () => {
    montar();
    anadir('+ Añadir elemento', 'Otro… (fila en blanco)');
    expect(screen.getByText(/1 sin resolver/)).toBeInTheDocument();
  });

  it('con huecos, exportar avisa en vez de exportar', () => {
    montar();
    anadir('+ Añadir elemento', 'Otro… (fila en blanco)');
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
