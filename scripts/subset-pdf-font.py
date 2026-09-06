"""Genera la fuente Unicode de los PDF: `src/lib/pdf/fuenteArimo.ts` y `cobertura.ts`.

NO forma parte del build. Se ejecuta a mano cuando haya que ampliar el
repertorio de caracteres o actualizar la fuente, y su salida se commitea.

    python -m pip install fonttools
    python scripts/subset-pdf-font.py

## Por qué Arimo

Las fuentes core de jsPDF (Helvetica) sólo hablan Latin-1, así que hasta ahora
`pdfStr()` degradaba «Δcdev» a «Deltacdev» y «≤» a «<=» en los 21 exportadores.
Para arreglarlo hay que EMBEBER una fuente, y la elección no es libre: todo el
maquetado de esos exportadores está calculado con las anchuras de Helvetica.

**Arimo** es la versión de Google Fonts de Liberation Sans: licencia SIL OFL 1.1
—se puede embeber y redistribuir— y **métricamente compatible con Arial**, que a
su vez comparte anchuras con Helvetica. Medido sobre cadenas reales de la app,
la desviación máxima de `getTextWidth` es del **0,78 %**: en una columna de
170 mm son 1,3 mm, así que ninguna tabla se descuadra.

Origen: https://github.com/google/fonts/tree/main/ofl/arimo (fuente variable
`Arimo[wght].ttf` y `Arimo-Italic[wght].ttf`), instanciadas a wght 400 y 700.
La licencia viaja con la app en `public/fonts/Arimo-OFL.txt`, como exige la OFL.

## Qué se subsetea

Latin-1 completo, los extras de WinAnsi, el bloque griego entero, sub/
superíndices y los símbolos matemáticos y de marca que la app usa de verdad
(salieron de recorrer `src/` contando caracteres fuera de Latin-1). Sin
subsetear, la variable pesa 496 kB; subseteada, cada peso baja a ~33 kB, que en
base64 son ~45 kB por peso dentro de un chunk perezoso.

Los `layout_features` se vacían a propósito: jsPDF no aplica GSUB/GPOS, así que
guardarlos sería peso muerto. Consecuencia a tener presente: el macron
combinante U+0304 conserva anchura y jsPDF no lo coloca sobre la letra, así
que «λ̄» saldría como una λ y un hueco. Por eso `pdfStr()` lo traduce.
"""

import base64
import io
import os
import sys

try:
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
except ImportError:
    sys.exit('Falta fonttools: python -m pip install fonttools')

# fontTools estampa la hora de generación en `head.modified`, así que sin esto
# cada ejecución escupe un fuenteArimo.ts distinto y el repo se llena de diffs
# de 139 kB que no cambian nada. `SOURCE_DATE_EPOCH` la congela; el valor es la
# fecha en que se subseteó por primera vez.
os.environ.setdefault('SOURCE_DATE_EPOCH', '1788566400')  # 2026-09-05

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(RAIZ, 'scripts', 'vendor')
URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/arimo/'

# ── El repertorio ───────────────────────────────────────────────────────────
# Ampliarlo es barato (cada glifo son ~80 B); quitarlo, no: un carácter fuera
# del subset se dibuja como `.notdef`, que en jsPDF es INVISIBLE — no una caja.
# De ahí que `pdfStr()` remate con «?» lo que no esté cubierto: un interrogante
# se ve, un hueco no.
REPERTORIO = set(range(0x20, 0x100))                       # ASCII + Latin-1
REPERTORIO |= {0x152, 0x153, 0x160, 0x161, 0x178, 0x17D, 0x17E, 0x192}
REPERTORIO |= {0x2C6, 0x2DC}                               # extras de WinAnsi
REPERTORIO |= set(range(0x370, 0x400))                     # griego entero
REPERTORIO |= set(range(0x2070, 0x20A0))                   # sub/superíndices
REPERTORIO |= {
    0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E,
    0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2032, 0x2033, 0x2039, 0x203A,
    0x2122, 0x2113,
    0x2190, 0x2191, 0x2192, 0x2193, 0x2194, 0x21D2,
    0x2202, 0x2205, 0x2208, 0x220F, 0x2211, 0x2212, 0x2215,
    0x221A, 0x221D, 0x221E, 0x2225, 0x2229, 0x222A, 0x222B,
    0x2248, 0x2260, 0x2261, 0x2264, 0x2265, 0x226A, 0x226B, 0x22A5,
    0x2500, 0x2502,
    0x25A0, 0x25A1, 0x25B2, 0x25BA, 0x25BC, 0x25BD, 0x25C4, 0x25CB, 0x25CF,
    0x2605, 0x26A0, 0x2713, 0x2717,
    0x2153, 0x2154,
}

# Las tres caras que usan los exportadores. Falta la negrita cursiva a
# propósito: nadie la pide y cada cara son otros 45 kB en base64. Hay un test
# que falla si alguien escribe `setFont('helvetica', 'bolditalic')`, porque sin
# cara registrada jsPDF caería a la Helvetica core —Latin-1— y el mojibake
# volvería justo por donde nadie mira.
CARAS = (
    ('regular', 'Arimo[wght].ttf', 400),
    ('bold', 'Arimo[wght].ttf', 700),
    ('italic', 'Arimo-Italic[wght].ttf', 400),
)


def rangos(codigos):
    """Comprime una lista ordenada de codepoints en pares [inicio, fin]."""
    salida = []
    for c in sorted(codigos):
        if salida and c == salida[-1][1] + 1:
            salida[-1][1] = c
        else:
            salida.append([c, c])
    return salida


def main():
    for _, fichero, _ in CARAS:
        ruta = os.path.join(VENDOR, fichero)
        if not os.path.exists(ruta):
            # Las variables de origen no se versionan (~1 MB cada una, y sólo
            # son la ENTRADA): lo que va al repo es la salida subseteada. Misma
            # regla que los assets de Pyodide, ver .gitignore.
            sys.exit(
                f'Falta {fichero}. Tráelas con:\n'
                '  mkdir -p scripts/vendor\n'
                f'  curl -sSL -o "scripts/vendor/Arimo[wght].ttf" {URL}Arimo%5Bwght%5D.ttf\n'
                f'  curl -sSL -o "scripts/vendor/Arimo-Italic[wght].ttf" '
                f'{URL}Arimo-Italic%5Bwght%5D.ttf'
            )

    sonda = TTFont(os.path.join(VENDOR, CARAS[0][1]))
    cmap = set(sonda.getBestCmap())
    sonda.close()
    cubiertos = REPERTORIO & cmap
    print(f'repertorio {len(REPERTORIO)} · con glifo en Arimo {len(cubiertos)}')
    faltan = sorted(REPERTORIO - cmap)
    print('sin glifo:', ' '.join(f'U+{c:04X}' for c in faltan) or '(ninguno)')

    b64 = {}
    for nombre, fichero, peso in CARAS:
        f = TTFont(os.path.join(VENDOR, fichero))
        instantiateVariableFont(f, {'wght': peso}, inplace=True, updateFontNames=True)
        opciones = Options()
        opciones.layout_features = []
        opciones.hinting = False
        opciones.notdef_outline = True
        opciones.name_IDs = [1, 2, 3, 4, 6]
        sub = Subsetter(options=opciones)
        sub.populate(unicodes=cubiertos)
        sub.subset(f)
        buf = io.BytesIO()
        f.save(buf)
        f.close()
        crudo = buf.getvalue()
        b64[nombre] = base64.b64encode(crudo).decode('ascii')
        print(f'  {nombre:7} wght={peso}  ttf {len(crudo):>7} B  base64 {len(b64[nombre]):>7} B')

    cabecera = (
        '// GENERADO por scripts/subset-pdf-font.py — no editar a mano.\n'
        '//\n'
        '// Arimo (Google Fonts), subconjunto instanciado a wght 400 y 700.\n'
        '// Copyright 2026 The Arimo Project Authors\n'
        '// (https://github.com/googlefonts/arimo), bajo SIL Open Font License 1.1.\n'
        '// El texto de la licencia viaja con la app en public/fonts/Arimo-OFL.txt.\n'
    )

    datos = os.path.join(RAIZ, 'src', 'lib', 'pdf', 'fuenteArimo.ts')
    io.open(datos, 'w', encoding='utf8', newline='').write(
        cabecera
        + '//\n'
        + '// Las tres caras, en base64, tal y como las quiere `addFileToVFS` de jsPDF.\n'
        + '// Viven en su propio módulo para que sólo entren en el chunk de quien\n'
        + '// exporta un PDF: `utils.ts` lo importa media app por `titledFilename`.\n\n'
        + f"export const ARIMO_REGULAR_B64 =\n  '{b64['regular']}';\n\n"
        + f"export const ARIMO_BOLD_B64 =\n  '{b64['bold']}';\n\n"
        + f"export const ARIMO_ITALIC_B64 =\n  '{b64['italic']}';\n"
    )
    print('escrito', datos, os.path.getsize(datos), 'B')

    pares = rangos(cubiertos)
    cuerpo = ',\n  '.join(f'[0x{a:04X}, 0x{b:04X}]' for a, b in pares)
    cob = os.path.join(RAIZ, 'src', 'lib', 'pdf', 'cobertura.ts')
    io.open(cob, 'w', encoding='utf8', newline='').write(
        cabecera
        + '//\n'
        + '// Qué caracteres SÍ tienen glifo en el subconjunto, como pares\n'
        + '// [primero, último]. `pdfStr()` decide con esto qué puede dejar pasar,\n'
        + '// de modo que el saneador se deriva de la fuente en vez de mantenerse a\n'
        + '// mano: ampliar el repertorio en el script basta para que deje de\n'
        + '// degradarse un símbolo. Es un módulo aparte del base64 porque de éste\n'
        + '// tira `utils.ts`, que está en el chunk principal.\n\n'
        + f'export const ARIMO_RANGOS: readonly (readonly [number, number])[] = [\n  {cuerpo},\n];\n\n'
        + '/** Cuántos caracteres distintos cubre la fuente. Lo usa su test. */\n'
        + f'export const ARIMO_GLIFOS = {len(cubiertos)};\n'
    )
    print('escrito', cob, os.path.getsize(cob), 'B')


if __name__ == '__main__':
    main()
