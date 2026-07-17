import { CLEAR_MIN, PEAK_OFFSET } from './diagramStyle';
import type { BeamType } from '../../data/defaults';

export interface LabelPos {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface Peak {
  x: number;
  y: number;
}

/** Celda del diagrama de momentos (coordenadas ya en px del SVG). */
export interface MomentCell {
  x0: number;
  x1: number;
  baseY: number;   // y de la línea de momento cero
  unit: number;    // px por unidad de la forma normalizada
  rawMin: number;
  rawMax: number;
}

/** Celda del diagrama de cortantes. */
export interface ShearCell {
  x0: number;
  x1: number;
  centerY: number;
  posH: number;    // altura px del lóbulo positivo
  negH: number;    // altura px del lóbulo negativo (0 = sin lóbulo)
}

/** Celda del diagrama de flecha. */
export interface DeflCell {
  x0: number;
  x1: number;
  baseY: number;   // y de la directriz sin deformar
  depth: number;   // profundidad px del pico de la curva (δmax a escala)
  admY: number;    // y de la línea discontinua del límite admisible δadm
}

export interface BeamPeakInputs {
  beamType: BeamType;
  m: MomentCell;
  v: ShearCell;
  d: DeflCell;
}

export interface BeamPeakGeometry {
  mLabel: LabelPos;
  mPeak: Peak;
  mLabelSecondary?: LabelPos;
  mPeakSecondary?: Peak;
  vPosLabel: LabelPos;
  vPosPeak: Peak;
  vNegLabel?: LabelPos;
  vNegPeak?: Peak;
  dLabel: LabelPos;
  dPeak: Peak;
}

/** x del pico de flecha por tipo de viga (fracción de la luz desde x0). */
const DEFL_PEAK_T: Record<BeamType, number> = {
  ss: 0.5,
  cantilever: 1,
  // Máximo analítico de la ménsula apuntalada (empotrada-apoyada) bajo UDL:
  // t = (15−√33)/16 ≈ 0.5785 desde el empotramiento.
  fp: 0.5785,
  ff: 0.5,
};

export function beamPeakGeometry(inp: BeamPeakInputs): BeamPeakGeometry {
  const { beamType, m, v, d } = inp;

  const clear = Math.max(CLEAR_MIN, PEAK_OFFSET);

  // ── δ: pico + etiqueta esquivando la línea de límite admisible ────────────
  const dX = d.x0 + (d.x1 - d.x0) * DEFL_PEAK_T[beamType];
  const dPeak: Peak = { x: dX, y: d.baseY + d.depth };
  // La etiqueta va bajo el pico; si cae sobre la línea discontinua del límite
  // (utilización alta), se baja justo por debajo de ella (banda inferior libre).
  let dLabelY = dPeak.y + clear;
  if (dLabelY > d.admY - 6 && dLabelY < d.admY + 10) dLabelY = d.admY + 12;
  const dLabel: LabelPos = {
    x: beamType === 'cantilever' ? dX - 4 : dX,
    y: dLabelY,
    anchor: beamType === 'cantilever' ? 'end' : 'middle',
  };

  // ── V: picos en los extremos, etiquetas FUERA de los lóbulos ──────────────
  // (encima del pico positivo, debajo del negativo: así nunca cruzan la
  // diagonal del cortante — la celda reserva V_LABEL_ROOM arriba/abajo)
  const vPosPeak: Peak = { x: v.x0, y: v.centerY - v.posH };
  const vPosLabel: LabelPos = { x: v.x0, y: vPosPeak.y - 8, anchor: 'start' };
  const hasNeg = v.negH > 0 && beamType !== 'cantilever';
  const vNegPeak: Peak | undefined = hasNeg ? { x: v.x1, y: v.centerY + v.negH } : undefined;
  const vNegLabel: LabelPos | undefined = hasNeg
    ? { x: v.x1, y: v.centerY + v.negH + 10, anchor: 'end' }
    : undefined;

  // ── M: pico principal (y secundario de vano en ff) ────────────────────────
  const mMid = (m.x0 + m.x1) / 2;
  switch (beamType) {
    case 'ss': {
      const peakY = m.baseY + m.rawMax * m.unit;
      return {
        mLabel: { x: mMid, y: peakY + clear, anchor: 'middle' },
        mPeak:  { x: mMid, y: peakY },
        vPosLabel, vPosPeak, vNegLabel, vNegPeak, dLabel, dPeak,
      };
    }
    case 'cantilever': {
      const peakY = m.baseY + m.rawMin * m.unit;
      return {
        mLabel: { x: m.x0 + 4, y: peakY + clear, anchor: 'start' },
        mPeak:  { x: m.x0, y: peakY },
        vPosLabel, vPosPeak, dLabel, dPeak,
      };
    }
    case 'fp': {
      const peakY = m.baseY + m.rawMin * m.unit;
      return {
        mLabel: { x: m.x0 + 4, y: peakY + clear, anchor: 'start' },
        mPeak:  { x: m.x0, y: peakY },
        vPosLabel, vPosPeak, vNegLabel, vNegPeak, dLabel, dPeak,
      };
    }
    case 'ff': {
      const hogPeakY = m.baseY + m.rawMin * m.unit;
      const sagPeakY = m.baseY + m.rawMax * m.unit;
      return {
        mLabel: { x: m.x0 + 4, y: hogPeakY + clear, anchor: 'start' },
        mPeak:  { x: m.x0, y: hogPeakY },
        mLabelSecondary: { x: mMid, y: sagPeakY + clear, anchor: 'middle' },
        mPeakSecondary:  { x: mMid, y: sagPeakY },
        vPosLabel, vPosPeak, vNegLabel, vNegPeak, dLabel, dPeak,
      };
    }
  }
}
