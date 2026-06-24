# Vendored from PySlope 1.4.0 (MIT, (c) 2022 Jesse Bonanno).
# PATCH: _version (versioneer/git) eliminado — no aplica en Pyodide. Ver NOTICE.
from pyslope.pyslope import Material, Udl, LineLoad, Slope

__version__ = "1.4.0"
__all__ = ["Material", "Udl", "LineLoad", "Slope"]
