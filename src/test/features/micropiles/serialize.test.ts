// Share-URL serialización del soil — regresión A1/T2 (eng review 2026-05-24)
//
// Bug original: "Copiar enlace" copiaba window.location.href, que solo lleva
// los inputs escalares (vía useModuleState). El array `soil` vive en su
// propio storage y NUNCA entraba en la URL → el destinatario calculaba con
// SU soil local, distinto del emisor, sin aviso. Silent failure.
//
// Fix: encodeSoil/decodeSoil/buildShareUrl/readSoilFromUrl. Patrón idéntico
// al de masonry-walls/serialize.ts y fem-analysis/serialize.ts.

import { describe, expect, it } from 'vitest';
import {
  encodeSoil, decodeSoil, buildShareUrl, readSoilFromUrl, SOIL_URL_PARAM,
} from '../../../features/micropiles/serialize';
import { micropilesSoilDefaults, type SoilLayer } from '../../../data/defaults';

const customSoil: SoilLayer[] = [
  { id: 1, type: 'cohesive', thickness: 3.5, gamma: 18.5, c: 25, phi: 28, Nspt: 12, su: 80,  rflim: 0.12 },
  { id: 2, type: 'granular', thickness: 5.0, gamma: 19.0, c: 0,  phi: 32, Nspt: 30, su: 0,   rflim: 0.20 },
  { id: 3, type: 'cohesive', thickness: 7.2, gamma: 20.5, c: 150, phi: 0, Nspt: 0,  su: 200, rflim: 0    },
];

describe('encodeSoil / decodeSoil — round-trip', () => {
  it('round-trip preserva todos los campos del FTUX', () => {
    const encoded = encodeSoil(micropilesSoilDefaults);
    const decoded = decodeSoil(encoded);
    expect(decoded).toEqual(micropilesSoilDefaults);
  });

  it('round-trip preserva un soil custom de 3 estratos', () => {
    const encoded = encodeSoil(customSoil);
    const decoded = decodeSoil(encoded);
    expect(decoded).toEqual(customSoil);
  });

  it('encoded string es URL-safe (sin caracteres que rompan en queries)', () => {
    const encoded = encodeSoil(customSoil);
    // lz-string compressToEncodedURIComponent usa [A-Za-z0-9+-$]
    expect(encoded).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(encoded).not.toContain('=');  // sin padding base64
    expect(encoded).not.toContain('&');  // sin separadores de query
    expect(encoded).not.toContain(' ');
  });
});

describe('decodeSoil — entradas inválidas', () => {
  it('null / undefined / "" → null', () => {
    expect(decodeSoil(null)).toBeNull();
    expect(decodeSoil(undefined)).toBeNull();
    expect(decodeSoil('')).toBeNull();
  });

  it('string corrupta → null (no crash)', () => {
    expect(decodeSoil('!!!not-lz-string!!!')).toBeNull();
  });

  it('JSON que no es array → null', () => {
    // Encode something that's NOT an array
    const bad = encodeSoil([] as SoilLayer[]);  // empty array case
    // Empty array is rejected by decodeSoil (need length > 0)
    expect(decodeSoil(bad)).toBeNull();
  });

  it('layer con campo no numérico → null (defensa de shape)', () => {
    // Construir manualmente un payload "casi válido"
    const broken = [{ ...customSoil[0], gamma: 'not a number' }];
    // bypass del type system para simular un JSON corrupto que coincide con
    // el shape de SoilLayer parcialmente
    const encoded = encodeSoil(broken as unknown as SoilLayer[]);
    expect(decodeSoil(encoded)).toBeNull();
  });

  it('layer con type desconocido → null', () => {
    const broken = [{ ...customSoil[0], type: 'rocky' as unknown }];
    const encoded = encodeSoil(broken as unknown as SoilLayer[]);
    expect(decodeSoil(encoded)).toBeNull();
  });
});

describe('buildShareUrl — incluye soil en la URL', () => {
  it('URL contiene el param ?soil=<encoded> con el soil actual', () => {
    // Mock window.location vía la API global de jsdom
    const url = buildShareUrl(customSoil);
    expect(url).toContain(`${SOIL_URL_PARAM}=`);

    // Extraer el param y decodificarlo — debe reconstruir customSoil
    const u = new URL(url);
    const encoded = u.searchParams.get(SOIL_URL_PARAM);
    expect(encoded).not.toBeNull();
    expect(decodeSoil(encoded)).toEqual(customSoil);
  });

  it('preserva los otros query params que useModuleState haya escrito', () => {
    // Simular que useModuleState ya escribió ?topDepth=2&toeDepth=18 en la URL
    window.history.replaceState({}, '', '/ciment/micropilotes?topDepth=2&toeDepth=18');
    const url = buildShareUrl(customSoil);
    const u = new URL(url);
    expect(u.searchParams.get('topDepth')).toBe('2');
    expect(u.searchParams.get('toeDepth')).toBe('18');
    expect(u.searchParams.get(SOIL_URL_PARAM)).not.toBeNull();
  });
});

describe('readSoilFromUrl — el destinatario hereda los estratos', () => {
  it('si la URL trae ?soil=<lz>, lo decodifica', () => {
    const encoded = encodeSoil(customSoil);
    window.history.replaceState({}, '', `/ciment/micropilotes?soil=${encoded}`);
    expect(readSoilFromUrl()).toEqual(customSoil);
  });

  it('si la URL no trae ?soil=, devuelve null (el módulo cae a loadSoil)', () => {
    window.history.replaceState({}, '', '/ciment/micropilotes?topDepth=2');
    expect(readSoilFromUrl()).toBeNull();
  });

  it('?soil= corrupto → null (sin crash, fallback a loader local)', () => {
    window.history.replaceState({}, '', '/ciment/micropilotes?soil=!!!corrupted!!!');
    expect(readSoilFromUrl()).toBeNull();
  });
});

describe('REGRESIÓN A1 — round-trip URL → cálculo idéntico', () => {
  it('emisor con soil custom → URL → receptor parsea → mismo soil', () => {
    // Emisor: configura soil custom y construye la URL
    window.history.replaceState({}, '', '/ciment/micropilotes');
    const shareUrl = buildShareUrl(customSoil);

    // Receptor: navega al enlace
    const parsedUrl = new URL(shareUrl);
    window.history.replaceState({}, '', parsedUrl.pathname + parsedUrl.search);

    // Receptor monta y lee el soil
    const received = readSoilFromUrl();
    expect(received).toEqual(customSoil);
  });
});
