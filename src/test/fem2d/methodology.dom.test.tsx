// FEM 2D — panel «Cómo calcula este módulo» (documentación del método).
//
// Dos contratos:
//   1) CONTENIDO (datos, methodology.ts): las limitaciones conocidas del motor
//      no pueden desaparecer en un refactor — cada hallazgo de auditoría que
//      quedó como limitación documentada (H3, fórmula de planta vs autovalores,
//      β = 1, 1º orden) tiene aquí su ancla, igual que las piezas del 2º orden
//      (§5.3.2, exención 0,15·V, sismo, NOTA 2B).
//   2) UI (Fem2DResults): el enlace vive al final del panel de resultados,
//      abre el modal con todas las secciones y cierra con Escape.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fem2DResults } from '../../features/fem2d/Fem2DResults';
import { FEM2D_METHOD_SECTIONS } from '../../features/fem2d/methodology';
import { analyzeFem2D } from '../../features/fem2d/pipeline';
import { FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';

const allText = (id: string): string =>
  FEM2D_METHOD_SECTIONS.find((s) => s.id === id)!.items.join(' ');

describe('methodology.ts — el contenido documenta lo que el motor hace y lo que no', () => {
  it('ids únicos y ninguna sección vacía', () => {
    const ids = FEM2D_METHOD_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of FEM2D_METHOD_SECTIONS) {
      expect(s.title.length, s.id).toBeGreaterThan(0);
      expect(s.items.length, s.id).toBeGreaterThan(0);
    }
  });

  it('las limitaciones de la auditoría αcr están escritas — no pueden borrarse en silencio', () => {
    const lim = allText('limitaciones');
    // H3: amplificación por hipótesis, no por dirección.
    expect(lim).toContain('NO se amplifica');
    expect(lim).toMatch(/bajo G o Q/);
    // Fórmula de planta, no autovalores; método simplificado, no P-Δ.
    expect(lim).toContain('autovalores');
    expect(lim).toContain('P-Δ');
    // Longitud de sistema β = 1 y su cobertura por la vía global.
    expect(lim).toContain('β = 1');
    // Alcance del módulo.
    expect(lim).toContain('Predimensionamiento');
  });

  it('el bloque de 2º orden cuenta las piezas completas: umbrales, sismo, NOTA 2B, §5.3.2 y exención', () => {
    const a = allText('alphacr');
    expect(a).toContain('1/(1−1/αcr)');
    expect(a).toContain('EN 1998-1');
    expect(a).toContain('NOTA 2B');
    expect(a).toContain('H = φ·V');
    expect(a).toContain('0,15·V_Ed');
    expect(a).toContain('± Hφ');
  });

  it('el enrutado por mecanismo y el PENDIENTE de HA están documentados (Fase 2)', () => {
    expect(allText('acero')).toContain('MECANISMO');
    expect(allText('ha')).toContain('PENDIENTE');
    expect(allText('analisis')).toMatch(/biela.*DERIVA/i);
  });

  it('convenios y peso propio: las afirmaciones FÍSICAS, que no pueden divergir del motor', () => {
    // Convenio de ejes: si algún día +y pasara a apuntar hacia abajo, este
    // texto miente en la cara del usuario.
    expect(allText('convenios')).toContain('+y hacia ARRIBA');
    expect(allText('convenios')).toMatch(/ejes globales o LOCALES/i);
    // Regla de Fase 0: el peso propio se concentra en nudos SOLO en la biela,
    // y por eso no impide la derivación (decompose.memberFormulation).
    expect(allText('datos')).toMatch(/repartida a lo largo de la barra/i);
    expect(allText('datos')).toMatch(/mitad en cada nudo/i);
    expect(allText('datos')).toContain('NO impide');
  });

  it('coeficientes parciales y semáforo: los números de la app, no genéricos', () => {
    const c = allText('coeficientes');
    expect(c).toContain('γM0 = γM1 = 1,05');
    expect(c).toContain('γc = 1,50 y γs = 1,15');
    expect(c).toContain('γM = 1,30');
    expect(c).toContain('95%'); // WARN_UTIL = 0.95: la frontera verde/ámbar documentada
  });
});

describe('Fem2DResults — enlace y panel de documentación', () => {
  const portal = FEM2D_TEMPLATES['portal-frame'].build(FEM2D_TEMPLATES['portal-frame'].defaults());
  const result = analyzeFem2D(portal);

  function renderResults() {
    render(
      <UnitSystemProvider>
        <Fem2DResults model={portal} result={result} validationErrors={[]} />
      </UnitSystemProvider>,
    );
  }

  it('el enlace abre el panel con TODAS las secciones y Escape lo cierra', async () => {
    renderResults();
    const link = screen.getByRole('button', { name: /Cómo calcula este módulo/ });
    await userEvent.click(link);
    const dialog = screen.getByRole('dialog', { name: 'Cómo calcula este módulo' });
    expect(dialog).toBeTruthy();
    for (const s of FEM2D_METHOD_SECTIONS) {
      expect(screen.getByText(s.title), s.id).toBeTruthy();
    }
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Cómo calcula este módulo' })).toBeNull();
  });
});
