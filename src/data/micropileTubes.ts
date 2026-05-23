// Catálogo PIRESA de tubos de armadura para micropilotes.
// Tabla de referencia comercial española; el plan de armado debe seleccionar
// uno de estos calibres. Valores: de (Ø exterior, mm) y e (espesor pared, mm).

export interface MicropileTube {
  /** Diámetro exterior nominal (mm). */
  de: number;
  /** Espesor de pared (mm). */
  e: number;
  /** Etiqueta canónica usada como clave en el estado del módulo. */
  label: string;
}

export const MICROPILE_TUBES: MicropileTube[] = [
  { de:  60.3, e: 5.5, label: 'Ø60,3 × 5,5 mm' },
  { de:  73.0, e: 6.0, label: 'Ø73,0 × 6 mm'   },
  { de:  88.9, e: 6.0, label: 'Ø88,9 × 6 mm'   },
  { de:  88.9, e: 9.0, label: 'Ø88,9 × 9 mm'   },
  { de: 101.6, e: 7.0, label: 'Ø101,6 × 7 mm'  },
  { de: 101.6, e: 9.0, label: 'Ø101,6 × 9 mm'  },
  { de: 114.3, e: 7.0, label: 'Ø114,3 × 7 mm'  },
  { de: 114.3, e: 9.0, label: 'Ø114,3 × 9 mm'  },
  { de: 127.0, e: 9.0, label: 'Ø127,0 × 9 mm'  },
  { de: 139.7, e: 9.0, label: 'Ø139,7 × 9 mm'  },
];

export function getTube(label: string): MicropileTube {
  const found = MICROPILE_TUBES.find((t) => t.label === label);
  return found ?? MICROPILE_TUBES[3];   // default Ø88,9 × 9
}

/** Área bruta sin corrosión (mm²) = π·(de² − di²)/4 con di = de − 2·e. */
export function getTubeAreaGross(de: number, e: number): number {
  const di = de - 2 * e;
  return (Math.PI / 4) * (de * de - di * di);
}

/** Área neta tras corrosión re (mm). re se resta a de. */
export function getTubeAreaNet(de: number, e: number, re: number): number {
  const di = de - 2 * e;
  const de2 = de - 2 * re;
  return (Math.PI / 4) * (de2 * de2 - di * di);
}
