// Bridge between the UI-facing `AnchorPlateInputs` (flat shape persisted in
// localStorage / used by the input panel) and the structured kernel types
// (`AnchorGeometry`, `AnchorLoad`).
//
// During the PR0→PR10 transition this adapter is the single source of truth
// for the mapping. As subsequent PRs migrate individual checks to consume
// the kernel types, they import from this module and call `toKernel()`.
// The legacy `calcAnchorPlate(inp)` still reads `inp` directly until each
// check is migrated.

import type { AnchorPlateInputs } from "../../../data/defaults";
import type {
  AnchorGeometry,
  AnchorLoad,
  Plate,
  Pedestal,
  ProfileRef,
  BarLayoutSpec,
  Stiffener,
  PlateSteelGrade,
} from "./types";

export interface KernelInput {
  geometry: AnchorGeometry;
  load: AnchorLoad;
}

/** Project the flat `AnchorPlateInputs` onto the structured kernel shape. */
export function toKernel(inp: AnchorPlateInputs): KernelInput {
  const plate: Plate = {
    a: inp.plate_a as number,
    b: inp.plate_b as number,
    t: inp.plate_t as number,
    steel: inp.plate_steel as PlateSteelGrade,
  };

  // Directional edge distances: prefer the new cX1/cX2/cY1/cY2 fields. They
  // are non-optional on the interface, but state spread from localStorage of
  // a pre-PR0 build may not have them yet — fall back to the legacy symmetric
  // cX/cY in that case. Same idea for `pedestal_h`.
  const pedestal: Pedestal = {
    fck: inp.fck as number,
    h: (inp.pedestal_h as number) || 1000,
    cX1: (inp.pedestal_cX1 as number) || (inp.pedestal_cX as number),
    cX2: (inp.pedestal_cX2 as number) || (inp.pedestal_cX as number),
    cY1: (inp.pedestal_cY1 as number) || (inp.pedestal_cY as number),
    cY2: (inp.pedestal_cY2 as number) || (inp.pedestal_cY as number),
    marginX: inp.plate_margin_x as number,
    marginY: inp.plate_margin_y as number,
    surface: inp.surface_type as Pedestal["surface"],
  };

  const profile: ProfileRef = {
    type: inp.sectionType as ProfileRef["type"],
    size: inp.sectionSize as number,
  };

  const bars: BarLayoutSpec = {
    count: inp.bar_nLayout as BarLayoutSpec["count"],
    diameter: inp.bar_diam as BarLayoutSpec["diameter"],
    grade: inp.bar_grade as BarLayoutSpec["grade"],
    spacingX: inp.bar_spacing_x as number,
    spacingY: inp.bar_spacing_y as number,
    edgeX: inp.bar_edge_x as number,
    edgeY: inp.bar_edge_y as number,
    hef: inp.bar_hef as number,
    bottomAnchorage: inp.bottom_anchorage as BarLayoutSpec["bottomAnchorage"],
    topConnection: inp.top_connection as BarLayoutSpec["topConnection"],
    washerOd: inp.washer_od as number,
  };

  const stiffener: Stiffener = {
    count: inp.rib_count as Stiffener["count"],
    h: inp.rib_h as number,
    t: inp.rib_t as number,
    weldThroat: inp.weld_throat as number,
  };

  // Decomposed shear. Vx/Vy are non-optional on the interface; legacy state
  // missing them falls back to treating legacy `VEd` as Vx.
  const load: AnchorLoad = {
    NEd: inp.NEd as number,
    NEd_G: inp.NEd_G as number,
    Mx: inp.Mx as number,
    My: inp.My as number,
    Vx: typeof inp.Vx === "number" ? inp.Vx : (inp.VEd as number),
    Vy: typeof inp.Vy === "number" ? inp.Vy : 0,
  };

  return {
    geometry: { plate, pedestal, profile, bars, stiffener },
    load,
  };
}
