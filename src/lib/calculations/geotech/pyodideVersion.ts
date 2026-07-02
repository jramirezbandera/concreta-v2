// Versión del runtime Pyodide que el adaptador estampa en la trazabilidad del
// PDF (SlopeEngineMeta.pyodideVersion). DEBE coincidir con la dependencia
// `pyodide` pineada en package.json — lo vigila un test de coherencia en
// pyslope.golden.test.ts (un bump del runtime sin tocar esto haría mentir al
// sello del PDF). Módulo hoja SIN imports: lo consumen tanto slope.ts (bundle
// navegador) como el golden test (proyecto node sin tipos vite/client, que no
// puede importar la cadena worker → pyslopeFiles → *.py?raw).
export const PYODIDE_VERSION = "314.0.0";
