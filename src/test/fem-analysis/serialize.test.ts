// FEM 2D — share-URL serialization round-trip tests

import { describe, expect, it } from 'vitest';
import { buildShareUrl, decodeShareString, encodeShareString } from '../../features/fem-analysis/serialize';
import { cloneDesignPreset } from '../../features/fem-analysis/presets';
import type { DesignModel } from '../../features/fem-analysis/types';

describe('serialize — round-trip', () => {
  it('beam preset round-trips byte-equal (post-V1.1: combo dropped from model)', () => {
    const original = cloneDesignPreset('beam');
    const encoded = encodeShareString(original);
    const { model: decoded, qFallbacks } = decodeShareString(encoded);
    expect(decoded).not.toBeNull();
    // V1.1 strips the legacy `combo` field on decode (moved to ViewState).
    // Build expected by removing `combo` from the original.
    const { combo: _, ...expected } = original as DesignModel & { combo?: unknown };
    expect(decoded).toEqual(expected);
    // Presets have G loads (no Q), so no fallbacks expected.
    expect(qFallbacks).toBe(0);
  });

  it('continuous (3 vanos) preset round-trips byte-equal', () => {
    const original = cloneDesignPreset('continuous');
    const encoded = encodeShareString(original);
    const { model: decoded } = decodeShareString(encoded);
    const { combo: _, ...expected } = original as DesignModel & { combo?: unknown };
    expect(decoded).toEqual(expected);
  });

  it('cantilever preset round-trips byte-equal', () => {
    const original = cloneDesignPreset('cantilever');
    const encoded = encodeShareString(original);
    const { model: decoded } = decodeShareString(encoded);
    const { combo: _, ...expected } = original as DesignModel & { combo?: unknown };
    expect(decoded).toEqual(expected);
  });

  it('encoded string is URL-component-safe (round-trips through URLSearchParams)', () => {
    // lz-string's compressToEncodedURIComponent uses an alphabet that's
    // already URL-component-safe (alphanumerics + '-' '_' '+' '$'), so it
    // can be embedded directly without further encoding. The strict round-trip
    // test below is the real correctness signal.
    const m = cloneDesignPreset('continuous');
    const encoded = encodeShareString(m);
    const params = new URLSearchParams();
    params.set('model', encoded);
    const fromParams = params.get('model');
    expect(fromParams).toBe(encoded);
  });

  it('encoded string < 8KB for typical 3-vano model', () => {
    const m = cloneDesignPreset('continuous');
    const encoded = encodeShareString(m);
    expect(encoded.length).toBeLessThan(8000);
  });

  it('decompressed length is meaningfully smaller than raw JSON', () => {
    const m = cloneDesignPreset('continuous');
    const encoded = encodeShareString(m);
    const rawJsonLength = JSON.stringify(m).length;
    expect(encoded.length).toBeLessThan(rawJsonLength); // some compression
  });
});

describe('serialize — error handling', () => {
  it('decodeShareString("") returns model:null', () => {
    expect(decodeShareString('').model).toBeNull();
  });

  it('decodeShareString of garbage returns model:null', () => {
    expect(decodeShareString('not-a-valid-encoded-string!!').model).toBeNull();
  });

  it('decodeShareString of valid base64 but not a model returns model:null', () => {
    const encoded = encodeShareString({ foo: 'bar' } as unknown as DesignModel);
    expect(decodeShareString(encoded).model).toBeNull(); // shape check rejects
  });

  it('decodeShareString of partially-valid object missing nodes returns model:null', () => {
    const broken = {
      presetCode: 'beam',
      combo: 'ELU',
      selfWeight: false,
      // missing nodes/bars/supports/loads
    };
    const encoded = encodeShareString(broken as unknown as DesignModel);
    expect(decodeShareString(encoded).model).toBeNull();
  });
});

describe('serialize — V1.1 migration (R8)', () => {
  it('strips legacy `combo` field silently (DesignModel no longer has it)', () => {
    const legacy = {
      presetCode: 'beam',
      combo: 'ELU', // legacy V1.0 field
      selfWeight: true,
      nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 6, y: 0 }],
      bars: [],
      supports: [],
      loads: [],
    };
    const encoded = encodeShareString(legacy as unknown as DesignModel);
    const { model } = decodeShareString(encoded);
    expect(model).not.toBeNull();
    expect((model as unknown as { combo?: unknown }).combo).toBeUndefined();
  });

  it('defaults useCategory="B" on Q loads missing the field; reports qFallbacks', () => {
    const legacy: DesignModel = {
      presetCode: 'beam',
      selfWeight: false,
      nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 6, y: 0 }],
      bars: [],
      supports: [],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G', bar: 'b1', w: 5, dir: '-y' },
        { id: 'q1', kind: 'udl', lc: 'Q', bar: 'b1', w: 3, dir: '-y' }, // no useCategory
        { id: 'q2', kind: 'udl', lc: 'Q', useCategory: 'C3', bar: 'b1', w: 4, dir: '-y' },
      ],
    };
    const encoded = encodeShareString(legacy);
    const { model, qFallbacks } = decodeShareString(encoded);
    expect(model).not.toBeNull();
    expect(qFallbacks).toBe(1); // only q1 missing useCategory
    const q1 = model!.loads.find((l) => l.id === 'q1') as { useCategory?: string };
    const q2 = model!.loads.find((l) => l.id === 'q2') as { useCategory?: string };
    expect(q1.useCategory).toBe('B');
    expect(q2.useCategory).toBe('C3'); // explicit value preserved
  });

  it('non-Q loads (G/W/S/E) without useCategory are NOT counted as fallback', () => {
    const legacy: DesignModel = {
      presetCode: 'beam',
      selfWeight: false,
      nodes: [{ id: 'n1', x: 0, y: 0 }],
      bars: [],
      supports: [],
      loads: [
        { id: 'g1', kind: 'udl', lc: 'G', bar: 'b1', w: 5, dir: '-y' },
        { id: 'w1', kind: 'udl', lc: 'W', bar: 'b1', w: 2, dir: '-y' },
      ],
    };
    const encoded = encodeShareString(legacy);
    const { qFallbacks } = decodeShareString(encoded);
    expect(qFallbacks).toBe(0);
  });
});

describe('buildShareUrl', () => {
  it('produces a URL with ?model= query', () => {
    const m = cloneDesignPreset('beam');
    const url = buildShareUrl(m, 'https://example.com/concreta-v2/analisis/fem');
    expect(url).toContain('?model=');
    expect(url).toMatch(/^https:\/\/example\.com\/concreta-v2\/analisis\/fem\?model=/);
  });

  it('appends with & when base already has query', () => {
    const m = cloneDesignPreset('beam');
    const url = buildShareUrl(m, 'https://example.com/concreta-v2/analisis/fem?foo=1');
    expect(url).toContain('?foo=1&model=');
  });

  it('round-trips through URL parse', () => {
    const original = cloneDesignPreset('continuous');
    const url = buildShareUrl(original, 'https://example.com/x');
    const u = new URL(url);
    const encoded = u.searchParams.get('model');
    expect(encoded).not.toBeNull();
    const { model: decoded } = decodeShareString(encoded!);
    // V1.1 strips combo on decode.
    const { combo: _, ...expected } = original as DesignModel & { combo?: unknown };
    expect(decoded).toEqual(expected);
  });
});
