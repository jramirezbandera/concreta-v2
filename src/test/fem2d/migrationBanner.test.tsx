// FEM 2D — banner de migración: procedencia del MODELO, no de la sesión.
//
// INCIDENTE (2026-07-30, reportado con captura): el banner «este enlace se creó
// con un modelo de datos anterior» aparecía sobre una CERCHA recién elegida en
// la landing de plantillas. La plantilla no tiene nada de heredado —
// `templates.ts` estampa `displayGroup`/`deflLimit` y usa el azúcar
// `twoForce()`—, así que el aviso era falso: el flag se resolvía UNA vez en el
// montaje (localStorage con el esquema viejo) y se quedaba pegado toda la
// sesión, sobreviviendo al reemplazo del modelo.
//
// Dos contratos, uno por capa:
//   1) DATOS: ninguna plantilla dispara el normalizador (si una lo hiciera,
//      estaría emitiendo campos del esquema anterior — un bug de plantilla).
//   2) ESTADO: `resetModel` (plantilla / estructura nueva) apaga el banner;
//      `setModel` (edición normal) lo conserva — mientras el contenido migrado
//      siga en el modelo, el recordatorio de revisar HA y flecha sigue vigente.

import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { encodeShareString, normalizeLegacyModel } from '../../features/fem2d/serialize';
import { buildTemplateWithDefaults, FEM2D_TEMPLATES } from '../../features/fem2d/templates';
import { TEMPLATE_ORDER } from '../../features/fem2d/uiState';
import { useFem2DState } from '../../features/fem2d/useFem2DState';
import type { Fem2DModel } from '../../features/fem2d/types';

describe('plantillas — ninguna emite campos del esquema anterior', () => {
  it('las 4 plantillas pasan el normalizador SIN marcar migración', () => {
    for (const id of TEMPLATE_ORDER) {
      const model = buildTemplateWithDefaults(id);
      const res = normalizeLegacyModel(model);
      expect(res.migrated, `${id} no debe necesitar migración`).toBe(false);
      // Sin migración el normalizador devuelve el MISMO objeto (no copia).
      expect(res.model, id).toBe(model);
    }
  });

  it('cada barra de plantilla lleva los campos de la Fase 2 y ninguno del rol', () => {
    for (const id of TEMPLATE_ORDER) {
      const model = buildTemplateWithDefaults(id);
      for (const m of model.members) {
        const raw = m as Record<string, unknown>;
        expect('role' in raw, `${id}/${m.id}`).toBe(false);
        expect('elementType' in raw, `${id}/${m.id}`).toBe(false);
        expect('roleManual' in raw, `${id}/${m.id}`).toBe(false);
        // displayGroup (presentación) y deflLimit (dato de proyecto) explícitos:
        // dejarlos al fallback haría que el agrupado dependiera de la geometría.
        expect(m.displayGroup, `${id}/${m.id} displayGroup`).toBeDefined();
        expect(m.deflLimit, `${id}/${m.id} deflLimit`).toBeDefined();
      }
    }
  });
});

/** Modelo v2 ANTIGUO (con rol/elementType) que la app serializaba pre-Fase 2. */
function legacyModel(): Record<string, unknown> {
  const steel = { profileKey: 'steel_IPE240', steel: 'S275' };
  return {
    templateId: 'custom',
    selfWeight: false,
    nodes: [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 0, y: 3 },
      { id: 'n3', x: 4, y: 3 },
      { id: 'n4', x: 4, y: 0 },
    ],
    members: [
      { id: 'p1', i: 'n1', j: 'n2', role: 'pilar', elementType: 'beam-column', material: 'steel', steelSelection: steel, releases: { i: false, j: false } },
      { id: 'v1', i: 'n2', j: 'n3', role: 'viga', elementType: 'beam-column', material: 'steel', steelSelection: steel, releases: { i: false, j: false } },
      { id: 'p2', i: 'n4', j: 'n3', role: 'pilar', elementType: 'beam-column', material: 'steel', steelSelection: steel, releases: { i: false, j: false } },
    ],
    supports: [{ node: 'n1', type: 'pinned' }, { node: 'n4', type: 'pinned' }],
    loads: [{ id: 'l1', kind: 'node', lc: 'G', node: 'n3', Fx: 0, Fy: -10 }],
  };
}

describe('useFem2DState — el banner sigue al modelo, no a la sesión', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/analisis/fem2d');
  });

  it('un modelo heredado en localStorage enciende el banner…', () => {
    localStorage.setItem('concreta-fem2d', JSON.stringify(legacyModel()));
    localStorage.setItem('concreta-fem2d-v', '2');
    const { result } = renderHook(() => useFem2DState());
    expect(result.current.migratedFromLegacy).toBe(true);
    // Y el modelo hidratado ya viene traducido al esquema nuevo.
    const p1 = result.current.model.members.find((m) => m.id === 'p1')!;
    expect(p1.displayGroup).toBe('pilar');
    expect('role' in (p1 as Record<string, unknown>)).toBe(false);
  });

  it('…y elegir una plantilla lo APAGA (el modelo nuevo no tiene nada heredado)', () => {
    localStorage.setItem('concreta-fem2d', JSON.stringify(legacyModel()));
    localStorage.setItem('concreta-fem2d-v', '2');
    const { result } = renderHook(() => useFem2DState());
    expect(result.current.migratedFromLegacy).toBe(true);

    act(() => result.current.resetModel(buildTemplateWithDefaults('pratt-truss')));
    expect(result.current.migratedFromLegacy).toBe(false);
    expect(result.current.model.templateId).toBe('pratt-truss');
  });

  it('una edición normal (setModel) NO apaga el banner: el contenido migrado sigue ahí', () => {
    localStorage.setItem('concreta-fem2d', JSON.stringify(legacyModel()));
    localStorage.setItem('concreta-fem2d-v', '2');
    const { result } = renderHook(() => useFem2DState());

    act(() => result.current.setModel((m) => ({ ...m, selfWeight: !m.selfWeight })));
    expect(result.current.migratedFromLegacy).toBe(true);
  });

  it('un enlace del esquema NUEVO no enciende el banner', () => {
    const model: Fem2DModel = FEM2D_TEMPLATES['gable'].build(FEM2D_TEMPLATES['gable'].defaults());
    window.history.replaceState(null, '', `/analisis/fem2d?model=${encodeShareString(model)}`);
    const { result } = renderHook(() => useFem2DState());
    expect(result.current.migratedFromLegacy).toBe(false);
    expect(result.current.model.templateId).toBe('gable');
  });
});
