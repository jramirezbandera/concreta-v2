// Estabilidad de taludes — tests de round-trip de la serialización lz-string (T2.2).
// Verifica que encode→decode reproduce el SlopeInputs íntegro (incl. strata/loads/
// context) y que las entradas corruptas devuelven null.

import { describe, expect, it } from "vitest";
import { compressToEncodedURIComponent } from "lz-string";
import { buildShareUrl, decodeShareString, encodeShareString } from "../../features/slope-stability/serialize";
import { slopeDefaults, type SlopeInputs } from "../../data/defaults";

// Modelo rico: NF, dos estratos, dos cargas, contexto global, situación transitoria,
// método Fellenius (valor no-default → ejercita el round-trip del campo `method`).
const rich: SlopeInputs = {
  height: 8,
  angle: 45,
  waterTableDepth: 3.5,
  strata: [
    { id: 1, type: "cohesive", thickness: 4, gamma: 18, c: 12, phi: 24, Nspt: 0, su: 35, rflim: 0 },
    { id: 2, type: "granular", thickness: 20, gamma: 20, c: 0, phi: 34, Nspt: 30, su: 0, rflim: 0 },
  ],
  loads: [
    { id: 1, kind: "udl", magnitude: 10, offset: 0, length: 5 },
    { id: 2, kind: "line", magnitude: 50, offset: 2 },
  ],
  method: "fellenius",
  slices: 50,
  iterations: 2000,
  situation: "transient",
  context: "global-foundation",
};

describe("slope serialize — round-trip", () => {
  it("defaults round-trip deep-equal", () => {
    const decoded = decodeShareString(encodeShareString(slopeDefaults));
    expect(decoded).toEqual(slopeDefaults);
  });

  it("modelo rico round-trips incluyendo strata/loads/context", () => {
    const decoded = decodeShareString(encodeShareString(rich));
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(rich);
    // Aserciones explícitas de las estructuras anidadas que motivan lz-string.
    expect(decoded!.strata).toHaveLength(2);
    expect(decoded!.loads).toHaveLength(2);
    expect(decoded!.context).toBe("global-foundation");
    expect(decoded!.method).toBe("fellenius");
    expect(decoded!.strata[0].su).toBe(35);
    expect(decoded!.loads[1]).toEqual(rich.loads[1]);
  });

  it("la cadena codificada es URL-component-safe", () => {
    const encoded = encodeShareString(rich);
    const params = new URLSearchParams();
    params.set("model", encoded);
    expect(params.get("model")).toBe(encoded);
  });

  it("merge tolera enlaces de versiones previas sin `context`", () => {
    // Simula un enlace pre-Phase-2: SlopeInputs sin el campo `context`.
    const { context: _omitted, ...legacy } = slopeDefaults;
    const encoded = encodeShareString(legacy as unknown as SlopeInputs);
    const decoded = decodeShareString(encoded);
    expect(decoded).not.toBeNull();
    // El campo faltante cae al default ('excavation') en lugar de undefined.
    expect(decoded!.context).toBe(slopeDefaults.context);
  });

  it("merge tolera enlaces previos sin `method` → cae a 'bishop'", () => {
    // Simula un enlace anterior a Fellenius: SlopeInputs sin el campo `method`.
    const { method: _omitted, ...legacy } = slopeDefaults;
    const encoded = encodeShareString(legacy as unknown as SlopeInputs);
    const decoded = decodeShareString(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.method).toBe("bishop");
  });
});

describe("slope serialize — error handling", () => {
  it('decodeShareString("") devuelve null', () => {
    expect(decodeShareString("")).toBeNull();
  });

  it("decodeShareString de basura devuelve null", () => {
    expect(decodeShareString("no-es-una-cadena-valida!!")).toBeNull();
  });

  it("decodeShareString de base64 válido pero no-modelo devuelve null", () => {
    const encoded = encodeShareString({ foo: "bar" } as unknown as SlopeInputs);
    expect(decodeShareString(encoded)).toBeNull();
  });

  it("decodeShareString de objeto sin `strata` devuelve null", () => {
    const broken = { height: 5, angle: 30, loads: [] };
    const encoded = encodeShareString(broken as unknown as SlopeInputs);
    expect(decodeShareString(encoded)).toBeNull();
  });
});

describe("slope buildShareUrl", () => {
  it("produce una URL con ?model= apuntando a /geotec/taludes", () => {
    const url = buildShareUrl(rich, "https://example.com/geotec/taludes");
    expect(url).toMatch(/^https:\/\/example\.com\/geotec\/taludes\?model=/);
  });

  it("usa & cuando la base ya tiene query", () => {
    const url = buildShareUrl(rich, "https://example.com/geotec/taludes?foo=1");
    expect(url).toContain("?foo=1&model=");
  });

  it("round-trips a través del parseo de URL", () => {
    const url = buildShareUrl(rich, "https://example.com/x");
    const encoded = new URL(url).searchParams.get("model");
    expect(encoded).not.toBeNull();
    expect(decodeShareString(encoded!)).toEqual(rich);
  });

  it("acepta una ruta relativa como base (traspaso desde un módulo de muro)", () => {
    const url = buildShareUrl(rich, "/geotec/taludes");
    expect(url).toMatch(/^\/geotec\/taludes\?model=/);
  });
});

describe("slope serialize — bloque rígido", () => {
  const withBlock = {
    ...slopeDefaults,
    context: "global-foundation" as const,
    rigidBlock: { padHeel: 1.5, padToe: 0.6, depth: 3.5 },
  };

  it("round-trip conserva el bloque rígido", () => {
    const back = decodeShareString(encodeShareString(withBlock));
    expect(back).toEqual(withBlock);
    expect(back!.rigidBlock).toEqual({ padHeel: 1.5, padToe: 0.6, depth: 3.5 });
  });

  it("el merge tolera enlaces ANTIGUOS sin rigidBlock", () => {
    // Enlace generado antes de que el campo existiera: no debe romper, y el
    // campo queda ausente (⇒ búsqueda sin exclusión, comportamiento previo).
    const legacy = { ...slopeDefaults } as Record<string, unknown>;
    delete legacy.rigidBlock;
    const encoded = compressToEncodedURIComponent(JSON.stringify(legacy));
    const back = decodeShareString(encoded);
    expect(back).not.toBeNull();
    expect(back!.rigidBlock).toBeUndefined();
  });
});
