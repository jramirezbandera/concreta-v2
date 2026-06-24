// Bootstrap "numpy-only" para PySlope en Pyodide (eng-review §11.5).
//
// PySlope importa plotly/tqdm/colour a nivel de módulo, pero el CÁLCULO solo
// necesita numpy. En vez de parchear las fuentes, inyectamos módulos stub en
// `sys.modules` ANTES de `import pyslope`. Lo comparten el Web Worker (navegador)
// y el golden test (node) — misma fuente Python, mismo comportamiento.
//
// Superficie real tocada en import-time (verificada en utilities.py):
//   • colour.Color(str)            — construir desde nombre/hex sin lanzar
//   • Color.range_to(other, n)     — lista de n colores
//   • Color.hex                    — string (solo plotting)
//   • tqdm.tqdm(iterable)          — passthrough (sin barra)
//   • plotly.graph_objects         — placeholder; los _plot_* nunca se ejecutan

export const STUBS_PY = `
import sys, types

# ── tqdm: iterador passthrough, sin barra de progreso (no fuga a stdout) ──
_tqdm = types.ModuleType("tqdm")
def _tqdm_fn(iterable=None, *args, **kwargs):
    return iterable if iterable is not None else []
_tqdm.tqdm = _tqdm_fn
sys.modules["tqdm"] = _tqdm

# ── colour: solo Color(str), .range_to(n) y .hex se usan al construir
#    COLOUR_FOS_DICT en import-time; los .hex acaban en paths de plotting. ──
_colour = types.ModuleType("colour")
class _Color:
    def __init__(self, color=None, **kwargs):
        self._color = color
    @property
    def hex(self):
        return "#000000"
    @property
    def hex_l(self):
        return "#000000"
    def range_to(self, other, n):
        return [_Color() for _ in range(max(1, int(n)))]
_colour.Color = _Color
sys.modules["colour"] = _colour

# ── plotly.graph_objects: placeholder. Los métodos _plot_* de PySlope no se
#    invocan (Concreta dibuja su propio SVG), así que cualquier go.X es inerte. ──
class _Dummy:
    def __init__(self, *a, **k): pass
    def __call__(self, *a, **k): return self
    def __getattr__(self, name): return _Dummy()
_plotly = types.ModuleType("plotly")
_go = types.ModuleType("plotly.graph_objects")
def _go_getattr(name): return _Dummy()
_go.__getattr__ = _go_getattr
_plotly.graph_objects = _go
sys.modules["plotly"] = _plotly
sys.modules["plotly.graph_objects"] = _go
`;

/** Nombres de los módulos vendorizados que se escriben al FS de Pyodide bajo
 *  `/vendor/pyslope/`. El orden no importa (Python resuelve imports en runtime). */
export const PYSLOPE_MODULES = [
  "__init__.py",
  "pyslope.py",
  "data_validation.py",
  "utilities.py",
] as const;

/** Raíz en el FS de Pyodide donde se monta el paquete vendorizado. */
export const PYSLOPE_FS_ROOT = "/vendor";
