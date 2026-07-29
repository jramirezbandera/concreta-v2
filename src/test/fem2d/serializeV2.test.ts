// FEM 2D — share-link serialization v2 (model-centric).
//
// v2 links carry the COMPLETE Fem2DModel. Locks: round-trip fidelity, the
// corrupt/degenerate gates (never hydrate a broken model), and the v1
// compatibility branch (parametric Fem2DUiState links from the pre-editor era
// still open by rebuilding through the template generators).

import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { buildShareUrl, decodeShareString, decodeShareStringDetailed, encodeShareString, isPlausibleModel } from '../../features/fem2d/serialize';
import { setMemberMaterial } from '../../features/fem2d/modelOps';
import { buildModelFromState, fem2dUiDefaults } from '../../features/fem2d/uiState';
import type { Fem2DModel } from '../../features/fem2d/types';

function sampleModel(): Fem2DModel {
  return buildModelFromState(fem2dUiDefaults()).model!;
}

describe('fem2d serialize v2 — model round-trip', () => {
  it('round-trips a template model exactly', () => {
    const model = sampleModel();
    const decoded = decodeShareString(encodeShareString(model));
    expect(decoded).toEqual(model);
  });

  it('round-trips an edited (custom) model', () => {
    const model: Fem2DModel = { ...sampleModel(), templateId: 'custom', selfWeight: false };
    const decoded = decodeShareString(encodeShareString(model));
    expect(decoded).toEqual(model);
    expect(decoded!.templateId).toBe('custom');
  });

  it('buildShareUrl embeds the payload under ?model=', () => {
    const url = buildShareUrl(sampleModel(), 'https://x.test/analisis/fem2d');
    expect(url).toMatch(/^https:\/\/x\.test\/analisis\/fem2d\?model=./);
    const encoded = new URL(url).searchParams.get('model')!;
    expect(decodeShareString(encoded)).toEqual(sampleModel());
  });
});

describe('fem2d serialize v2 — gates', () => {
  it('returns null on corrupt / foreign input', () => {
    expect(decodeShareString('')).toBeNull();
    expect(decodeShareString('not-a-real-payload')).toBeNull();
    expect(decodeShareString(compressToEncodedURIComponent(JSON.stringify({ foo: 1 })))).toBeNull();
  });

  it('rejects a degenerate model (broken refs) — never hydrate broken state', () => {
    // validateModel2DBasic catches SHAPE degeneracy (refs, lengths, two-force
    // loads); a supports-less model passes shape and fails at SOLVE time
    // (singular matrix), which the pipeline reports — that path is exercised
    // by the solver tests. Here: a member pointing at a missing node.
    const base = sampleModel();
    const model: Fem2DModel = {
      ...base,
      members: [{ ...base.members[0], j: 'no-existe' }, ...base.members.slice(1)],
    };
    expect(decodeShareString(encodeShareString(model))).toBeNull();
  });

  it('isPlausibleModel screens shape without validating structure', () => {
    expect(isPlausibleModel(sampleModel())).toBe(true);
    expect(isPlausibleModel({})).toBe(false);
    expect(isPlausibleModel({ templateId: 'custom', selfWeight: true, nodes: [], members: [], supports: [], loads: [] })).toBe(true);
  });
});

describe('fem2d serialize v2 — v1 parametric link compat', () => {
  it('a v1 link (Fem2DUiState payload) rebuilds the model via the templates', () => {
    const v1 = { ...fem2dUiDefaults(), templateId: 'gable' as const };
    v1.params.gable = { ...v1.params.gable, span: 12 };
    const encoded = compressToEncodedURIComponent(JSON.stringify(v1));

    const decoded = decodeShareString(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.templateId).toBe('gable');
    // The rebuilt geometry reflects the v1 params (span 12 → rightmost node x=12).
    const maxX = Math.max(...decoded!.nodes.map((n) => n.x));
    expect(maxX).toBe(12);
  });

  it('a v1 link with invalid params yields null (template validation gate)', () => {
    const v1 = { ...fem2dUiDefaults(), templateId: 'portal-frame' as const };
    v1.params['portal-frame'] = { ...v1.params['portal-frame'], span: 1 }; // < min 3
    const encoded = compressToEncodedURIComponent(JSON.stringify(v1));
    expect(decodeShareString(encoded)).toBeNull();
  });

  it('round-trip preserves an HA member with sección + armado (vano/apoyo + jaula)', () => {
    const model = buildModelFromState(fem2dUiDefaults()).model!;
    const rc = setMemberMaterial(model, 'v1', 'rc');
    expect(rc.ok).toBe(true);
    if (!rc.ok) return;
    const decoded = decodeShareString(encodeShareString(rc.model));
    expect(decoded).not.toBeNull();
    const v1 = decoded!.members.find((m) => m.id === 'v1')!;
    const orig = rc.model.members.find((m) => m.id === 'v1')!;
    expect(v1.material).toBe('rc');
    expect(v1.rcSection).toEqual(orig.rcSection);
    expect(v1.vanoArmado).toEqual(orig.vanoArmado);
    expect(v1.apoyoArmado).toEqual(orig.apoyoArmado);
    expect(v1.columnCage).toEqual(orig.columnCage);
  });

  it('round-trip preserves a timber member (sección mm) + el flag snowOver1000m', () => {
    const base = buildModelFromState(fem2dUiDefaults()).model!;
    const tim = setMemberMaterial(base, 'v1', 'timber');
    expect(tim.ok).toBe(true);
    if (!tim.ok) return;
    const model: Fem2DModel = { ...tim.model, snowOver1000m: true };
    const decoded = decodeShareString(encodeShareString(model));
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(model);
    const v1 = decoded!.members.find((m) => m.id === 'v1')!;
    expect(v1.material).toBe('timber');
    expect(v1.timberSection).toEqual(tim.model.members.find((m) => m.id === 'v1')!.timberSection);
    expect(decoded!.snowOver1000m).toBe(true);
  });

  it('un enlace SIN snowOver1000m decodifica sin el campo (compat hacia atrás)', () => {
    // Modelos guardados antes del campo: el flag ausente ⇒ ≤1000 m (false).
    const model = buildModelFromState(fem2dUiDefaults()).model!;
    expect('snowOver1000m' in model).toBe(false);
    const decoded = decodeShareString(encodeShareString(model))!;
    expect(decoded.snowOver1000m).toBeUndefined();
  });
});

// ── Normalizador de la Fase 2 (paso 2): enlaces del modelo de datos con rol ──

describe('fem2d serialize — normalizador de enlaces pre-Fase 2', () => {
  /** Modelo v2 ANTIGUO tal como lo serializaba la app con rol/elementType. */
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
        { id: 'p1', i: 'n1', j: 'n2', role: 'pilar', elementType: 'beam-column', material: 'rc', rcSection: { b: 30, h: 30, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' }, releases: { i: false, j: false } },
        { id: 'v1', i: 'n2', j: 'n3', role: 'viga', elementType: 'beam-column', material: 'steel', steelSelection: steel, releases: { i: false, j: false }, roleManual: true },
        { id: 'd1', i: 'n1', j: 'n3', role: 'diagonal', elementType: 'two-force', material: 'steel', steelSelection: steel, releases: { i: false, j: false } },
        { id: 'd2', i: 'n2', j: 'n4', role: 'montante', elementType: 'beam-column', material: 'rc', rcSection: { b: 30, h: 30, fck: 25, fyk: 500, cover: 30, exposureClass: 'XC1', loadType: 'B' }, releases: { i: false, j: false } },
      ],
      supports: [{ node: 'n1', type: 'pinned' }, { node: 'n4', type: 'pinned' }],
      loads: [{ id: 'l1', kind: 'node', lc: 'G', node: 'n3', Fx: 0, Fy: -10 }],
    };
  }

  it('migra rol→rcDesignKind/deflLimit/displayGroup, biela→rótulas, y marca migrated', () => {
    const encoded = compressToEncodedURIComponent(JSON.stringify(legacyModel()));
    const res = decodeShareStringDetailed(encoded);
    expect(res).not.toBeNull();
    expect(res!.migrated).toBe(true);
    const byId = new Map(res!.model.members.map((m) => [m.id, m]));

    // HA pilar → 'column'; el rol y sus satélites desaparecen del modelo.
    const p1 = byId.get('p1')!;
    expect(p1.rcDesignKind).toBe('column');
    expect(p1.deflLimit).toBe('none');
    expect(p1.displayGroup).toBe('pilar');
    expect('role' in p1).toBe(false);
    expect('elementType' in p1).toBe(false);
    expect('roleManual' in p1).toBe(false);

    // Viga de acero: conserva su fila de flecha (L/300 que ya tenía).
    const v1 = byId.get('v1')!;
    expect(v1.deflLimit).toBe(300);
    expect(v1.displayGroup).toBe('viga');

    // Biela vieja → releases ambas (la deriva decompose) + sin flecha.
    const d1 = byId.get('d1')!;
    expect(d1.releases).toEqual({ i: true, j: true });
    expect(d1.deflLimit).toBe('none');
    expect(d1.displayGroup).toBe('diagonal');

    // HA 'montante' (lista negra vieja) → rcDesignKind UNDEFINED = PENDIENTE.
    // Nunca a un valor que pueda dar verde: PENDIENTE → verde violaría P5.
    const d2 = byId.get('d2')!;
    expect(d2.rcDesignKind).toBeUndefined();
    expect(d2.displayGroup).toBe('montante');
  });

  it('un modelo YA migrado pasa sin tocarse y sin banner', () => {
    const model = buildModelFromState(fem2dUiDefaults()).model!;
    const res = decodeShareStringDetailed(encodeShareString(model));
    expect(res).not.toBeNull();
    expect(res!.migrated).toBe(false);
    expect(res!.model).toEqual(model);
  });

  it('los enlaces v1 paramétricos no marcan migrated (las plantillas ya estampan lo nuevo)', () => {
    const v1 = { ...fem2dUiDefaults(), templateId: 'gable' as const };
    const encoded = compressToEncodedURIComponent(JSON.stringify(v1));
    const res = decodeShareStringDetailed(encoded);
    expect(res).not.toBeNull();
    expect(res!.migrated).toBe(false);
  });
});
