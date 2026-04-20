// Typical Spanish forjado reticular tipologías (canto + capa de compresión).
// h = total depth (mm), hFlange = capa de compresión (mm),
// bWeb = nervio width (mm), intereje = rib spacing c/c (mm).

export type TipologiaKey = '25+5' | '30+5' | '35+5' | '40+5' | '35+10' | 'custom';

export interface TipologiaPreset {
  key: TipologiaKey;
  label: string;
  h: number;
  hFlange: number;
  bWeb: number;
  intereje: number;
}

export const TIPOLOGIAS: TipologiaPreset[] = [
  { key: '25+5',  label: '25+5 (h=30, capa=5)',   h: 300, hFlange: 50,  bWeb: 120, intereje: 820 },
  { key: '30+5',  label: '30+5 (h=35, capa=5)',   h: 350, hFlange: 50,  bWeb: 120, intereje: 820 },
  { key: '35+5',  label: '35+5 (h=40, capa=5)',   h: 400, hFlange: 50,  bWeb: 120, intereje: 820 },
  { key: '40+5',  label: '40+5 (h=45, capa=5)',   h: 450, hFlange: 50,  bWeb: 120, intereje: 820 },
  { key: '35+10', label: '35+10 (h=45, capa=10)', h: 450, hFlange: 100, bWeb: 120, intereje: 820 },
];

export function getTipologia(key: TipologiaKey): TipologiaPreset | undefined {
  return TIPOLOGIAS.find((t) => t.key === key);
}

export type TipoVano = 'biapoyado' | 'continuo-extremo' | 'continuo-interior' | 'voladizo';

export interface TipoVanoDef {
  key: TipoVano;
  label: string;
  l0Factor: number;  // L0 = l0Factor · L
}

// CE art. 21 — L0 = distancia entre puntos de momento nulo
export const TIPOS_VANO: TipoVanoDef[] = [
  { key: 'biapoyado',         label: 'Biapoyado (L0 = L)',              l0Factor: 1.0  },
  { key: 'continuo-extremo',  label: 'Continuo extremo (L0 = 0.85 L)',  l0Factor: 0.85 },
  { key: 'continuo-interior', label: 'Continuo interior (L0 = 0.70 L)', l0Factor: 0.70 },
  { key: 'voladizo',          label: 'Voladizo (L0 = 2 L)',             l0Factor: 2.0  },
];

export function getL0Factor(tipo: TipoVano): number {
  const found = TIPOS_VANO.find((t) => t.key === tipo);
  return found ? found.l0Factor : 0.70;
}
