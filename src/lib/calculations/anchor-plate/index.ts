// Public entry point of the anchor-plate kernel.
// Re-exports types + adapter so consumers can import from one path:
//
//   import { toKernel, type AnchorGeometry, type AnchorLoad } from "../calculations/anchor-plate";
//
// The actual `calcAnchorPlate` function still lives in ../anchorPlate.ts during
// the PR0→PR10 migration. It will be moved here once every check has been
// ported onto the kernel types.

export * from "./types";
export * from "./adapter";
