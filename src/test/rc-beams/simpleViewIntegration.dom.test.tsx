// rc-beams Chunk 4 — simple-mode integration into the module shell.
//
// - mode=simple (DEFAULT desde 2026-05) monta RCBeamSimpleView con 3 SVGs +
//   header MRd/Md + narrativa
// - mode=portico mantiene la vista clásica (2 SVGs vano+apoyo)
// - mode=simple oculta el tab 'Diagramas' del MobileTabBar

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { RCBeamsModule } from '../../features/rc-beams';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { rcBeamDefaults } from '../../data/defaults';

function renderModulePortico() {
  // Forzamos estado explícito mode='portico' para evitar contaminación.
  window.localStorage.setItem(
    'rc-beams',
    JSON.stringify({ ...rcBeamDefaults, mode: 'portico' }),
  );
  window.localStorage.setItem('rc-beams-version', '1');
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <UnitSystemProvider>
          <RCBeamsModule />
        </UnitSystemProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function renderModuleDefault() {
  // Default state (sin forzar mode): debe usar el default de rcBeamDefaults ('simple').
  window.localStorage.setItem('rc-beams', JSON.stringify(rcBeamDefaults));
  window.localStorage.setItem('rc-beams-version', '1');
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <UnitSystemProvider>
          <RCBeamsModule />
        </UnitSystemProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function renderModuleSimple() {
  window.localStorage.setItem(
    'rc-beams',
    JSON.stringify({ ...rcBeamDefaults, mode: 'simple' }),
  );
  window.localStorage.setItem('rc-beams-version', '1');
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <UnitSystemProvider>
          <RCBeamsModule />
        </UnitSystemProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('RCBeamsModule — Chunk 4 simple-mode integration', () => {
  it('default (mode=simple): monta RCBeamSimpleView, NO monta VANO+APOYO clásico', () => {
    const { container } = renderModuleDefault();
    // El nuevo default 'simple' muestra header MRd/Md, no las cabeceras VANO/APOYO
    expect(container.textContent).toMatch(/Md \(solicitud\)/i);
    expect(container.textContent).not.toContain('VANO — M+');
    expect(container.textContent).not.toContain('APOYO — M−');
  });

  it('mode=portico (explícito): monta vista clásica con vano+apoyo SVGs', () => {
    const { container } = renderModulePortico();
    // Busca "VANO — M+" en algún span del canvas SVG
    expect(container.textContent).toContain('VANO');
    expect(container.textContent).toContain('APOYO');
  });

  it('mode=simple: monta RCBeamSimpleView con header MRd/Md', () => {
    const { container } = renderModuleSimple();
    // Header del simple-view muestra "Md (solicitud)" + "MRd (capacidad)"
    expect(container.textContent).toMatch(/Md \(solicitud\)/i);
    expect(container.textContent).toMatch(/MRd \(capacidad\)/i);
    // Y el % capacidad
    expect(container.textContent).toMatch(/% capacidad/i);
  });

  it('mode=simple: NO monta el dual VANO+APOYO clásico', () => {
    const { container } = renderModuleSimple();
    // El layout simple no muestra "VANO — M+" ni "APOYO — M−"
    expect(container.textContent).not.toContain('VANO — M+');
    expect(container.textContent).not.toContain('APOYO — M−');
  });

  it('mode=simple: muestra los 3 SVGs del nuevo viewer', () => {
    const { container } = renderModuleSimple();
    // Strain SVG tiene aria-label con ε_top/ε_s
    expect(container.querySelector('svg[aria-label*="Diagrama de deformación"]')).not.toBeNull();
    // Forces SVG tiene aria-label con F_c/F_s/F_s'
    expect(container.querySelector('svg[aria-label*="Fuerzas movilizadas"]')).not.toBeNull();
  });

  it('mode=simple: muestra narrativa interpretativa', () => {
    const { container } = renderModuleSimple();
    // La narrativa debe contener alguna de las palabras clave del builder.
    const text = container.textContent ?? '';
    expect(text).toMatch(/sección|capacidad|fisurada|descargada|ELU/i);
  });

  it('mode=simple: oculta el tab Diagramas en MobileTabBar', () => {
    renderModuleSimple();
    // Datos y Resultados siguen presentes
    expect(screen.getByRole('button', { name: /datos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resultados/i })).toBeInTheDocument();
    // 'Diagramas' NO aparece (integrado en RCBeamSimpleView)
    expect(screen.queryByRole('button', { name: /^diagramas$/i })).toBeNull();
  });

  it('mode=portico (explícito): muestra los 3 tabs incluyendo Diagramas', () => {
    renderModulePortico();
    expect(screen.getByRole('button', { name: /datos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /diagramas/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resultados/i })).toBeInTheDocument();
  });
});
