// FEM 2D — share-link serialization v2 (model-centric).
//
// v2 links carry the COMPLETE Fem2DModel. Locks: round-trip fidelity, the
// corrupt/degenerate gates (never hydrate a broken model), and the v1
// compatibility branch (parametric Fem2DUiState links from the pre-editor era
// still open by rebuilding through the template generators).

import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { buildShareUrl, decodeShareString, encodeShareString, isPlausibleModel } from '../../features/fem2d/serialize';
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
});
