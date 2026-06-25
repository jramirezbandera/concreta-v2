// Vendoriza PySlope (MIT, © 2022 Jesse Bonanno) dentro del repo para ejecutarlo
// en Pyodide con runtime SOLO-numpy (eng-review §9.2 #3/#4, §1.5, §11.5).
//
// Qué hace (idempotente, dev-only — se ejecuta al fijar/bumpear versión):
//   1. Descarga el wheel de PySlope pinneado desde PyPI.
//   2. Extrae SOLO los 4 módulos del cálculo (no plotting/docs/tests).
//   3. Parchea __init__.py para soltar `_version` (versioneer usa git/subprocess,
//      inviable en Pyodide) → versión hardcodeada.
//   4. Escribe NOTICE (atribución MIT) + un manifest con versión + hash del árbol
//      vendorizado (la trazabilidad del PDF y el golden test usan este hash; si el
//      vendor deriva, el golden falla).
//
// Requiere Python en PATH SOLO para descomprimir el wheel (python -m zipfile).
// No afecta al build ni al runtime de la app — los .py extraídos se versionan.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PINNED_VERSION = "1.4.0";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = join(ROOT, "src", "lib", "calculations", "geotech", "vendor");
const PKG_DIR = join(VENDOR_DIR, "pyslope");

// Solo el cálculo: motor + validación + utilidades + paquete. NO cli/_version/
// docs/examples/tests/graphs (plotting y demo no se ejecutan).
const KEEP = ["pyslope.py", "data_validation.py", "utilities.py"];

// --- PATCH (Concreta): exposición de la física por dovela del círculo crítico ---
// `_analyse_circular_failure_bishop` calcula por dovela (x, ancho, alpha, W, U,
// cohesion, tan_phi) y los DESCARTA: solo retiene el FoS. Para poder mostrar una
// tabla por dovela en la UI, extraemos ese bloque a un helper privado
// `_compute_slice_arrays(...)` que Bishop sigue usando para su balance de fuerzas
// (matemática INTACTA → el FoS no cambia) y exponemos un método público
// `get_critical_slice_data()` que invoca ese helper UNA vez sobre el círculo
// crítico (`_search[0]`), reproduciendo las MISMAS intersecciones que usó Bishop.
// NADA de sísmico. Parche idempotente y solo-exposición.

// (1) Bloque de geometría por dovela INLINE en Bishop (texto pristino del wheel),
//     que sustituimos por una llamada al helper.
const BISHOP_INLINE_GEOMETRY = `        # --- Slice geometry setup ---
        num_slices = self._slices
        total_width = intersections[1][0] - intersections[0][0]
        slice_width = total_width / num_slices
        half_slice = slice_width / 2
        radius_sq = radius**2

        # Slice centre x-coordinates
        slice_x = np.linspace(
            intersections[0][0] + half_slice,
            intersections[1][0] - half_slice,
            num_slices,
        )

        # --- Ensure slices lie within the circle ---
        dx_sq = (slice_x - c_x) ** 2
        if np.any(dx_sq > radius_sq):
            return None  # means some slice centres are outside the circular slip arc

        # --- Compute top and bottom y-coordinates of each slice ---
        slice_y_bottom = c_y - np.sqrt(radius_sq - dx_sq)
        (
            top_x,
            top_y,
        ) = self._top_coord
        (
            bot_x,
            bot_y,
        ) = self._bot_coord
        slope_grad = self._gradient

        # Top of the slice (depends on position along slope)
        slice_y_top = np.where(
            slice_x <= top_x,
            top_y,
            np.where(
                slice_x >= bot_x,
                bot_y,
                top_y - (slice_x - top_x) * slope_grad,
            ),
        )
        slice_y_top = np.maximum(
            slice_y_top,
            slice_y_bottom,
        )  # prevent negative slice height

        # --- Geometry angles and trigonometric terms ---
        dy = c_y - slice_y_bottom
        alpha = np.arctan((c_x - slice_x) / dy)
        cos_alpha = np.cos(alpha)
        sin_alpha = np.sin(alpha)
        if np.any(cos_alpha == 0):
            return None

        # --- Compute slice weights (including soil self-weight) ---
        W = self._calculate_strip_weights(
            slice_width,
            slice_y_top,
            slice_y_bottom,
        )

        # --- Add uniformly distributed loads (UDLs) ---
        x_left = slice_x - half_slice
        x_right = slice_x + half_slice
        for udl in self._udls:
            overlap = np.minimum(
                x_right,
                udl.right,
            ) - np.maximum(
                x_left,
                udl.left,
            )
            overlap = np.clip(
                overlap,
                0.0,
                None,
            )
            W += overlap * udl.magnitude

        # --- Add line loads (LLs) ---
        for ll in self._lls:
            mask = (x_left <= ll.coord) & (ll.coord < x_right)
            if np.any(mask):
                W[mask] += ll.magnitude

        # --- Water pressures (uplift) ---
        if self._water_RL:
            x_water = self.get_external_x_intersection(self._water_RL)
            within_slope = (x_water < slice_x) & (slice_x < self._bot_coord[0])
            head = np.maximum(
                np.minimum(
                    self._water_RL,
                    slice_y_top,
                )
                - slice_y_bottom,
                0.0,
            )
            U = (
                head
                * 9.81
                * slice_width
                * np.where(
                    within_slope,
                    self._water_analysis_H,
                    1.0,
                )
            )
        else:
            U = np.zeros_like(W)

        # --- Assign soil material properties per slice ---
        if not self._materials:
            return None

        num = num_slices
        cohesion = np.empty(num)
        tan_phi = np.empty(num)
        assigned = np.zeros(
            num,
            dtype=bool,
        )

        last_mat = self._materials[-1]
        cohesion[:] = last_mat.cohesion
        tan_phi[:] = last_mat.tan_friction_angle

        for mat in self._materials:
            mask = (~assigned) & (mat.RL < slice_y_bottom)
            if np.any(mask):
                cohesion[mask] = mat.cohesion
                tan_phi[mask] = mat.tan_friction_angle
                assigned[mask] = True

        # --- Iterative Bishop solution ---`;

// (2) El bloque que reemplaza al anterior: llamada al helper + desempaquetado.
const BISHOP_HELPER_CALL = `        # --- Per-slice geometry, forces and material properties ---
        # PATCH (Concreta): extracted to a private helper so the per-slice
        # physics can be re-derived for the critical circle (see
        # get_critical_slice_data) reusing the EXACT same maths. Bishop's
        # force balance below is unchanged → the FoS is identical.
        slices = self._compute_slice_arrays(
            c_x,
            c_y,
            radius,
            intersections[0][0],
            intersections[1][0],
        )
        if slices is None:
            return None

        slice_width = slices["slice_width"]
        cos_alpha = slices["cos_alpha"]
        sin_alpha = slices["sin_alpha"]
        W = slices["W"]
        U = slices["U"]
        cohesion = slices["cohesion"]
        tan_phi = slices["tan_phi"]

        # --- Iterative Bishop solution ---`;

// (3) Ancla: fin de Bishop, justo antes de analyse_dynamic. Insertamos los dos
//     métodos nuevos (helper + getter público) entre el `return float(prev_FS)`
//     de Bishop y la siguiente definición.
const BISHOP_TAIL_ANCHOR = `            prev_FS = FS

        return float(prev_FS)

    def analyse_dynamic(self, critical_fos=1.3):`;

const NEW_METHODS = `            prev_FS = FS

        return float(prev_FS)

    def _compute_slice_arrays(
        self,
        c_x: float,
        c_y: float,
        radius: float,
        left_x: float,
        right_x: float,
    ):
        """PATCH (Concreta): per-slice geometry/forces for a circular slip plane.

        Extracted verbatim from \`\`_analyse_circular_failure_bishop\`\` so the same
        maths can be reused both by Bishop's force balance and by
        \`\`get_critical_slice_data\`\`. NOT seismic. Returns \`\`None\`\` for the same
        degenerate cases Bishop rejected (slice outside the arc, vertical base,
        no materials) so the FoS search behaves identically.

        Parameters
        ----------
        c_x, c_y, radius : float
            circle centre and radius
        left_x, right_x : float
            x of the left/right intersection of the arc with the ground

        Returns
        -------
        dict or None
            dict with parallel per-slice arrays (length = number of slices):
            \`\`slice_x\`\`, \`\`slice_width\`\`, \`\`alpha\`\`, \`\`cos_alpha\`\`,
            \`\`sin_alpha\`\`, \`\`W\`\`, \`\`U\`\`, \`\`cohesion\`\`, \`\`tan_phi\`\`.
        """

        # --- Slice geometry setup ---
        num_slices = self._slices
        total_width = right_x - left_x
        slice_width = total_width / num_slices
        half_slice = slice_width / 2
        radius_sq = radius**2

        # Slice centre x-coordinates
        slice_x = np.linspace(
            left_x + half_slice,
            right_x - half_slice,
            num_slices,
        )

        # --- Ensure slices lie within the circle ---
        dx_sq = (slice_x - c_x) ** 2
        if np.any(dx_sq > radius_sq):
            return None  # means some slice centres are outside the circular slip arc

        # --- Compute top and bottom y-coordinates of each slice ---
        slice_y_bottom = c_y - np.sqrt(radius_sq - dx_sq)
        (
            top_x,
            top_y,
        ) = self._top_coord
        (
            bot_x,
            bot_y,
        ) = self._bot_coord
        slope_grad = self._gradient

        # Top of the slice (depends on position along slope)
        slice_y_top = np.where(
            slice_x <= top_x,
            top_y,
            np.where(
                slice_x >= bot_x,
                bot_y,
                top_y - (slice_x - top_x) * slope_grad,
            ),
        )
        slice_y_top = np.maximum(
            slice_y_top,
            slice_y_bottom,
        )  # prevent negative slice height

        # --- Geometry angles and trigonometric terms ---
        dy = c_y - slice_y_bottom
        alpha = np.arctan((c_x - slice_x) / dy)
        cos_alpha = np.cos(alpha)
        sin_alpha = np.sin(alpha)
        if np.any(cos_alpha == 0):
            return None

        # --- Compute slice weights (including soil self-weight) ---
        W = self._calculate_strip_weights(
            slice_width,
            slice_y_top,
            slice_y_bottom,
        )

        # --- Add uniformly distributed loads (UDLs) ---
        x_left = slice_x - half_slice
        x_right = slice_x + half_slice
        for udl in self._udls:
            overlap = np.minimum(
                x_right,
                udl.right,
            ) - np.maximum(
                x_left,
                udl.left,
            )
            overlap = np.clip(
                overlap,
                0.0,
                None,
            )
            W += overlap * udl.magnitude

        # --- Add line loads (LLs) ---
        for ll in self._lls:
            mask = (x_left <= ll.coord) & (ll.coord < x_right)
            if np.any(mask):
                W[mask] += ll.magnitude

        # --- Water pressures (uplift) ---
        if self._water_RL:
            x_water = self.get_external_x_intersection(self._water_RL)
            within_slope = (x_water < slice_x) & (slice_x < self._bot_coord[0])
            head = np.maximum(
                np.minimum(
                    self._water_RL,
                    slice_y_top,
                )
                - slice_y_bottom,
                0.0,
            )
            U = (
                head
                * 9.81
                * slice_width
                * np.where(
                    within_slope,
                    self._water_analysis_H,
                    1.0,
                )
            )
        else:
            U = np.zeros_like(W)

        # --- Assign soil material properties per slice ---
        if not self._materials:
            return None

        num = num_slices
        cohesion = np.empty(num)
        tan_phi = np.empty(num)
        assigned = np.zeros(
            num,
            dtype=bool,
        )

        last_mat = self._materials[-1]
        cohesion[:] = last_mat.cohesion
        tan_phi[:] = last_mat.tan_friction_angle

        for mat in self._materials:
            mask = (~assigned) & (mat.RL < slice_y_bottom)
            if np.any(mask):
                cohesion[mask] = mat.cohesion
                tan_phi[mask] = mat.tan_friction_angle
                assigned[mask] = True

        return {
            "slice_x": slice_x,
            "slice_width": slice_width,
            "alpha": alpha,
            "cos_alpha": cos_alpha,
            "sin_alpha": sin_alpha,
            "W": W,
            "U": U,
            "cohesion": cohesion,
            "tan_phi": tan_phi,
        }

    def get_critical_slice_data(self, method="bishop"):
        """PATCH (Concreta): per-slice physics for the critical circle.

        \`\`method\`\` ("bishop" | "ordinary") selects the uplift convention so the
        reported per-slice U matches the force balance that produced the FoS:
        Bishop integrates uplift over the horizontal slice_width, the ordinary
        method (Fellenius) over the inclined base length (slice_width / cos_alpha).
        Pass the SAME method used in \`\`analyse_slope\`\`.

        Returns the parallel per-slice arrays (geometry, weight, pore pressure
        and material properties) of the circular slip plane with the minimum
        factor of safety. These are the values Bishop already computes
        internally and discards; here they are re-derived ONCE for the critical
        circle reusing the exact same maths (\`\`_compute_slice_arrays\`\`), so the
        FoS is unaffected. NOT seismic.

        Must be called after \`\`analyse_slope()\`\`.

        Returns
        -------
        dict
            dict of parallel lists, each of length = number of slices::

                {
                    "x":        [...],  # slice centre x (m)
                    "width":    [...],  # slice width b (m)
                    "alpha":    [...],  # base inclination (rad)
                    "weight":   [...],  # slice weight W (kN)
                    "u":        [...],  # pore pressure resultant U on base (kN)
                    "cohesion": [...],  # base material cohesion c (kPa)
                    "tan_phi":  [...],  # base material tan(phi)
                }

            Returns lists of empty arrays if the slope has not been analysed
            (no critical circle available).
        """
        empty = {
            "x": [],
            "width": [],
            "alpha": [],
            "weight": [],
            "u": [],
            "cohesion": [],
            "tan_phi": [],
        }

        # analyse_slope() not run (or no valid circle found)
        if not self._search:
            return empty

        c_x = self._search[0]["c_x"]
        c_y = self._search[0]["c_y"]
        radius = self._search[0]["radius"]

        # Recompute the arc/ground intersections EXACTLY as Bishop did during
        # analyse_slope (which was called without explicit left/right), so the
        # per-slice grid here is bit-identical to the one used for the FoS.
        intersections = self._get_circle_external_intersection(
            c_x,
            c_y,
            radius,
        )
        if len(set(intersections)) < 2:
            return empty

        slices = self._compute_slice_arrays(
            c_x,
            c_y,
            radius,
            intersections[0][0],
            intersections[1][0],
        )
        if slices is None:
            return empty

        n = self._slices
        width = slices["slice_width"]
        # PATCH (Concreta): _compute_slice_arrays returns U in Bishop's convention
        # (uplift over the horizontal slice_width). The ordinary method (Fellenius)
        # integrates uplift over the INCLINED base length (slice_width / cos_alpha),
        # i.e. U_ordinary = U_bishop / cos_alpha (the only term that differs). Rescale
        # so the reported per-slice U equals the one that entered the Fellenius FoS
        # (defensibility: the dovela table mirrors the computed run, not another
        # method). Bishop ("bishop", default) is returned unchanged → golden intact.
        u = slices["U"] / slices["cos_alpha"] if method == "ordinary" else slices["U"]
        return {
            "x": slices["slice_x"].tolist(),
            "width": [float(width)] * n,
            "alpha": slices["alpha"].tolist(),
            "weight": slices["W"].tolist(),
            "u": u.tolist(),
            "cohesion": slices["cohesion"].tolist(),
            "tan_phi": slices["tan_phi"].tolist(),
        }

    def analyse_dynamic(self, critical_fos=1.3):`;

// --- PATCH (Concreta): selección de método de cálculo (Bishop / Fellenius) ---
// `analyse_slope` del wheel llama SIEMPRE a `_analyse_circular_failure_bishop`.
// PySlope ya implementa el método ordinario (Fellenius) en
// `_analyse_circular_failure_ordinary` (mismo contrato: devuelve float FoS), pero
// no es seleccionable. Añadimos un parámetro `method` ("bishop" | "ordinary") y
// despachamos por él. El camino de Bishop queda INTACTO → el golden FoS no cambia.

// (4) Firma de analyse_slope (texto pristino del wheel) → con parámetro `method`.
const ANALYSE_SLOPE_SIGNATURE = `    def analyse_slope(self, max_fos=None):`;
const ANALYSE_SLOPE_SIGNATURE_PATCHED = `    def analyse_slope(self, max_fos=None, method="bishop"):`;

// (5) Bucle de cálculo del FoS (texto pristino) → dispatch por método.
const ANALYSE_SLOPE_LOOP = `        # go through each assumed plane and calculate the FOS
        for i, search in enumerate(tqdm(self._search)):
            self._search[i]["FOS"] = self._analyse_circular_failure_bishop(
                c_x=search["c_x"],
                c_y=search["c_y"],
                radius=search["radius"],
            )`;
const ANALYSE_SLOPE_LOOP_PATCHED = `        # go through each assumed plane and calculate the FOS
        # PATCH (Concreta): dispatch by method so the ordinary method of slices
        # (Fellenius) is selectable alongside Bishop. Bishop's path is unchanged
        # (default), so the golden FoS is identical. NOT seismic.
        _fos_fn = (
            self._analyse_circular_failure_ordinary
            if method == "ordinary"
            else self._analyse_circular_failure_bishop
        )
        for i, search in enumerate(tqdm(self._search)):
            self._search[i]["FOS"] = _fos_fn(
                c_x=search["c_x"],
                c_y=search["c_y"],
                radius=search["radius"],
            )`;

/**
 * Aplica el parche de exposición por dovela al fuente pristino de pyslope.py.
 * Idempotente: si ya está parcheado, lo devuelve sin tocar. Lanza si no
 * encuentra los anclas (el wheel cambió de forma → revisar el parche).
 *
 * El wheel de PyPI trae finales de línea CRLF; las constantes del parche usan
 * LF. Detectamos el EOL del fuente y adaptamos las constantes para que la
 * sustitución sea exacta y el resultado preserve el EOL original (mismo
 * convenio de bytes que data_validation.py/utilities.py → hash estable).
 */
function patchPyslopeSource(src) {
  if (src.includes("_compute_slice_arrays")) {
    return src; // ya parcheado
  }
  const usesCrlf = src.includes("\r\n");
  const toEol = (s) => (usesCrlf ? s.replace(/\r?\n/g, "\r\n") : s);

  const inlineGeom = toEol(BISHOP_INLINE_GEOMETRY);
  const helperCall = toEol(BISHOP_HELPER_CALL);
  const tailAnchor = toEol(BISHOP_TAIL_ANCHOR);
  const newMethods = toEol(NEW_METHODS);
  const slopeSig = toEol(ANALYSE_SLOPE_SIGNATURE);
  const slopeSigPatched = toEol(ANALYSE_SLOPE_SIGNATURE_PATCHED);
  const slopeLoop = toEol(ANALYSE_SLOPE_LOOP);
  const slopeLoopPatched = toEol(ANALYSE_SLOPE_LOOP_PATCHED);

  if (!src.includes(inlineGeom)) {
    throw new Error(
      "patch pyslope.py: no se encontró el bloque de geometría inline de Bishop (¿cambió el wheel?)",
    );
  }
  if (!src.includes(tailAnchor)) {
    throw new Error(
      "patch pyslope.py: no se encontró el ancla de fin de Bishop / analyse_dynamic (¿cambió el wheel?)",
    );
  }
  if (!src.includes(slopeSig)) {
    throw new Error(
      "patch pyslope.py: no se encontró la firma de analyse_slope (¿cambió el wheel?)",
    );
  }
  if (!src.includes(slopeLoop)) {
    throw new Error(
      "patch pyslope.py: no se encontró el bucle de cálculo de FoS en analyse_slope (¿cambió el wheel?)",
    );
  }
  let out = src.replace(inlineGeom, helperCall);
  out = out.replace(tailAnchor, newMethods);
  out = out.replace(slopeSig, slopeSigPatched);
  out = out.replace(slopeLoop, slopeLoopPatched);
  return out;
}

// __init__ pristino arrastra `_version` (versioneer). Lo reemplazamos por uno
// mínimo que solo re-exporta la API pública y hardcodea la versión.
const PATCHED_INIT = `# Vendored from PySlope ${PINNED_VERSION} (MIT, (c) 2022 Jesse Bonanno).
# PATCH: _version (versioneer/git) eliminado — no aplica en Pyodide. Ver NOTICE.
from pyslope.pyslope import Material, Udl, LineLoad, Slope

__version__ = "${PINNED_VERSION}"
__all__ = ["Material", "Udl", "LineLoad", "Slope"]
`;

async function pypiWheelUrl(version) {
  const res = await fetch(`https://pypi.org/pypi/pyslope/${version}/json`);
  if (!res.ok) throw new Error(`PyPI ${version} → ${res.status}`);
  const data = await res.json();
  const wheel = data.urls.find((u) => u.packagetype === "bdist_wheel");
  if (!wheel) throw new Error(`no wheel for pyslope ${version}`);
  return wheel.url;
}

async function sha256OfDir(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".py")).sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f);
    h.update(await readFile(join(dir, f)));
  }
  return h.digest("hex");
}

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "vendor-pyslope-"));
  try {
    const url = await pypiWheelUrl(PINNED_VERSION);
    console.log(`pyslope ${PINNED_VERSION} ← ${url}`);
    const whl = join(tmp, "pyslope.whl");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch wheel → ${res.status}`);
    await writeFile(whl, Buffer.from(await res.arrayBuffer()));

    const ext = join(tmp, "ext");
    execFileSync("python", ["-m", "zipfile", "-e", whl, ext], { stdio: "inherit" });

    await rm(PKG_DIR, { recursive: true, force: true });
    await mkdir(PKG_DIR, { recursive: true });

    const license = await readFile(join(ext, `pyslope-${PINNED_VERSION}.dist-info`, "licenses", "LICENSE.txt"), "utf8");

    for (const f of KEEP) {
      const src = await readFile(join(ext, "pyslope", f));
      if (f === "pyslope.py") {
        // PATCH (Concreta): expone la física por dovela del círculo crítico.
        const patched = patchPyslopeSource(src.toString("utf8"));
        await writeFile(join(PKG_DIR, f), patched);
        console.log(`  vendored pyslope/${f} (+patch get_critical_slice_data)`);
      } else {
        await writeFile(join(PKG_DIR, f), src);
        console.log(`  vendored pyslope/${f}`);
      }
    }
    await writeFile(join(PKG_DIR, "__init__.py"), PATCHED_INIT);
    console.log("  patched  pyslope/__init__.py (dropped _version)");
    await writeFile(join(PKG_DIR, "LICENSE.txt"), license);

    const patchHash = await sha256OfDir(PKG_DIR);
    const manifest = {
      package: "pyslope",
      version: PINNED_VERSION,
      license: "MIT",
      copyright: "Copyright (c) 2022, Jesse Bonanno",
      source: url,
      kept: [...KEEP, "__init__.py"],
      patch: "(1) Replaced __init__.py to drop the versioneer `_version` import (git/subprocess unavailable in Pyodide); version hardcoded. (2) pyslope.py: extracted the per-slice geometry/forces block from `_analyse_circular_failure_bishop` into a private `_compute_slice_arrays` helper (FoS maths unchanged) and added a public `get_critical_slice_data(method)` that re-derives per-slice physics (x, width, alpha, W, U, cohesion, tan_phi) for the critical circle reusing the exact same maths; `method` selects the uplift convention (Bishop: horizontal slice_width; ordinary/Fellenius: inclined base length = slice_width/cos_alpha) so the reported per-slice U matches the FoS that produced it. Exposure-only, no FoS change, no seismic. (3) pyslope.py: added a `method` parameter to `analyse_slope` (\"bishop\" default | \"ordinary\") dispatching the search to `_analyse_circular_failure_ordinary` (Fellenius) or `_analyse_circular_failure_bishop`. Bishop's path is unchanged (default) so the golden FoS is identical; selection-only, no seismic.",
      runtime: "numpy-only via sys.modules stubs for tqdm/colour/plotly (see stubs.py). pyslope.py carries the exposure-only per-slice patch (see `patch`); the FoS maths is unchanged. data_validation.py/utilities.py are unmodified.",
      patchHash,
      generatedBy: "scripts/vendor-pyslope.mjs",
    };
    await writeFile(join(VENDOR_DIR, "pyslope.manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    const notice = `Concreta — third-party notices
================================

PySlope
-------
This product vendors source files from PySlope (${PINNED_VERSION}), a 2D slope
stability library, executed in-browser via Pyodide.

  Homepage:  https://github.com/JesseBonanno/PySlope
  License:   MIT
  ${manifest.copyright}

Vendored files (src/lib/calculations/geotech/vendor/pyslope/):
  data_validation.py, utilities.py  — unmodified
  pyslope.py                        — patched (see pyslope.manifest.json)
  __init__.py                       — patched (see pyslope.manifest.json)

Vendor tree SHA-256: ${patchHash}

The plotting paths (plotly/tqdm/colour) are never executed: Concreta consumes
only the numeric results and renders its own SVG. Those imports are satisfied by
lightweight stubs at runtime (numpy-only). The full MIT license text is preserved
in vendor/pyslope/LICENSE.txt.
`;
    await writeFile(join(ROOT, "NOTICE"), notice);
    console.log(`  wrote    NOTICE + pyslope.manifest.json`);
    console.log(`vendor tree sha256: ${patchHash}`);
    console.log("done.");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("vendor-pyslope failed:", err.message);
  process.exit(1);
});
