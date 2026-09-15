/**
 * El panel de la obra: la pantalla que contesta «¿qué me falta?».
 *
 * Lo que se protege aquí:
 *
 *   1. la obra en blanco no lleva ni un rojo (a quien acaba de empezar no se
 *      le reprocha nada);
 *   2. con una obra a medias, lo que falta sale enumerado y con su destino;
 *   3. el total que dice el panel es EXACTAMENTE el que impide exportar en la
 *      ficha: si los dos se separan, el usuario deja de creerse ninguno de los
 *      dos;
 *   4. el panel se entera de lo que se publica en otro módulo sin recargar;
 *   5. los cuadros que van al plano se bajan de aquí, todos en un fichero, y
 *      sólo los de los módulos que alguien haya rellenado.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ToastContainer } from '../../components/ui/Toast';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ObraModule } from '../../features/obra';
import { resumenDeObra } from '../../features/obra/resumen';
import { cargarEstado, guardarEstado } from '../../features/memoria-dbse/state';
import { leerSobres } from '../../features/memoria-dbse/sobres';
import { evaluar } from '../../lib/memoria/ensamblar';
import {
  defaultMaterialesState,
  evaluar as evaluarMateriales,
  filaDesdePreset,
  guardarEstado as guardarMateriales,
  nuevoId,
  publicarResultado as publicarMateriales,
} from '../../features/materiales/state';
import { guardarObra } from '../../lib/obra';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

function montar() {
  return render(
    <MemoryRouter initialEntries={['/obra']}>
      <ThemeProvider>
        <UnitSystemProvider>
          <ObraModule />
          {/* Vive en la raíz de la app, no en el módulo: sin él los avisos de
              «no hay ningún cuadro» no tendrían dónde pintarse. */}
          <ToastContainer />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const obraGranada = () => guardarObra({ denominacion: 'Edificio en Granada', municipio: 'Granada', provincia: '18', altitud: 680, uso: 'Edificio de viviendas' });

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
});

afterEach(() => {
  cleanup();
});

describe('la obra en blanco', () => {
  it('no tiene un solo rojo, y enseña de dónde sale todo', async () => {
    montar();
    expect(await screen.findByText('Por dónde se empieza')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cuadro de materiales/ })).toHaveAttribute('href', '/memorias/materiales');

    // Ni un `state-fail` en el DOM, y ni una palabra «falta».
    await waitFor(() => expect(screen.getAllByText('sin empezar').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('.text-state-fail')).toHaveLength(0);
    expect(screen.queryByText('falta')).toBeNull();
  });
});

describe('una obra a medias', () => {
  it('dice cuántos datos faltan y lleva a resolverlos', async () => {
    obraGranada();
    montar();

    expect(await screen.findByText(/Faltan \d+ datos para poder exportar/)).toBeInTheDocument();
    // La acción lleva a la PRIMERA falta (R2): con nada calculado, el cuadro de
    // materiales, no la ficha para que la ficha diga «Abrir el módulo».
    expect(screen.getByRole('link', { name: 'Resolver lo que falta' })).toHaveAttribute('href', '/memorias/materiales');

    // Cada módulo sin calcular es una fila con su destino.
    const fila = await screen.findByRole('link', { name: /Cuadro de materiales: falta/ });
    expect(fila).toHaveAttribute('href', '/memorias/materiales');
  });

  it('un módulo opcional sin publicar está «sin empezar», no «no procede»', async () => {
    obraGranada();
    montar();

    // Viento y nieve no bloquea (la zona sale de la provincia), pero decir «no
    // procede» en la misma pantalla donde ese estado significa «este capítulo
    // no va en esta obra» son dos cosas con una palabra.
    const fila = await screen.findByRole('link', { name: /Viento y nieve: sin empezar/ });
    expect(fila).toHaveAttribute('href', '/acciones/viento-nieve');
    expect(screen.queryByRole('link', { name: /Viento y nieve: no procede/ })).toBeNull();
  });

  it('el total del panel es el mismo que impide exportar en la ficha, también con un dato de obra sin rellenar', async () => {
    // Sin uso a propósito: es un dato de obra que falta, y la versión anterior
    // del panel lo contaba dos veces (una dentro de `faltan` y otra en
    // `datosObra`). Con la obra completa el fallo no se veía.
    guardarObra({ denominacion: 'Edificio en Granada', municipio: 'Granada', provincia: '18', altitud: 680, uso: '' });
    const r = resumenDeObra();
    const ev = evaluar(cargarEstado(), leerSobres());
    const faltasFicha = ev.huecos.filter((h) => h.estado === 'falta').length;

    expect(r.datosObra).toEqual(['Uso principal del edificio']);
    expect(r.faltan).toBe(faltasFicha);
    expect(ev.listo).toBe(r.faltan === 0);

    // Y lo que se pinta dice ese número, no otro.
    montar();
    expect(await screen.findByText(`Faltan ${faltasFicha} datos para poder exportar la justificación.`)).toBeInTheDocument();
  });

  it('se entera de lo que se publica en otro módulo sin recargar', async () => {
    obraGranada();
    montar();
    await screen.findByRole('link', { name: /Cuadro de materiales: falta/ });

    // Otro módulo publica un cuadro de verdad, no el de arranque.
    const m = { ...defaultMaterialesState(), costa: true };
    publicarMateriales(m, evaluarMateriales(m));

    await waitFor(() => expect(screen.getByRole('link', { name: /Cuadro de materiales: hecho/ })).toBeInTheDocument());
  });

  it('lo hecho se pliega y lo que falta sale entero (R1)', async () => {
    obraGranada();
    montar();

    // Las faltas, a la vista; las cuatro secciones hechas de la ficha, en una fila.
    const plegado = await screen.findByRole('button', { name: /4 comprobaciones hechas/ });
    expect(plegado).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: /El terreno y la cimentación: falta/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /La estructura y las juntas: hecho/ })).toBeNull();

    fireEvent.click(plegado);
    expect(plegado).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /La estructura y las juntas: hecho/ })).toBeInTheDocument();
  });

  it('un módulo calculado y sin guardar en el anejo sale en el bloque del anejo (D12)', async () => {
    obraGranada();
    // Unas vigas calculadas y ninguna pieza en el anejo: trabajo vivo que NO
    // está en el documento que se entrega, y el panel no lo decía.
    localStorage.setItem('rc-beams', JSON.stringify({ luz: 5 }));
    localStorage.setItem('rc-beams-version', '1');
    montar();

    const fila = await screen.findByRole('link', { name: /Vigas de hormigón: revíselo, calculado y sin guardar en el anejo/ });
    expect(fila).toHaveAttribute('href', '/horm/vigas');
  });

  it('pero las memorias no se cuentan dos veces: su estado ya está en los dos bloques de arriba (R9)', async () => {
    obraGranada();
    guardarEstado(cargarEstado());
    montar();

    await screen.findByText(/Faltan \d+ datos/);
    expect(screen.queryByRole('link', { name: /Cumplimiento del DB SE: revíselo, calculado y sin guardar/ })).toBeNull();
  });
});

describe('los cuadros para el plano', () => {
  /**
   * La tarjeta y el recuento salen de un `import()` perezoso —el chunk trae el
   * estado y los cuadros de los cuatro módulos—, así que aquí se espera más de
   * lo habitual: con la suite entera en marcha, transformar ese chunk se pasa
   * del segundo por defecto de `findBy`.
   */
  const ESPERA = { timeout: 8000 };

  it('en una obra en blanco no hay ni botón de exportar', async () => {
    // Nada que bajar y ningún reproche: la misma regla que la banda de «por
    // dónde se empieza».
    montar();
    await screen.findByText('Por dónde se empieza');
    expect(screen.queryByRole('button', { name: 'Exportar' })).toBeNull();
  });

  it('la tarjeta dice que no hay ninguno mientras nadie haya rellenado un módulo', async () => {
    obraGranada();
    montar();
    expect(
      await screen.findByText(/Ninguno todavía: salen de materiales, viento y nieve, cargas por planta e incendio\./, {}, ESPERA),
    ).toBeInTheDocument();
  });

  it('con un módulo relleno, la tarjeta lo nombra y cuenta cuántos hay', async () => {
    obraGranada();
    const m = defaultMaterialesState();
    m.elementos = [{ ...filaDesdePreset('Cimentación'), id: nuevoId(), fck: 35 }];
    guardarMateriales(m);
    montar();

    // El botón de la tarjeta baja el DXF; el menú de la barra, los dos formatos.
    const tarjeta = await screen.findByRole('button', { name: /Cuadros para el plano.*Descargar el DXF/s }, ESPERA);
    expect(tarjeta).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1 de 4 cuadros')).toBeInTheDocument(), ESPERA);
    expect(screen.getByText(/Cuadro de materiales\. En un solo fichero\./)).toBeInTheDocument();
  });

  it('el menú de la barra ofrece el DXF y el Excel, y nada de la memoria', async () => {
    obraGranada();
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar' }));

    const menu = screen.getByRole('menu', { name: 'Formatos de exportación' });
    expect(menu).toBeInTheDocument();
    const opciones = screen.getAllByRole('menuitem').map((b) => b.textContent);
    expect(opciones).toHaveLength(2);
    expect(opciones[0]).toMatch(/^DXF/);
    expect(opciones[1]).toMatch(/^Excel/);
  });

  it('pedirlos sin ningún módulo relleno lo dice en vez de bajar un fichero vacío', async () => {
    obraGranada();
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^DXF/ }));

    expect(
      await screen.findByText(/Todavía no hay ningún cuadro que llevar al plano/, {}, ESPERA),
    ).toBeInTheDocument();
  });

  it('los cuadros NO entran en el medidor: un plano no es obligatorio para entregar', async () => {
    // Contarlos dejaría en «falta algo» a toda obra que no vaya a CAD.
    obraGranada();
    montar();
    const antes = (await screen.findByText(/\d+ de \d+ comprobaciones resueltas/)).textContent;

    cleanup();
    const m = defaultMaterialesState();
    m.elementos = [{ ...filaDesdePreset('Cimentación'), id: nuevoId(), fck: 35 }];
    guardarMateriales(m);
    montar();
    await waitFor(() => expect(screen.getByText('1 de 4 cuadros')).toBeInTheDocument(), ESPERA);
    const total = (n: string | null) => n?.split(' de ')[1];
    expect(total(screen.getByText(/\d+ de \d+ comprobaciones resueltas/).textContent)).toBe(total(antes ?? null));
  });
});
