// Fuente Python del análisis de taludes — compartida por el Web Worker (navegador)
// y el golden test del motor (node). Define `_analyze(inputs_json, opts_json)`:
// mapea SlopeInputs → PySlope, corre Bishop y devuelve SlopeRun como JSON con la
// GEOMETRÍA REAL de la corrida (círculo + dovelas exactas + perfil del terreno),
// sin reconstruir nada en JS (defensibilidad legal, §9.4 #8 / §11.3).
//
// Minoración por-check (§9.2 #5): c'/gammaC, atan(tanφ'/gammaPhi); cargas
// ×loadFactor (EC7-DA3 = c'/1,25, φ'/1,25, Q×1,3).

export const ANALYZE_PY = `
import json, math
from pyslope import Slope, Material, Udl, LineLoad

def _clears_rigid_block(plane, x0, x1, y_base):
    """True si la SUPERFICIE DE ROTURA pasa BAJO y_base en todo el tramo en que
    cruza la huella [x0, x1] — es decir, no invade el bloque rigido (el muro).

    Ojo con el dominio: la superficie de rotura NO es el circulo entero, solo el
    arco entre su punto de entrada (l_c) y el de salida (r_c). Fuera de ese
    tramo el circulo va por encima del terreno y no significa nada; evaluarlo
    ahi da falsos positivos (puntos por encima de la coronacion) y falsos
    negativos (con una huella mas ancha que el circulo, ninguna abscisa de la
    huella lo alcanza y el plano se colaba sin filtrar).

    Se evalua por tanto sobre la INTERSECCION de la huella con [l_c.x, r_c.x].
    El arco inferior y(x) = c_y - sqrt(r^2 - (x-c_x)^2) es convexo hacia abajo:
    su MAXIMO sobre un intervalo cae siempre en un extremo, asi que bastan dos
    evaluaciones (exacto, no muestreo).
    """
    cx = plane['c_x']; cy = plane['c_y']; r = plane['radius']
    a = max(x0, plane['l_c'][0])
    b = min(x1, plane['r_c'][0])
    if a > b:
        return True          # el arco no llega a cruzar la huella
    for x in (a, b):
        d = r * r - (x - cx) ** 2
        if d <= 0:
            continue
        if cy - math.sqrt(d) > y_base:
            return False
    return True

def _analyze(inputs_json, opts_json):
    inp = json.loads(inputs_json)
    opts = json.loads(opts_json)
    gC = float(opts.get('gammaC', 1.0)) or 1.0
    gPhi = float(opts.get('gammaPhi', 1.0)) or 1.0
    lf = float(opts.get('loadFactor', 1.0))
    slices = int(opts.get('slices', 25))
    iterations = int(opts.get('iterations', 1000))
    # Método de dovelas: el alias Concreta 'fellenius' → 'ordinary' (nombre interno
    # de PySlope). 'bishop' (default) deja el camino de Bishop intacto.
    method = 'ordinary' if inp.get('method') == 'fellenius' else 'bishop'

    s = Slope(height=float(inp['height']), angle=float(inp['angle']), length=None)

    # Estratos → Material (depth_to_bottom = espesor acumulado desde coronación).
    cum = 0.0
    mats = []
    for st in inp['strata']:
        cum += float(st['thickness'])
        c = float(st['c']) / gC
        phi = math.degrees(math.atan(math.tan(math.radians(float(st['phi']))) / gPhi))
        mats.append(Material(unit_weight=float(st['gamma']), friction_angle=phi,
                             cohesion=c, depth_to_bottom=cum))
    s.set_materials(*mats)

    # NF >= 0: la cota 0 (NF en coronación, talud saturado — el caso pésimo) es
    # válida para PySlope y NO debe caer al análisis seco. Solo None/negativo
    # (gateado por validate.ts) omiten el nivel freático.
    wt = inp.get('waterTableDepth')
    if wt is not None and float(wt) >= 0:
        s.set_water_table(float(wt))

    udls, lls = [], []
    for ld in inp.get('loads', []):
        mag = float(ld['magnitude']) * lf
        if ld.get('kind') == 'udl':
            length = float(ld.get('length') or 0)
            udls.append(Udl(magnitude=mag, offset=float(ld.get('offset', 0)), length=length))
        else:
            lls.append(LineLoad(magnitude=mag, offset=float(ld.get('offset', 0))))
    if udls:
        s.set_udls(*udls)
    if lls:
        s.set_lls(*lls)

    # Límites clampeados al modelo: en taludes pequeños (H<~3 m) la coronación
    # puede quedar a <5 m del borde y top_x-5 sale negativo — set_analysis_limits
    # VALIDA antes de clampear y lanzaba ValueError. El clamp de right espeja el
    # interno de PySlope (min con external_length) para que el JSON emitido
    # coincida con los límites realmente usados en la búsqueda.
    left = max(0.0, s.get_top_coordinates()[0] - 5)
    right = min(float(s._external_length), s.get_bottom_coordinates()[0] + 5)
    s.set_analysis_limits(left, right)
    s.update_analysis_options(slices=slices, iterations=iterations)

    # Bloque rigido: excluye del dominio de rotura la huella de un muro que ya
    # ha superado sus comprobaciones internas y de conjunto. Se apoya en la rama
    # _individual_planes de analyse_slope (pyslope.py:1236-1242): si la lista no
    # esta vacia, PySlope la usa TAL CUAL y se salta _set_entry_exit_planes().
    # Asi el filtro vive aqui, en codigo nuestro, sin parchear el vendor (el
    # patchHash del manifest no cambia y los golden tests siguen validos).
    #
    # Va DESPUES de set_materials/set_udls/set_lls: esos re-ejecutan
    # set_external_boundary -> remove_analysis_limits() y desplazan top_x /
    # external_length, asi que las coordenadas hay que leerlas aqui.
    blk = inp.get('rigidBlock')
    kept_n = None
    total_n = None
    block_out = None
    if blk:
        top_c = s.get_top_coordinates(); bot_c = s.get_bottom_coordinates()
        top_x = float(top_c[0]); top_y = float(top_c[1]); bot_x = float(bot_c[0])
        ext_l = float(s._external_length)
        bx0 = max(0.0, top_x - float(blk['padHeel']))
        bx1 = min(ext_l, bot_x + float(blk['padToe']))
        by = top_y - float(blk['depth'])
        s._set_entry_exit_planes()
        planes = list(s._search)
        total_n = len(planes)
        kept = [p for p in planes if _clears_rigid_block(p, bx0, bx1, by)]
        kept_n = len(kept)
        if not kept:
            # get_min_FOS hace self._search[0] (pyslope.py:2219) -> IndexError.
            # Cortamos antes con un mensaje accionable; slope.ts lo envuelve y
            # useSlopeSolver ya pinta el estado de error.
            raise ValueError(
                'No se encontro ninguna superficie de rotura admisible por debajo '
                'del muro. Revisa la geometria o aumenta el numero de iteraciones.'
            )
        s._individual_planes = kept
        block_out = {'x0': bx0, 'x1': bx1, 'yBase': by}

    s.analyse_slope(method=method)

    fos = float(s.get_min_FOS())
    cx, cy, r = (float(v) for v in s.get_min_FOS_circle())
    (lx, ly), (rx, ry) = ([float(c) for c in p] for p in s.get_min_FOS_end_points())

    top = s.get_top_coordinates(); bot = s.get_bottom_coordinates()
    ext_len = float(s._external_length)
    ground = [
        {'x': 0.0, 'y': float(top[1])},
        {'x': float(top[0]), 'y': float(top[1])},
        {'x': float(bot[0]), 'y': float(bot[1])},
        {'x': ext_len, 'y': float(bot[1])},
    ]

    # Dovelas: geometría EXACTA (cx,cy,r) + perfil del terreno + nº de dovelas.
    def arc_y(x):
        d = r * r - (x - cx) ** 2
        return cy - math.sqrt(d) if d > 0 else cy
    width = (rx - lx) / slices if slices else 0
    sl = []
    for i in range(slices):
        xl = lx + i * width
        xr = xl + width
        xc = (xl + xr) / 2
        yt = s.get_external_y_intersection(xc)
        sl.append({'x': xc, 'xL': xl, 'xR': xr,
                   'yTop': float(yt) if yt is not None else float(cy),
                   'yBase': arc_y(xc)})

    # Física por dovela del círculo crítico (fork T1.1): arrays paralelos
    # {x, width, alpha(rad), weight(kN), u(kPa), cohesion(kPa), tan_phi}. Se
    # mapean sobre las dovelas geométricas ya emitidas SIN tocar su geometría.
    # Defensivo: si el fork aún no expone get_critical_slice_data, se omite la
    # física (las dovelas quedan solo-geometría) y la corrida sigue válida.
    def _flist(d, key):
        v = d.get(key)
        if v is None:
            return None
        try:
            return [float(x) for x in v]
        except (TypeError, ValueError):
            return None

    if hasattr(s, 'get_critical_slice_data'):
        try:
            phys = s.get_critical_slice_data()
            if hasattr(phys, 'to_py'):
                phys = phys.to_py()
            alpha = _flist(phys, 'alpha')
            weight = _flist(phys, 'weight')
            u = _flist(phys, 'u')
            # Mapeo posicional: el array i-ésimo del círculo crítico corresponde
            # a la dovela i-ésima. Solo se rellena lo que exista y cuadre en nº.
            for i, sd in enumerate(sl):
                if alpha is not None and i < len(alpha):
                    sd['alpha'] = alpha[i]
                if weight is not None and i < len(weight):
                    sd['weight'] = weight[i]
                if u is not None and i < len(u):
                    sd['u'] = u[i]
        except Exception:
            # Cualquier fallo del fork no debe tumbar la geometría/contrato base.
            pass

    M = 48
    arc = [{'x': lx + (rx - lx) * i / M, 'y': arc_y(lx + (rx - lx) * i / M)} for i in range(M + 1)]

    # searchCircles (sin fork): todos los círculos de prueba con su FoS, para la
    # vista 2 (malla de centros / mapa de FoS, §10.8). s._search es una lista de
    # dicts {l_c,r_c,c_x,c_y,radius,FOS} (ya ordenada por FoS ascendente). Se
    # descartan los FoS no finitos (None/inf/NaN) que no quedaron filtrados.
    search_circles = []
    for sc in getattr(s, '_search', []) or []:
        try:
            f = sc.get('FOS')
            if f is None:
                continue
            f = float(f)
            if not math.isfinite(f):
                continue
            search_circles.append({
                'cx': float(sc['c_x']),
                'cy': float(sc['c_y']),
                'r': float(sc['radius']),
                'fos': f,
            })
        except (TypeError, ValueError, KeyError):
            continue

    return json.dumps({
        'fos': fos,
        'circle': {'cx': cx, 'cy': cy, 'r': r},
        'entry': {'x': lx, 'y': ly},
        'exit': {'x': rx, 'y': ry},
        'slices': sl,
        'failureProfile': arc,
        'groundProfile': ground,
        'limits': {'left': float(left), 'right': float(right)},
        'slicesN': slices,
        'method': inp.get('method', 'bishop'),
        'searchCircles': search_circles,
        # Diagnostico del bloque rigido: la huella excluida (para pintarla) y
        # cuantos circulos sobrevivieron al filtro. Si quedan pocos, la malla
        # efectiva es pobre y el FoS es menos fiable — que se vea, no que pase
        # en silencio.
        'rigidBlock': block_out,
        'keptCircles': kept_n,
        'totalCircles': total_n,
    })
`;
