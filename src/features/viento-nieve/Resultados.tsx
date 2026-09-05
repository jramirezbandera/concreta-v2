/**
 * Columna de resultados: lo que pone la norma con los datos de la izquierda,
 * una vista cada vez (la misma que enseña el lienzo). Arriba el estado del
 * cálculo y el número que importa; debajo, las tablas y los avisos.
 *
 * Las tablas de zonas son las que antes vivían en las tarjetas de Cubierta y
 * Paramentos: mismas columnas, mismos textos de dirección (`cuadros.ts`),
 * para que lo que se lee aquí sea lo que sale en el Excel y en la memoria.
 */

import { ValueRow } from '../../components/checks';
import { rotuloDireccionCubierta, rotuloParamentos, textoCpe } from '../../lib/acciones/cuadros';
import type { DireccionResuelta } from '../../lib/acciones/dosAguas';
import type { NieveResultado } from '../../lib/acciones/nieve';
import type { DireccionParamentos } from '../../lib/acciones/paramentos';
import type { DireccionViento } from '../../lib/acciones/viento';
import { toDisplay } from '../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { VistaLienzo } from './catalogos';
import { cotasPlantas, type Evaluacion, type VientoNieveState } from './state';
import { Arreglo, Aviso, CabeceraEstado, Errores, Grande, Grupo, Nota, Tabla, type Estado, type FilaTabla } from './resultadosUi';

const dec = (v: number, n: number) => v.toFixed(n).replace('.', ',');
const conSigno = (v: number, n: number) => (v > 0 ? `+${dec(v, n)}` : dec(v, n));

function frase(huecos: string[]): string {
  if (huecos.length <= 1) return huecos[0] ?? '';
  return `${huecos.slice(0, -1).join(', ')} y ${huecos[huecos.length - 1]}`;
}

const ORIGEN_SK: Record<NieveResultado['skOrigen'], string> = {
  'tabla3.8': 'tabla 3.8, capital',
  anejoE: 'tabla E.2',
  manual: 'valor propio',
};

interface Props {
  vista: VistaLienzo;
  state: VientoNieveState;
  evaluacion: Evaluacion;
  direccion: 'x' | 'y';
  plantaSel: string | null;
  faldonSel: string | null;
}

/** Estado del cálculo entero: publicado, con avisos o sin publicar (huecos o errores). */
function estadoGlobal(ev: Evaluacion): Estado {
  if (!ev.listo) return 'fail';
  return ev.avisos > 0 ? 'warn' : 'ok';
}

function useMostrar() {
  const { system } = useUnitSystem();
  const mostrar = (valor: number, q: Quantity) => dec(toDisplay(valor, q, system), getPrecision(q, system));
  return { mostrar, uF: getUnitLabel('force', system), uQ: getUnitLabel('areaLoad', system), uL: getUnitLabel('linearLoad', system) };
}

export function Resultados(props: Props) {
  return (
    <aside aria-label="Resultados" className="flex min-h-0 flex-col">
      {props.vista === 'edificio' && <ResultadosEdificio {...props} />}
      {props.vista === 'cubierta' && <ResultadosCubierta {...props} />}
      {props.vista === 'fachadas' && <ResultadosFachadas {...props} />}
      {props.vista === 'nieve' && <ResultadosNieve {...props} />}
    </aside>
  );
}

// ── Sin resultado ───────────────────────────────────────────────────────────

function ArregloHuecos() {
  return (
    <Arreglo>
      Elija la provincia en «Emplazamiento» (o fuerce la zona eólica) y teclee la altitud. Si la obra está en la capital, marque
      la casilla: la altitud se rellena sola y la nieve sale de la tabla 3.8.
    </Arreglo>
  );
}

function SinViento({ state, evaluacion }: { state: VientoNieveState; evaluacion: Evaluacion }) {
  const v = state.viento;
  const H = cotasPlantas(v.plantas).reduce((m, z) => Math.max(m, z), 0);
  if (!v.activo) {
    return (
      <>
        <Grupo label="El viento no entra en esta obra" />
        <Nota>Inclúyalo en Datos para calcular la fuerza por planta, la cubierta y las fachadas.</Nota>
      </>
    );
  }
  return (
    <>
      <CabeceraEstado estado="fail" kicker="Estado del cálculo" etiqueta="SIN RESULTADO">
        <div className="text-[15px] font-semibold text-state-fail">Falta {frase(evaluacion.huecos)}</div>
        <div className="mt-1 text-[12px] leading-snug text-text-secondary">Nada se publica ni se exporta hasta que se rellene.</div>
      </CabeceraEstado>
      <ArregloHuecos />
      <Grupo label="Lo que ya se sabe" />
      <ValueRow label="Lados en planta" value={`${dec(v.dimensiones.x, 2)} × ${dec(v.dimensiones.y, 2)} m`} />
      <ValueRow label="Plantas" value={`${v.plantas.length} · último forjado ${dec(H, 2)} m`} />
      <ValueRow label="Entorno" value={v.aspereza} />
      <ValueRow label="Superficie" value={v.superficie === 'rugosa' ? 'rugosa · cfr 0,02' : v.superficie === 'lisa' ? 'muy lisa · cfr 0,01' : 'muy rugosa · cfr 0,04'} />
      <Nota>Los coeficientes de exposición se podrían calcular ya, pero la presión dinámica qb depende de la zona eólica del mapa D.1.</Nota>
    </>
  );
}

// ── Edificio ────────────────────────────────────────────────────────────────

function ResultadosEdificio({ state, evaluacion, direccion, plantaSel }: Props) {
  const { mostrar, uF, uQ } = useMostrar();
  const v = evaluacion.viento;
  if (!v) return <SinViento state={state} evaluacion={evaluacion} />;

  const D = direccion.toUpperCase();
  const otra: 'x' | 'y' = direccion === 'x' ? 'y' : 'x';
  const estado = estadoGlobal(evaluacion);
  const filas: FilaTabla[] = v.x.plantas.map((px, i) => ({
    clave: px.id ?? `${i}`,
    seleccionada: px.id !== undefined && px.id === plantaSel,
    celdas: [px.nombre, dec(px.z, 2), dec(px.ce, 3), mostrar(px.F, 'force'), mostrar(v.y.plantas[i].F, 'force')],
  }));
  filas.push({ clave: 'total', total: true, celdas: ['Total', '', '', mostrar(v.x.Ftotal, 'force'), mostrar(v.y.Ftotal, 'force')] });

  const dir = (d: DireccionViento) => (
    <>
      <ValueRow label={`Según ${d.eje.toUpperCase()} · h/d`} value={`${dec(v.alturaEdificio, 2)} / ${dec(d.profundidad, 2)} = ${dec(d.esbeltez, 2)}`} />
      <ValueRow label="cp / cs" value={`${conSigno(d.cp, 2)} / ${dec(d.cs, 2)}`} dimmed />
      <ValueRow label="excentricidad" value={`${dec(d.excentricidad, 2)} m`} dimmed />
    </>
  );

  const encima = (d: DireccionViento) =>
    d.encima ? (
      <>
        <ValueRow label={`Según ${d.eje.toUpperCase()} · ${d.encima.tipo}`} value={`+${mostrar(d.encima.F, 'force')} ${uF} · ${dec(d.encima.area, 1)} m²`} />
        {d.encima.Fcontraria !== undefined && <ValueRow label="sentido contrario" value={`${mostrar(d.encima.Fcontraria, 'force')} ${uF}`} dimmed />}
      </>
    ) : null;
  const rozamiento = (d: DireccionViento) =>
    d.rozamiento ? (
      <ValueRow
        label={`Rozamiento según ${d.eje.toUpperCase()}`}
        value={`${mostrar(d.rozamiento.F, 'force')} ${uF} · ${dec(d.rozamiento.fraccion * 100, 0)} % · ${d.rozamiento.aplicado ? 'sumado' : 'despreciado'}`}
        dimmed
      />
    ) : null;

  return (
    <>
      <CabeceraEstado estado={estado} kicker={`Fuerza total · según ${D}`}>
        <Grande
          valor={mostrar(v[direccion].Ftotal, 'force')}
          unidad={uF}
          estado={estado}
          sub={
            <>
              según {otra.toUpperCase()} {mostrar(v[otra].Ftotal, 'force')} {uF} · va al programa de cálculo y al cuadro del plano
              {!evaluacion.listo && evaluacion.huecos.length > 0 && <div className="mt-1 text-state-fail">Falta {frase(evaluacion.huecos)}: no se publica ni se exporta hasta que se rellene.</div>}
            </>
          }
        />
      </CabeceraEstado>

      <Grupo label="Fuerzas por planta" right={uF} />
      <Tabla columnas={['Planta', 'z', 'ce', 'Fx', 'Fy']} filas={filas} />

      <Grupo label="Coeficientes" right="tabla 3.5" />
      <ValueRow label={`qb · zona ${evaluacion.zonas.zonaEolica ?? '—'}`} value={`${dec(v.qb, 2)} ${uQ}${v.vb !== null ? ` (vb ${v.vb} m/s)` : ' (adoptada)'}`} />
      <ValueRow label={`Entorno ${v.aspereza}`} value={`k ${dec(v.parametros.k, 2)} · L ${dec(v.parametros.L, 2)} m · Z ${v.parametros.Z} m`} />
      {dir(v[direccion])}
      {dir(v[otra])}

      {v.avisos.map((a) => (
        <Aviso key={a}>{a}</Aviso>
      ))}
      <Errores errores={v.errores} />

      {(v.x.encima || v.y.encima || v.x.rozamiento || v.y.rozamiento) && (
        <>
          <Grupo label="Sobre el último forjado y rozamiento" />
          {encima(v[direccion])}
          {encima(v[otra])}
          {rozamiento(v[direccion])}
          {rozamiento(v[otra])}
        </>
      )}
    </>
  );
}

// ── Cubierta ────────────────────────────────────────────────────────────────

function TablaCubierta({ d, cumbrera }: { d: DireccionResuelta; cumbrera: 'x' | 'y' }) {
  const { mostrar } = useMostrar();
  const valor = (s: number | null, p: number | null) => {
    if (s !== null && p !== null) return `${mostrar(s, 'areaLoad')} / +${mostrar(p, 'areaLoad')}`;
    if (p !== null) return `+${mostrar(p, 'areaLoad')}`;
    return s !== null ? mostrar(s, 'areaLoad') : '—';
  };
  return (
    <Tabla
      caption={`${rotuloDireccionCubierta(d, cumbrera)} · b ${dec(d.b, 0)} · d ${dec(d.d, 0)} · e ${dec(d.e, 1)} m`}
      columnas={['Zona', 'm²', 'cpe', 'kN/m²']}
      filas={d.zonas.map((z) => ({
        clave: z.zona,
        celdas: [
          <>
            {z.zona}
            {z.piezas > 1 && <span className="text-text-disabled"> ×{z.piezas}</span>}
          </>,
          dec(z.area, 1),
          textoCpe(z.cpe),
          valor(z.succion, z.presion),
        ],
      }))}
    />
  );
}

function ResultadosCubierta({ state, evaluacion }: Props) {
  const { mostrar, uQ, uF } = useMostrar();
  const v = evaluacion.viento;
  if (!v) return <SinViento state={state} evaluacion={evaluacion} />;
  const c = v.cubierta;
  if (!c) {
    return (
      <>
        <Grupo label="Cubierta plana u omitida" />
        <Nota>Incluya la cubierta a dos aguas en Datos para ver las zonas F…J de la tabla D.6 con sus presiones y succiones.</Nota>
      </>
    );
  }
  const zonas = [...c.perpendicular.zonas, ...c.paralela.zonas];
  const maxPresion = zonas.reduce((m, z) => Math.max(m, z.presion ?? 0), 0);
  const maxSuccion = zonas.reduce((m, z) => Math.min(m, z.succion ?? 0), 0);
  const estado = estadoGlobal(evaluacion);
  const r = c.perpendicular.resultante;

  return (
    <>
      <CabeceraEstado estado={estado} kicker="Presión máxima · cubierta">
        <Grande valor={`+${mostrar(maxPresion, 'areaLoad')}`} unidad={uQ} estado={estado} sub={`succión máxima ${mostrar(maxSuccion, 'areaLoad')} ${uQ} · a la coronación, ce ${dec(c.ce, 3)}`} />
      </CabeceraEstado>
      <TablaCubierta d={c.perpendicular} cumbrera={c.cumbrera} />
      <TablaCubierta d={c.paralela} cumbrera={c.cumbrera} />

      <Grupo label="De dónde sale" />
      <ValueRow label="Altura de coronación h" value={`${dec(c.alturaCoronacion, 2)} m`} />
      <ValueRow label={`ce(h) · grado ${v.aspereza}`} value={dec(c.ce, 3)} />
      <ValueRow label="qb · ce" value={`${mostrar(c.qe, 'areaLoad')} ${uQ}`} />
      <ValueRow label="Área de influencia" value={c.areaInfluencia === null ? 'la de cada zona' : `${dec(c.areaInfluencia, 1)} m²`} />
      {r && (
        <>
          <Grupo label="Resultante horizontal de los faldones" />
          <ValueRow label="Hacia sotavento" value={`+${mostrar(r.haciaSotavento, 'force')} ${uF}`} />
          <ValueRow label="Hacia barlovento" value={`${mostrar(r.haciaBarlovento, 'force')} ${uF}`} dimmed />
          <Nota>Σ cpe·A·tan α sobre cada cara entera; la de sotavento se suma a la planta de cubierta en la vista Edificio.</Nota>
        </>
      )}
      {c.avisos.map((a) => (
        <Aviso key={a}>{a}</Aviso>
      ))}
      <Errores errores={c.errores} />
    </>
  );
}

// ── Fachadas ────────────────────────────────────────────────────────────────

function TablaFachadas({ d }: { d: DireccionParamentos }) {
  const { mostrar } = useMostrar();
  return (
    <Tabla
      caption={`${rotuloParamentos(d)} · d ${dec(d.d, 0)} · b ${dec(d.b, 0)} m`}
      columnas={['Zona', 'Ancho', 'm²', 'cpe', 'kN/m²']}
      filas={d.zonas.map((z) => ({
        clave: z.zona,
        celdas: [
          <>
            {z.zona}
            {z.piezas > 1 && <span className="text-text-disabled"> ×{z.piezas}</span>}
          </>,
          dec(z.ancho, 2),
          dec(z.area, 0),
          conSigno(z.cpe, 2),
          z.presion > 0 ? `+${mostrar(z.presion, 'areaLoad')}` : mostrar(z.presion, 'areaLoad'),
        ],
      }))}
    />
  );
}

function ResultadosFachadas({ state, evaluacion }: Props) {
  const { mostrar, uQ } = useMostrar();
  const v = evaluacion.viento;
  if (!v) return <SinViento state={state} evaluacion={evaluacion} />;
  const p = v.paramentos;
  if (!p) {
    return (
      <>
        <Grupo label="Fachadas por zonas omitidas" />
        <Nota>Inclúyalas en Datos para ver las zonas A…E de la tabla D.3, las de carpinterías, aplacados y anclajes.</Nota>
      </>
    );
  }
  const zonas = [...p.x.zonas, ...p.y.zonas];
  const maxSuccion = zonas.reduce((m, z) => Math.min(m, z.presion), 0);
  const maxPresion = zonas.reduce((m, z) => Math.max(m, z.presion), 0);
  const estado = estadoGlobal(evaluacion);
  return (
    <>
      <CabeceraEstado estado={estado} kicker="Succión máxima · fachadas">
        <Grande valor={mostrar(maxSuccion, 'areaLoad')} unidad={uQ} estado={estado} sub={`zona A, desde la arista de barlovento · presión máxima +${mostrar(maxPresion, 'areaLoad')} ${uQ} en D`} />
      </CabeceraEstado>
      <TablaFachadas d={p.x} />
      <TablaFachadas d={p.y} />
      <Grupo label="De dónde sale" />
      <ValueRow label="h (coronación)" value={`${dec(p.h, 2)} m`} />
      <ValueRow label={`ce(h) · grado ${v.aspereza}`} value={dec(p.ce, 3)} />
      <ValueRow label="qb · ce" value={`${mostrar(p.qe, 'areaLoad')} ${uQ}`} />
      <ValueRow label="Altura de fachada para las áreas" value={`${dec(p.alturaFachada, 2)} m`} />
      <ValueRow label="Área de influencia" value={p.areaInfluencia === null ? 'la de cada zona' : `${dec(p.areaInfluencia, 1)} m²`} />
      {p.avisos.map((a) => (
        <Aviso key={a}>{a}</Aviso>
      ))}
      <Errores errores={p.errores} />
    </>
  );
}

// ── Nieve ───────────────────────────────────────────────────────────────────

function ResultadosNieve({ state, evaluacion, faldonSel }: Props) {
  const { mostrar, uQ, uL } = useMostrar();
  const n = evaluacion.nieve;
  if (!state.nieve.activo) {
    return (
      <>
        <Grupo label="La nieve no entra en esta obra" />
        <Nota>Inclúyala en Datos para calcular la carga por faldón.</Nota>
      </>
    );
  }
  if (!n) {
    return (
      <>
        <CabeceraEstado estado="fail" kicker="Estado del cálculo" etiqueta="SIN RESULTADO">
          <div className="text-[15px] font-semibold text-state-fail">Falta {frase(evaluacion.huecos)}</div>
          <div className="mt-1 text-[12px] leading-snug text-text-secondary">La nieve necesita la zona de clima invernal y la altitud de la obra.</div>
        </CabeceraEstado>
        <ArregloHuecos />
      </>
    );
  }
  const estado = estadoGlobal(evaluacion);
  const maximo = n.faldones.reduce((m, f) => Math.max(m, f.qn, f.limahoya?.qn ?? 0), 0);
  const conAcumulacion = n.faldones.filter((f) => f.acumulacion);
  const conHielo = n.faldones.filter((f) => f.hielo !== undefined);
  const zonaTexto = `${evaluacion.zonas.zonaInvernal ?? '—'}${evaluacion.zonas.provincia ? ` (${evaluacion.zonas.provincia.nombre})` : ''}`;

  return (
    <>
      <CabeceraEstado estado={estado} kicker="Carga de nieve máxima">
        <Grande
          valor={n.sk === null ? '—' : mostrar(maximo, 'areaLoad')}
          unidad={uQ}
          estado={estado}
          sub={conAcumulacion.length ? `más ${conAcumulacion.map((f) => `${mostrar(f.acumulacion!.pa, 'linearLoad')} ${uL}`).join(' y ')} acumulados en ${conAcumulacion[0].acumulacion!.ancho} m` : 'en proyección horizontal de la cubierta'}
        />
      </CabeceraEstado>

      <Grupo label="sk · sobrecarga sobre terreno horizontal" />
      <ValueRow label="Zona de clima invernal" value={zonaTexto} />
      <ValueRow label="Altitud" value={state.emplazamiento.altitud === null ? '—' : `${state.emplazamiento.altitud} m`} />
      <ValueRow label={`sk · ${ORIGEN_SK[n.skOrigen]}`} value={n.sk === null ? 'fuera de tabla' : `${mostrar(n.sk, 'areaLoad')} ${uQ}`} />
      <ValueRow
        label={`Exposición ${state.nieve.exposicion === 'normal' ? 'normal' : state.nieve.exposicion === 'protegida' ? 'protegida' : 'muy expuesta'}`}
        value={n.factorExposicion === 1 || n.skEfectiva === null ? `× ${dec(n.factorExposicion, 1)}` : `× ${dec(n.factorExposicion, 1)} → ${mostrar(n.skEfectiva, 'areaLoad')} ${uQ}`}
      />

      <Grupo label="Por faldón" right="μ · qn" />
      <Tabla
        columnas={['Faldón', 'α', 'μ', 'qn', 'asim.']}
        filas={n.faldones.map((f, i) => ({
          clave: f.id ?? `${i}`,
          seleccionada: f.id !== undefined && f.id === faldonSel,
          celdas: [f.nombre, `${dec(f.inclinacion, 0)}º`, dec(f.mu, 2), mostrar(f.qn, 'areaLoad'), mostrar(f.qnAsimetrica, 'areaLoad')],
        }))}
      />
      {n.faldones
        .filter((f) => f.limahoya)
        .map((f) => (
          <ValueRow key={`${f.id}-lima`} label={`${f.nombre} · banda de limahoya`} value={`μ ${dec(f.limahoya!.mu, 2)} · ${mostrar(f.limahoya!.qn, 'areaLoad')} ${uQ} en ${f.limahoya!.ancho} m`} dimmed />
        ))}

      {(conAcumulacion.length > 0 || conHielo.length > 0) && (
        <>
          <Grupo label="Descarga y acumulación" right="art. 3.5.4" />
          {conAcumulacion.map((f) => (
            <div key={`${f.id}-acum`}>
              <ValueRow label={`${f.nombre} · descarga pd`} value={`${mostrar(f.acumulacion!.pd, 'linearLoad')} ${uL}`} />
              <ValueRow label={`acumulación pa en ${f.acumulacion!.ancho} m`} value={`${mostrar(f.acumulacion!.pa, 'linearLoad')} ${uL}`} dimmed />
            </div>
          ))}
          {conHielo.map((f) => (
            <ValueRow key={`${f.id}-hielo`} label={`${f.nombre} · hielo en el voladizo`} value={`${mostrar(f.hielo!, 'linearLoad')} ${uL}`} />
          ))}
        </>
      )}

      {n.avisos.map((a) => (
        <Aviso key={a}>{a}</Aviso>
      ))}
      <Errores errores={n.errores} />
      {n.notas.map((t) => (
        <Nota key={t}>{t}</Nota>
      ))}
    </>
  );
}
