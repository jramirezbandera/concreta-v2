// Share-URL serialización de Sección compuesta.
//
// El estado (CompositeSectionInputs) incluye el array `plates`, así que no cabe
// en useModuleState. Antes el módulo no hidrataba de URL ni serializaba a ella:
// "Copiar enlace" copiaba la URL pelada → el destinatario veía otro caso.
// Fix: encodeShareString/decodeShareString/buildShareUrl/readModelFromUrl con
// lz-string (`?model=`). Patrón idéntico a masonry-walls/fem-analysis.

import { describe, it, expect } from 'vitest';
import {
  encodeShareString, decodeShareString, buildShareUrl, readModelFromUrl, MODEL_URL_PARAM,
} from '../../../features/compositeSection/serialize';
import { compositeSectionDefaults, type CompositeSectionInputs } from '../../../data/defaults';

const custom: CompositeSectionInputs = {
  mode: 'reinforced',
  profileType: 'HEB',
  profileSize: 240,
  grade: 'S355',
  plates: [
    { id: 'p1', b: 200, t: 15, posType: 'top', customYBottom: 0 },
    { id: 'p2', b: 180, t: 12, posType: 'custom', customYBottom: 45 },
    { id: 'p3', b: 20, t: 10, posType: 'left', customYBottom: 0, lateralAnchor: 'flange', lateralOffset: 5 },
  ],
  Ly: 4000,
  Lz: 3000,
  bcType: 'pf',
  beta_y: 0.7,
  beta_z: 0.7,
  Ned: 600,
};

describe('encodeShareString / decodeShareString — round-trip', () => {
  it('preserva los defaults (incl. plates[])', () => {
    expect(decodeShareString(encodeShareString(compositeSectionDefaults))).toEqual(compositeSectionDefaults);
  });

  it('preserva un modelo custom con 2 chapas', () => {
    expect(decodeShareString(encodeShareString(custom))).toEqual(custom);
  });
});

describe('decodeShareString — entradas inválidas', () => {
  it('null / undefined / "" → null', () => {
    expect(decodeShareString(null)).toBeNull();
    expect(decodeShareString(undefined)).toBeNull();
    expect(decodeShareString('')).toBeNull();
  });

  it('cadena corrupta → null (sin crash)', () => {
    expect(decodeShareString('!!!no-es-lz-string!!!')).toBeNull();
  });

  it('profileType desconocido → null', () => {
    const bad = { ...custom, profileType: 'UPN' as unknown };
    expect(decodeShareString(encodeShareString(bad as unknown as CompositeSectionInputs))).toBeNull();
  });

  it('plate con campo no numérico → null (defensa de shape)', () => {
    const bad = { ...custom, plates: [{ ...custom.plates[0], b: 'ancho' as unknown }] };
    expect(decodeShareString(encodeShareString(bad as unknown as CompositeSectionInputs))).toBeNull();
  });

  // Auditoría #109: posType fuera del enum caía en un switch sin default en
  // calcCompositeSection → resultado entero NaN con valid:true.
  it('posType desconocido → null', () => {
    const bad = { ...custom, plates: [{ ...custom.plates[0], posType: 'diagonal' as unknown }] };
    expect(decodeShareString(encodeShareString(bad as unknown as CompositeSectionInputs))).toBeNull();
  });

  it('mode desconocido → null', () => {
    const bad = { ...custom, mode: 'hibrido' as unknown };
    expect(decodeShareString(encodeShareString(bad as unknown as CompositeSectionInputs))).toBeNull();
  });

  it('lateralAnchor desconocido → null', () => {
    const bad = { ...custom, plates: [{ ...custom.plates[2], lateralAnchor: 'alma' as unknown }] };
    expect(decodeShareString(encodeShareString(bad as unknown as CompositeSectionInputs))).toBeNull();
  });

  it('lateralOffset no numérico → null (numérico o ausente sí)', () => {
    const bad = { ...custom, plates: [{ ...custom.plates[2], lateralOffset: '5mm' as unknown }] };
    expect(decodeShareString(encodeShareString(bad as unknown as CompositeSectionInputs))).toBeNull();
  });

  it('Ned/Ly no numéricos → null (NaN silencioso en checks)', () => {
    const badNed = { ...custom, Ned: 'mucho' as unknown };
    expect(decodeShareString(encodeShareString(badNed as unknown as CompositeSectionInputs))).toBeNull();
    const badLy = { ...custom, Ly: '3500' as unknown };
    expect(decodeShareString(encodeShareString(badLy as unknown as CompositeSectionInputs))).toBeNull();
  });

  it('bcType basura se tolera (el motor cae a pp — review fix #1)', () => {
    const odd = { ...custom, bcType: 'garbage' as unknown };
    expect(decodeShareString(encodeShareString(odd as unknown as CompositeSectionInputs))).not.toBeNull();
  });

  it('payload antiguo sin bloque de pandeo → decodifica con defaults (backward-compat)', () => {
    const legacy: Record<string, unknown> = {
      mode: 'reinforced', profileType: 'IPE', profileSize: 300, grade: 'S275',
      plates: [{ id: 'p1', b: 200, t: 15, posType: 'top', customYBottom: 0 }],
    };
    const decoded = decodeShareString(encodeShareString(legacy as unknown as CompositeSectionInputs));
    expect(decoded).not.toBeNull();
    expect(decoded!.Ly).toBe(compositeSectionDefaults.Ly);
    expect(decoded!.bcType).toBe(compositeSectionDefaults.bcType);
    expect(decoded!.Ned).toBe(compositeSectionDefaults.Ned);
  });
});

describe('buildShareUrl / readModelFromUrl', () => {
  it('buildShareUrl produce ?model= con el estado codificado', () => {
    const url = buildShareUrl(custom, 'https://concreta.tools/acero/seccion-compuesta');
    const encoded = new URL(url).searchParams.get(MODEL_URL_PARAM);
    expect(encoded).not.toBeNull();
    expect(decodeShareString(encoded)).toEqual(custom);
  });

  it('descarta cualquier query previa del baseUrl', () => {
    const url = buildShareUrl(custom, 'https://concreta.tools/acero/seccion-compuesta?foo=1&model=viejo');
    const params = new URL(url).searchParams;
    expect(params.get('foo')).toBeNull();
    expect(decodeShareString(params.get(MODEL_URL_PARAM))).toEqual(custom);
  });

  it('readModelFromUrl reconstruye el modelo desde la barra', () => {
    const url = buildShareUrl(custom, 'https://concreta.tools/acero/seccion-compuesta');
    const search = new URL(url).search;
    window.history.replaceState({}, '', `/acero/seccion-compuesta${search}`);
    expect(readModelFromUrl()).toEqual(custom);
  });

  it('readModelFromUrl sin ?model= → null', () => {
    window.history.replaceState({}, '', '/acero/seccion-compuesta');
    expect(readModelFromUrl()).toBeNull();
  });
});
