// Fuentes Python vendorizadas de PySlope, importadas como texto crudo (`?raw`,
// declarado por vite/client) para escribirlas al FS de Pyodide en el worker.
// El golden test (node) NO usa este módulo: lee los .py del disco con fs.
//
// Las claves coinciden con PYSLOPE_MODULES en stubs.ts.

import initPy from "./pyslope/__init__.py?raw";
import mainPy from "./pyslope/pyslope.py?raw";
import validationPy from "./pyslope/data_validation.py?raw";
import utilitiesPy from "./pyslope/utilities.py?raw";

export const PYSLOPE_SOURCES: Record<string, string> = {
  "__init__.py": initPy,
  "pyslope.py": mainPy,
  "data_validation.py": validationPy,
  "utilities.py": utilitiesPy,
};
