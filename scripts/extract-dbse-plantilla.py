"""Vuelca las dos fichas DB SE del estudio a `src/test/fixtures/dbse-plantilla.json`.

NO forma parte del build. Se ejecuta a mano cuando cambie la plantilla de
referencia, y su salida se commitea:

    python -m pip install python-docx
    python scripts/extract-dbse-plantilla.py            # escribe la fixture
    python scripts/extract-dbse-plantilla.py --crudo X  # volcado sin sanear, a X

## Qué hace y por qué

`src/lib/memoria/plantilla.ts` transcribe a mano los textos fijos de la ficha
de cumplimiento del CTE DB SE tal como los escribe la ficha colegial (COAC)
que el estudio usa de plantilla, y el test `plantilla.test.ts` comprueba que
esa transcripción es LITERAL contra esta fixture. El fichero .docx no puede
ser el oráculo directo: python-docx no está en el entorno de vitest, y lo que
hay que cotejar es texto, no XML.

Se leen los dos documentos en el orden del cuerpo (párrafos y tablas), y de
cada uno se conserva lo que un renderer de `Block[]` necesita reproducir: el
estilo del párrafo, si va numerado, y las celdas de cada tabla. Las celdas
combinadas se toman una vez; las tablas anidadas se aplanan en líneas
«a | b | c» dentro de su celda.

Tres cosas del formato de Word que no son texto y hay que traducir:

  - los símbolos escritos con la fuente Symbol (`w:sym`, o un run entero en
    esa fuente): «£» es ≤, «r» es ρ, «m» es μ… Se traducen al Unicode que la
    fuente Arimo de los PDF sí dibuja (`src/lib/pdf/cobertura.ts`);
  - las casillas de formulario (`w:checkBox`), que salen como [x] / [ ];
  - las fórmulas incrustadas como objetos OLE, que salen como [OLE] y que la
    plantilla reescribe como texto («Ed,dst ≤ Ed,stb»).

## Lo que se quita

La fixture va SIN los datos de la obra concreta (empresa geotécnica, autores,
sondeos, cargas, materiales, aceleración): son de un proyecto real y no son
plantilla. Cada celda que coincide con `PRIVADOS` se sustituye por «». Con
`--crudo` se vuelca todo, para revisar a mano qué más hay que tapar.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

RAIZ = Path(__file__).resolve().parent.parent
CARPETA = RAIZ.parent / "ejemplos just DB SE"
DOCUMENTOS = {
    "js662": CARPETA / "JS-662_Seguridad_Estructural_CE_rev0.docx",
    "corta": CARPETA / "Cumplimiento del CTE DB SE.docx",
}
SALIDA = RAIZ / "src" / "test" / "fixtures" / "dbse-plantilla.json"

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
M = "http://schemas.openxmlformats.org/officeDocument/2006/math"

# Fuente Symbol → Unicode. Sólo lo que aparece en las fichas; lo demás se
# marca [sym:…] para verlo en el volcado y ampliar la tabla.
SYMBOL = {
    0xF0A3: "≤", 0xF0B3: "≥", 0xF072: "ρ", 0xF06D: "μ", 0xF044: "Δ",
    0xF067: "γ", 0xF061: "α", 0xF062: "β", 0xF073: "σ", 0xF066: "φ",
    0xF06C: "λ", 0xF071: "θ", 0xF06E: "ν", 0xF077: "ω", 0xF057: "Ω",
    0xF0B4: "×", 0xF0B1: "±", 0xF0B0: "°", 0xF0D7: "·", 0xF0B9: "≠",
    0xF0BA: "≡", 0xF0AE: "→", 0xF0A5: "∞", 0xF0BB: "≈", 0xF0D6: "√",
    0xF0F7: "|", 0xF0D8: "¬", 0xF06A: "φ",
}
# Otras fuentes de símbolos que usa la ficha corta.
# En UniversalMath1 BT el «[» es ≤ (así escribe la JS-662 «Ed ≤ Rd»); no es una delta.
OTRAS = {"UniversalMath1 BT": {0xF05B: "≤"}}

# Datos de la obra concreta que no son plantilla. Regex sobre el texto de la
# celda o del párrafo; si casa, la celda entera pasa a «».
PRIVADOS = [
    r"Elabora\.",                                  # empresa geotécnica
    r"Ramón Romero|Rocío Ahumada",                 # autores del geotécnico
    r"Licenciados en Ingeniería de Caminos",       # su titulación
    r"sondeos mecánicos a rotación",               # sondeos de ESTA obra
    r"Terreno vegetal y relleno|Arenas limosas",   # los estratos de ESTA obra
    r"Entrenúcleos|JS-662",                        # la obra
    r"Tfno|\d{9}",                                 # teléfonos
    r"Se ha detectado a \d",                       # nivel freático
    r"^\d+[.,]\d+ kg/cm2$|^γ=\d+ kN/m3$|^φ=\d+º$|^K[´']=|^\d{3,4} t/m3$",  # parámetros geotécnicos
]

# Las filas de la tabla de niveles son las cargas de ESTA obra: se tapa la fila entera.
FILA_PRIVADA = r"^Nivel \d+"


def texto_run(r) -> str:
    """El texto de un `w:r`, con símbolos, tabuladores, casillas y objetos traducidos."""
    fuente = None
    rpr = r.find(qn("w:rPr"))
    if rpr is not None:
        fonts = rpr.find(qn("w:rFonts"))
        if fonts is not None:
            fuente = fonts.get(qn("w:ascii")) or fonts.get(qn("w:hAnsi"))
    partes: list[str] = []
    for hijo in r:
        tag = hijo.tag
        if tag == qn("w:t"):
            t = hijo.text or ""
            if fuente == "Symbol":
                t = "".join(SYMBOL.get(0xF000 + ord(c), f"[sym:{ord(c):04X}]") for c in t)
            elif fuente in OTRAS:
                t = "".join(OTRAS[fuente].get(0xF000 + ord(c), f"[sym:{ord(c):04X}]") for c in t)
            partes.append(t)
        elif tag == qn("w:sym"):
            font = hijo.get(qn("w:font"))
            code = int(hijo.get(qn("w:char"), "0"), 16)
            tabla = SYMBOL if font == "Symbol" else OTRAS.get(font, {})
            partes.append(tabla.get(code, f"[sym:{font}:{code:04X}]"))
        elif tag == qn("w:tab"):
            partes.append(" ")
        elif tag in (qn("w:br"), qn("w:cr")):
            partes.append(" ")
        elif tag == qn("w:fldChar"):
            ff = hijo.find(qn("w:ffData"))
            if ff is not None and ff.find(qn("w:checkBox")) is not None:
                cb = ff.find(qn("w:checkBox"))
                marcado = cb.find(qn("w:checked"))
                if marcado is None:
                    marcado = cb.find(qn("w:default"))
                val = marcado.get(qn("w:val"), "1") if marcado is not None else "0"
                partes.append("[x]" if val in ("1", "true", "on") else "[ ]")
        elif tag in (qn("w:object"), qn("w:pict")):
            partes.append("[OLE]")
        elif tag == qn("w:drawing"):
            partes.append("[IMG]")
    return "".join(partes)


def texto_parrafo(p) -> str:
    partes = []
    for hijo in p.iter():
        if hijo.tag == qn("w:r"):
            partes.append(texto_run(hijo))
        elif hijo.tag == f"{{{M}}}oMath":
            partes.append("[MATH]")
    t = "".join(partes)
    t = re.sub(r"[  ]+", " ", t).strip()
    return t


def estilo(p) -> str:
    ppr = p.find(qn("w:pPr"))
    if ppr is None:
        return "Normal"
    st = ppr.find(qn("w:pStyle"))
    return st.get(qn("w:val")) if st is not None else "Normal"


def numeracion(p):
    ppr = p.find(qn("w:pPr"))
    if ppr is None:
        return None
    npr = ppr.find(qn("w:numPr"))
    if npr is None:
        return None
    num = npr.find(qn("w:numId"))
    lvl = npr.find(qn("w:ilvl"))
    return {"numId": num.get(qn("w:val")) if num is not None else None, "ilvl": lvl.get(qn("w:val")) if lvl is not None else None}


def texto_celda(tc) -> str:
    """Párrafos de la celda en líneas; una tabla anidada, en líneas «a | b»."""
    lineas: list[str] = []
    for hijo in tc:
        if hijo.tag == qn("w:p"):
            t = texto_parrafo(hijo)
            if t:
                lineas.append(t)
        elif hijo.tag == qn("w:tbl"):
            for fila in filas_tabla(hijo):
                lineas.append(" | ".join(c for c in fila if c))
    return "\n".join(lineas)


def filas_tabla(tbl) -> list[list[str]]:
    filas = []
    for tr in tbl.findall(qn("w:tr")):
        celdas = [texto_celda(tc) for tc in tr.findall(qn("w:tc"))]
        filas.append(celdas)
    return filas


def sanear(t: str) -> str:
    return "«»" if any(re.search(p, t) for p in PRIVADOS) else t


def volcar(ruta: Path, crudo: bool) -> list[dict]:
    doc = Document(str(ruta))
    bloques = []
    n = 0
    for el in doc.element.body:
        if el.tag == qn("w:p"):
            t = texto_parrafo(el)
            if not t:
                continue
            b = {"n": n, "tipo": "p", "estilo": estilo(el), "texto": t if crudo else sanear(t)}
            num = numeracion(el)
            if num:
                b["num"] = num
            bloques.append(b)
        elif el.tag == qn("w:tbl"):
            filas = filas_tabla(el)
            if not crudo:
                filas = [
                    ["«»"] * len(f) if f and re.match(FILA_PRIVADA, f[0]) else [sanear(c) for c in f]
                    for f in filas
                ]
            bloques.append({"n": n, "tipo": "tabla", "filas": filas})
        else:
            continue
        n += 1
    return bloques


def main(argv: list[str]) -> int:
    crudo = "--crudo" in argv
    destino = Path(argv[argv.index("--crudo") + 1]) if crudo else SALIDA
    salida = {}
    for clave, ruta in DOCUMENTOS.items():
        if not ruta.exists():
            print(f"no existe {ruta}", file=sys.stderr)
            return 1
        salida[clave] = {"fichero": ruta.name, "bloques": volcar(ruta, crudo)}
        print(f"{clave}: {len(salida[clave]['bloques'])} bloques de {ruta.name}")
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"escrito {destino}")
    # Símbolos sin traducir: hay que ampliar SYMBOL/OTRAS antes de fiarse.
    texto = destino.read_text(encoding="utf-8")
    pendientes = sorted(set(re.findall(r"\[sym:[^\]]+\]", texto)))
    if pendientes:
        print("SÍMBOLOS SIN TRADUCIR:", ", ".join(pendientes), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
