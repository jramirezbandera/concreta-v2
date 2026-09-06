/**
 * La sección del edificio: que el dibujo dice lo que dice el cálculo.
 *
 * Lo que se comprueba aquí es la traducción de números a geometría —el alto
 * del bloque ES la carga— y la selección en los dos sentidos. Que las cotas
 * salgan de las filas de la tabla se prueba en `module.dom.test.tsx`: aquí el
 * SVG recibe el reparto uniforme, que es lo que usa cuando la sección se
 * coloca debajo de la tabla.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SeccionSVG } from '../../features/cargas-planta/SeccionSVG';
import { calcularCargas } from '../../lib/acciones/cargas';
import { defaultCargasState, entradaMotor, nuevaZona } from '../../features/cargas-planta/state';

/** El edificio de arranque, con una piscina en planta baja que carga el triple. */
function resultado(conPiscina = true) {
  const s = defaultCargasState();
  const baja = s.plantas.find((p) => p.nombre === 'Planta Baja')!;
  baja.zonas[0].nombre = 'Vivienda';
  if (conPiscina) {
    baja.zonas.push({
      ...nuevaZona(false, 'Vaso piscina'),
      forjado: { tipo: 'losa', canto: 20, ppManual: null },
      permanentes: [{ id: 'agua', concepto: 'Agua', valor: 12, catalogoId: 'agua', espesor: 1.2 }],
    });
  }
  return calcularCargas(entradaMotor(s));
}

const pintar = (props: Partial<Parameters<typeof SeccionSVG>[0]> = {}) => {
  const r = props.resultado ?? resultado();
  return render(
    <SeccionSVG resultado={r} cotas={[]} lineales={r.lineales} zonaSel={null} onSeleccionar={vi.fn()} width={232} height={560} {...props} />,
  );
};

/** El alto del rectángulo de carga variable (azul) de un bloque. */
const altoDe = (nombre: string) => {
  const g = screen.getByRole('button', { name: `Seleccionar ${nombre}` });
  return [...g.querySelectorAll('rect')].reduce((max, r) => Math.max(max, Number(r.getAttribute('height') ?? 0)), 0);
};

describe('la sección', () => {
  it('dibuja un bloque por zona, con el rótulo de su carga de cálculo', () => {
    pintar();
    expect(screen.getAllByRole('button', { name: /^Seleccionar / })).toHaveLength(4);
    // Los números del cuadro del estudio: las dos plantas de vivienda cargan igual.
    expect(screen.getAllByText('12,45')).toHaveLength(2);
    expect(screen.getByText('25,95')).toBeInTheDocument();
    expect(screen.getByText('11,63')).toBeInTheDocument();
  });

  it('el alto del bloque es la carga: el vaso de piscina dobla a la vivienda', () => {
    pintar();
    expect(altoDe('Planta Baja (Vaso piscina)')).toBeGreaterThan(altoDe('Planta Baja (Vivienda)') * 1.5);
  });

  it('un forjado sin peso en la norma se dibuja a trazos y se rotula como hueco', () => {
    const s = defaultCargasState();
    s.plantas.find((p) => p.nombre === 'Planta Baja')!.zonas[0].forjado = { tipo: 'madera', canto: 0, ppManual: null };
    pintar({ resultado: calcularCargas(entradaMotor(s)) });

    expect(screen.getByText('¿PP?')).toBeInTheDocument();
    const hueco = screen.getByRole('button', { name: 'Seleccionar Planta Baja' });
    expect(hueco.querySelector('rect[stroke-dasharray]')).not.toBeNull();
  });

  it('pulsar un bloque selecciona su zona, y volver a pulsarlo la suelta', () => {
    const onSeleccionar = vi.fn();
    const r = resultado();
    const id = r.plantas.find((p) => p.nombre === 'Planta Baja')!.zonas[0].id!;
    const { rerender } = pintar({ resultado: r, onSeleccionar });

    fireEvent.click(screen.getByRole('button', { name: 'Planta Baja (Vivienda)'.replace(/^/, 'Seleccionar ') }));
    expect(onSeleccionar).toHaveBeenCalledWith(id);

    rerender(<SeccionSVG resultado={r} cotas={[]} lineales={r.lineales} zonaSel={id} onSeleccionar={onSeleccionar} width={232} height={560} />);
    const bloque = screen.getByRole('button', { name: 'Seleccionar Planta Baja (Vivienda)' });
    expect(bloque).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(bloque);
    expect(onSeleccionar).toHaveBeenLastCalledWith(null);
  });

  it('se maneja con el teclado, como el resto de lienzos de la app', () => {
    const onSeleccionar = vi.fn();
    pintar({ onSeleccionar });
    const bloque = screen.getByRole('button', { name: 'Seleccionar Cubierta' });
    expect(bloque).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(bloque, { key: 'Enter' });
    expect(onSeleccionar).toHaveBeenCalledTimes(1);
  });

  it('sin plantas no dibuja edificio, pero sigue siendo un dibujo con su título', () => {
    const vacio = { ...resultado(), plantas: [] };
    pintar({ resultado: vacio });
    expect(screen.getByRole('img', { name: /Sección del edificio/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Seleccionar / })).not.toBeInTheDocument();
  });
});
