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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

// El empaquetado del .docx tiene su propio test (`docxEmpaquetado.test.ts`).
// Aquí sólo se prueba el CABLE: que el botón abre el modal, que el título llega
// al exportador y que la descarga sale con el nombre prometido. Empaquetar un
// zip de verdad en cada caso costaría segundos y no probaría nada más.
const exportarMaterialesDocx = vi.fn(async (_blocks: unknown, titulo?: string) => ({
  blob: new Blob(['x'], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.docx` : 'cuadro-de-materiales.docx',
}));
vi.mock('../../lib/docx/materiales', () => ({
  exportarMaterialesDocx: (blocks: unknown, titulo?: string) =>
    exportarMaterialesDocx(blocks, titulo),
}));
const exportarMaterialesXlsx = vi.fn(async (_blocks: unknown, titulo?: string) => ({
  blob: new Blob(['x'], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.xlsx` : 'cuadro-de-materiales.xlsx',
}));
vi.mock('../../lib/xlsx/materiales', () => ({
  exportarMaterialesXlsx: (blocks: unknown, titulo?: string) =>
    exportarMaterialesXlsx(blocks, titulo),
}));
const exportarMaterialesDxf = vi.fn(async (_blocks: unknown, titulo?: string) => ({
  blob: new Blob(['0\r\nEOF\r\n'], { type: 'image/vnd.dxf' }),
  filename: titulo ? `${titulo.toLowerCase().replace(/ /g, '-')}.dxf` : 'cuadro-de-materiales.dxf',
}));
vi.mock('../../lib/dxf/materiales', () => ({
  exportarMaterialesDxf: (blocks: unknown, titulo?: string) =>
    exportarMaterialesDxf(blocks, titulo),
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
  exportarMaterialesDocx.mockClear();
  exportarMaterialesXlsx.mockClear();
  exportarMaterialesDxf.mockClear();
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
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
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
    expect(screen.queryByText(/Resistencia al fuego exigida/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Datos' }));
    fireEvent.change(screen.getByLabelText('Resistencia al fuego'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByText(/Resistencia al fuego exigida a la estructura: R60/)).toBeInTheDocument();
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

  it('los anclajes salen en plano Y en memoria, sin apartado propio', () => {
    // No son una pregunta que se conteste: caen del acero corrugado y de los
    // hormigones que ya hay en la obra, así que viajan con los dos documentos.
    montar();
    expect(screen.queryByRole('tab', { name: 'Anclajes' })).not.toBeInTheDocument();

    for (const pestana of ['Plano', 'Memoria']) {
      fireEvent.click(screen.getByRole('tab', { name: pestana }));
      expect(
        screen.getByText('LONGITUDES DE ANCLAJE EN PROLONGACIÓN RECTA (CÓD-E)'),
      ).toBeInTheDocument();
      expect(screen.getByText('LONGITUDES DE SOLAPE (CÓD-E)')).toBeInTheDocument();
      // Las cuatro filas por defecto son todas HA-30: no debe salir HA-25.
      expect(screen.getAllByText('HA-30/B500SD')).toHaveLength(2); // anclaje y solape
      expect(screen.queryByText('HA-25/B500SD')).not.toBeInTheDocument();
      expect(screen.getAllByText('Ø25')).toHaveLength(2); // cabecera de anclaje y de solape
    }
  });

  it('bajar a B 400 SD reescribe las longitudes: el fyk las gobierna', () => {
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    const conB500 = anclajePosicionI();

    fireEvent.click(screen.getByRole('tab', { name: 'Datos' }));
    fireEvent.change(screen.getByDisplayValue('B 500 SD — alta ductilidad'), {
      target: { value: 'B400SD' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));

    expect(screen.getAllByText('HA-30/B400SD')).toHaveLength(2);
    expect(screen.queryByText('HA-30/B500SD')).not.toBeInTheDocument();
    const conB400 = anclajePosicionI();
    expect(conB400).not.toEqual(conB500);
    // σsd = fyd, así que un acero más blando ancla en menos longitud.
    conB400.forEach((cm, i) => expect(Number(cm)).toBeLessThan(Number(conB500[i])));
  });
});

/** Fila «Posición I» de la primera tabla de anclajes del documento abierto. */
function anclajePosicionI(): string[] {
  const tabla = screen
    .getAllByRole('table')
    .find((t) => within(t).queryByText('Posición I') !== null);
  if (!tabla) throw new Error('no hay tabla de anclajes');
  const fila = within(tabla).getByText('Posición I').closest('tr')!;
  return [...fila.querySelectorAll('td')].slice(1).map((c) => c.textContent!.trim());
}

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
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    expect(screen.getByText('Resuelva los huecos rojos antes de exportar')).toBeInTheDocument();
    // Y NO se abre el modal: escribir un título para chocar después con el aviso
    // es justo el orden que el gate de validez existe para evitar.
    expect(screen.queryByLabelText('Título del elemento')).not.toBeInTheDocument();
  });

  it('sin huecos, exportar abre el modal y promete un .docx', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    expect(screen.getByLabelText('Título del elemento')).toBeInTheDocument();
    // La línea de preview es la misma `titledFilename` que usa el exportador:
    // si aquí pusiera «.pdf», el botón estaría mintiendo sobre el fichero.
    expect(screen.getByText('cuadro-de-materiales.docx')).toBeInTheDocument();
  });

  it('el título confirmado llega al exportador y dispara la descarga', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      descargado = this.download;
    });
    let descargado = '';

    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    fireEvent.change(screen.getByLabelText('Título del elemento'), {
      target: { value: 'Nave taller' },
    });
    // Con el modal abierto hay DOS botones «Exportar Word»: el de la barra y el
    // de confirmar. El que cuenta es el del diálogo.
    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Exportar Word' }));

    await waitFor(() => expect(exportarMaterialesDocx).toHaveBeenCalled());
    expect(exportarMaterialesDocx.mock.calls[0][1]).toBe('Nave taller');
    // Los bloques que se exportan son los de MEMORIA, no los de plano: el
    // cuadro transpuesto abre por «Elementos de hormigón armado».
    const bloques = exportarMaterialesDocx.mock.calls[0][0] as { text?: string }[];
    expect(bloques.some((b) => b.text === 'Elementos de hormigón armado')).toBe(true);
    await waitFor(() => expect(descargado).toBe('nave-taller.docx'));

    click.mockRestore();
  });

  // El botón entrega lo que se está mirando: cada vista tiene su formato porque
  // tiene su destino. El fallo que busca: que la pestaña cambie y el botón siga
  // bajando el documento de la otra.
  it('en la pestaña Plano el botón pasa a Excel y exporta los bloques de plano', async () => {
    montar();
    expect(screen.getByRole('button', { name: 'Exportar Word' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar Word' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(screen.getByText('cuadro-de-materiales.xlsx')).toBeInTheDocument();

    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Exportar Excel' }));

    await waitFor(() => expect(exportarMaterialesXlsx).toHaveBeenCalled());
    expect(exportarMaterialesDocx).not.toHaveBeenCalled();

    // Dos pestañas, y los anclajes en la SUYA: sus celdas son números de dos
    // cifras y compartir columna con el cuadro de hormigón los dejaba estirados.
    const secciones = exportarMaterialesXlsx.mock.calls[0][0] as {
      nombre: string;
      blocks: { text?: string }[];
    }[];
    expect(secciones.map((s) => s.nombre)).toEqual(['Cuadro de materiales', 'Anclajes']);

    const principal = secciones[0].blocks.map((b) => b.text);
    const anclajes = secciones[1].blocks.map((b) => b.text);
    // Los bloques del PLANO, no los de memoria.
    expect(principal).toContain('HORMIGÓN (CÓDIGO ESTRUCTURAL)');
    expect(anclajes).toContain('LONGITUDES DE ANCLAJE EN PROLONGACIÓN RECTA (CÓD-E)');
    // Y ninguno de los dos se cuela en la hoja del otro.
    expect(principal).not.toContain('LONGITUDES DE ANCLAJE EN PROLONGACIÓN RECTA (CÓD-E)');
    expect(anclajes).not.toContain('HORMIGÓN (CÓDIGO ESTRUCTURAL)');
  });

  it('en pantalla y en el Word los anclajes siguen pegados al cuadro de acero', () => {
    // La separación en pestañas es SOLO del Excel: quitarlos también de la vista
    // de plano sería perder una tabla del cuadro que ya se entrega.
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(
      screen.getByText('LONGITUDES DE ANCLAJE EN PROLONGACIÓN RECTA (CÓD-E)'),
    ).toBeInTheDocument();
  });

  it('la vista de plano ofrece SUS DOS salidas: Excel y DXF', () => {
    // Cada vista tiene su destino, y la de plano tiene dos: capturar y CAD. Se
    // nombran los dos en la barra en vez de esconderlos en un desplegable.
    montar();
    expect(screen.queryByRole('button', { name: 'Exportar DXF' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar DXF' })).toBeInTheDocument();
  });

  it('el DXF exporta los bloques de plano y promete un .dxf', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      descargado = this.download;
    });
    let descargado = '';

    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar DXF' }));
    // La preview del modal usa el formato ya elegido: si no, prometería .xlsx.
    expect(screen.getByText('cuadro-de-materiales.dxf')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Título del elemento'), {
      target: { value: 'Nave taller' },
    });
    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Exportar DXF' }));

    await waitFor(() => expect(exportarMaterialesDxf).toHaveBeenCalled());
    expect(exportarMaterialesXlsx).not.toHaveBeenCalled();
    const bloques = exportarMaterialesDxf.mock.calls[0][0] as { text?: string }[];
    // El DXF lleva el cuadro de plano ENTERO, anclajes incluidos: en el CAD no
    // hay pestañas que separar, es un solo dibujo.
    expect(bloques.some((b) => b.text === 'HORMIGÓN (CÓDIGO ESTRUCTURAL)')).toBe(true);
    expect(
      bloques.some((b) => b.text === 'LONGITUDES DE ANCLAJE EN PROLONGACIÓN RECTA (CÓD-E)'),
    ).toBe(true);
    await waitFor(() => expect(descargado).toBe('nave-taller.dxf'));

    click.mockRestore();
  });

  it('vuelto a Memoria, el botón es Word otra vez', () => {
    montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Memoria' }));
    expect(screen.getByRole('button', { name: 'Exportar Word' })).toBeInTheDocument();
  });

  it('sin ningún material encendido no deja exportar un documento vacío', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Hormigón' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Word' }));
    expect(screen.getByText('Añada algún material antes de exportar')).toBeInTheDocument();
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
