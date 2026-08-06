// Filas del bloque de propiedades de la sección de acero — módulo PURO
// (sin React) para que la tabla de etiquetas por familia y las filas que se
// suprimen se puedan verificar sobre las 4 ramas de `SectionKind` sin DOM.
//
// Por qué importa que sea puro: rotular "espesor de ala" en un tubo circular,
// o pintar "radio de acuerdo: 0 mm" en un cajón de 2UPN, es un error que
// acaba en un plano — el bloque existe precisamente para detallar. Una fila
// que vale 0 porque la magnitud NO EXISTE es tan engañosa como una etiqueta
// equivocada: no se pinta.
//
// Trampas del modelo geométrico, verificadas en los adaptadores:
//   RHS/SHS  tf = tw = t     y  r = radio EXTERIOR de esquina  (rhs.ts)
//   CHS      h = b = D, tf = tw = t,  r = 0                    (chs.ts)
//   2UPN     r = 0  y  b = 2·b_UPN (envolvente);  tf/tw son los de la UPN
//            individual                                        (upnBox.ts)
//   Iw = 0 en las tres cerradas (alabeo despreciable)
//   CHS      Iy = Iz, Wel_y = Wel_z, Wpl_y = Wpl_z por axisimetría

import type { SectionGeometry } from '../../lib/sections';

export interface SectionPropertyRow {
  /** Etiqueta ya resuelta por familia, con la unidad incluida. */
  label: string;
  /** Valor ya formateado (sin unidad — vive en la etiqueta). */
  value: string;
  group: 'geom' | 'props';
  /**
   * Magnitud derivada mientras sus hermanas son de catálogo. Solo puede darse
   * en `kind: 'I'` (donde A, Iy, Iz, Wel_y, Wpl_y, It e Iw sí vienen de
   * `steelProfiles.ts`) más el peso, que no sale de ningún registro en
   * ninguna familia. La marca se compone dentro de `label`; el flag existe
   * para que los tests puedan afirmarla.
   */
  derived?: true;
}

/**
 * Peso lineal [kg/m] = A [cm²] · 0.785, con ρ = 7850 kg/m³
 * (1 cm² × 1 m = 1e-4 m³ → 0.785 kg). Única vía que cubre las 5 familias con
 * una sola fórmula: el catálogo no lleva campo de peso y los tubos y el cajón
 * tendrían que derivarlo de todos modos.
 */
const STEEL_WEIGHT_PER_CM2 = 0.785;

function num(v: number, decimals: number): string {
  return Number.isFinite(v) ? v.toFixed(decimals) : '—';
}

/** Dimensiones en mm — el catálogo publica 168.3 / 10.7, así que 1 decimal. */
const mm = (v: number) => num(v, 1);

/** Wel / Wpl: 1 decimal por debajo de 100 (IPE 80 → 20.0), 0 por encima. */
const modulus = (v: number) => num(v, v < 100 ? 1 : 0);

/** It: 2 decimales por debajo de 10 — IPE 80 tiene It = 0.698 cm⁴. */
const torsion = (v: number) => num(v, v < 10 ? 2 : 1);

/** Iw escalado a 10³ cm⁶: IPN 600 llega a 18 900·10³ cm⁶. */
const warping = (v: number) => num(v / 1000, 1);

const geom = (label: string, value: string): SectionPropertyRow => ({ label, value, group: 'geom' });
const prop = (label: string, value: string): SectionPropertyRow => ({ label, value, group: 'props' });
const derivedProp = (label: string, value: string): SectionPropertyRow =>
  ({ label, value, group: 'props', derived: true });

/**
 * SHS es un RHS con h === b — `SectionKind` no lo distingue. La designación
 * DECLARADA manda cuando existe: si el usuario definió un RHS 100×100, el
 * bloque lista h y b por separado (los dos campos que rellenó) en vez de
 * colapsarlos en «a — lado», igual que el rótulo dice RHS y no SHS.
 */
function isSquareTube(s: SectionGeometry): boolean {
  return s.kind === 'RHS' && (s.isSquare ?? s.h === s.b);
}

function geometryRows(s: SectionGeometry): SectionPropertyRow[] {
  switch (s.kind) {
    case 'I':
      return [
        geom('h — canto (mm)', mm(s.h)),
        geom('b — ancho de ala (mm)', mm(s.b)),
        geom('tf — espesor de ala (mm)', mm(s.tf)),
        geom('tw — espesor de alma (mm)', mm(s.tw)),
        geom('r — radio de acuerdo (mm)', mm(s.r)),
      ];
    case '2UPN':
      // b es la envolvente del cajón; tf/tw son los de cada UPN. Sin fila de
      // r: el adaptador lo fija a 0 (no es que el perfil no tenga acuerdos,
      // es que el modelo del cajón no los lleva).
      return [
        geom('h — canto (mm)', mm(s.h)),
        geom('b — ancho del cajón (mm)', mm(s.b)),
        geom('b_UPN — ancho de cada UPN (mm)', mm(s.b / 2)),
        geom('tf — espesor de ala UPN (mm)', mm(s.tf)),
        geom('tw — espesor de alma UPN (mm)', mm(s.tw)),
      ];
    case 'RHS':
      // Una sola fila de espesor (tf = tw = t) y el lado una sola vez en SHS.
      return isSquareTube(s)
        ? [
            geom('a — lado exterior (mm)', mm(s.h)),
            geom('t — espesor de pared (mm)', mm(s.tf)),
            geom('r — radio exterior de esquina (mm)', mm(s.r)),
          ]
        : [
            geom('h — canto exterior (mm)', mm(s.h)),
            geom('b — ancho exterior (mm)', mm(s.b)),
            geom('t — espesor de pared (mm)', mm(s.tf)),
            geom('r — radio exterior de esquina (mm)', mm(s.r)),
          ];
    case 'CHS':
      // h = b = D y r = 0: solo diámetro y pared.
      return [
        geom('D — diámetro exterior (mm)', mm(s.h)),
        geom('t — espesor de pared (mm)', mm(s.tf)),
      ];
  }
}

function propertyRows(s: SectionGeometry): SectionPropertyRow[] {
  const rows: SectionPropertyRow[] = [
    prop('A (cm²)', num(s.A, 1)),
    derivedProp('peso (kg/m, derivado)', num(s.A * STEEL_WEIGHT_PER_CM2, 1)),
  ];

  if (s.kind === 'CHS') {
    // Axisimétrico: los tres pares coinciden — se rotulan sin subíndice en
    // vez de duplicar la fila.
    rows.push(
      prop('I (cm⁴)', num(s.Iy, 0)),
      prop('Wel (cm³)', modulus(s.Wel_y)),
      prop('Wpl (cm³)', modulus(s.Wpl_y)),
    );
  } else {
    // Wel,z / Wpl,z de un perfil en I no vienen del catálogo: el adaptador
    // los calcula ignorando los acuerdos (~1% por debajo del valor
    // publicado). En 2UPN y RHS/SHS NO se marcan, no porque sean de
    // catálogo — allí se deriva todo — sino porque la marca señala contraste
    // con hermanas de catálogo y ahí no hay ninguna.
    const weak = (sym: string, value: string) =>
      s.kind === 'I'
        ? derivedProp(`${sym} (cm³, derivado)`, value)
        : prop(`${sym} (cm³)`, value);
    rows.push(
      prop('Iy (cm⁴)', num(s.Iy, 0)),
      prop('Iz (cm⁴)', num(s.Iz, 0)),
      prop('Wel,y (cm³)', modulus(s.Wel_y)),
      weak('Wel,z', modulus(s.Wel_z)),
      prop('Wpl,y (cm³)', modulus(s.Wpl_y)),
      weak('Wpl,z', modulus(s.Wpl_z)),
    );
  }

  rows.push(prop('It (cm⁴)', torsion(s.It)));
  // Iw = 0 en todas las cerradas: "Iw: 0 cm⁶" es la misma clase de fila
  // engañosa que "espesor de ala" en un tubo.
  if (s.Iw > 0) rows.push(prop('Iw (10³ cm⁶)', warping(s.Iw)));

  return rows;
}

/**
 * Filas del bloque, en orden de presentación dentro de cada grupo. El
 * componente no reordena. Recuento por familia: I 15 · 2UPN 14 · RHS 13 ·
 * SHS 12 · CHS 8.
 */
export function sectionPropertyRows(section: SectionGeometry): SectionPropertyRow[] {
  return [...geometryRows(section), ...propertyRows(section)];
}

/**
 * Cabecera del bloque. Prefijo de familia SOLO en CHS: es el único adaptador
 * cuyo `label` no nombra su familia (`Ø168.3×8 (EN 10210)`). `iSection` ya da
 * `IPE 300`, `upnBox` da `2UPN 200` y `rhs` ya distingue SHS de RHS él mismo,
 * así que prefijar siempre produciría "IPE IPE 300". Y en `kind: 'I'` sería
 * además imposible: la familia concreta vive en `SteelProfile.tipo`, que
 * `SectionGeometry` no expone.
 *
 * El `label` del adaptador NO se toca — alimenta fixtures de PDF byte-estables.
 */
export function sectionHeaderLabel(section: SectionGeometry): string {
  if (section.kind === 'CHS' && !section.label.startsWith('CHS')) {
    return `CHS ${section.label}`;
  }
  return section.label;
}
