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

def _analyze(inputs_json, opts_json):
    inp = json.loads(inputs_json)
    opts = json.loads(opts_json)
    gC = float(opts.get('gammaC', 1.0)) or 1.0
    gPhi = float(opts.get('gammaPhi', 1.0)) or 1.0
    lf = float(opts.get('loadFactor', 1.0))
    slices = int(opts.get('slices', 25))
    iterations = int(opts.get('iterations', 1000))

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

    wt = inp.get('waterTableDepth')
    if wt is not None and float(wt) > 0:
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

    left = s.get_top_coordinates()[0] - 5
    right = s.get_bottom_coordinates()[0] + 5
    s.set_analysis_limits(left, right)
    s.update_analysis_options(slices=slices, iterations=iterations)
    s.analyse_slope()

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

    M = 48
    arc = [{'x': lx + (rx - lx) * i / M, 'y': arc_y(lx + (rx - lx) * i / M)} for i in range(M + 1)]

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
    })
`;
