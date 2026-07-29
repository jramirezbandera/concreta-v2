// PDF export del módulo FEM 2D (pórticos y cerchas).
// jsPDF — A4 retrato, márgenes 18 mm. Las figuras (modelo + diagramas N/V/M) se
// rasterizan con embedSvgAsImage desde los clones ocultos que monta el shell
// (mode='pdf'), como en taludes — un PNG lo abre cualquier visor.
//
// Trazabilidad (eng-review §9.2): versión del motor 2D + huella de los inputs
// (inputsFingerprint del estado paramétrico) en cabecera y en TODOS los footers.
// El botón PDF se gatea por `valid` (modelo resuelto sin fallos) antes de abrir
// el modal de título — nunca se exporta un modelo degenerado.
//
// Estructura:
//   1. Cabecera (título + fecha + motor + huella inputs) + línea normativa.
//   2. Figura del modelo (clon #fem2d-model-svg-pdf) + columna de parámetros.
//   3. Resultados globales (utilización máxima + veredicto + αcr).
//   4. Diagramas de esfuerzos N/V/M (clones #fem2d-{N,V,M}-svg-pdf).
//   5. Tabla resumen por barra (rol · η máx · estado).
//   6. Tabla de comprobaciones (una fila por check, paginada).
//   7. Disclaimer + footers en todas las páginas.

import jsPDF from 'jspdf';
import { STEEL_CATALOG } from '../frame-core/sections';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';
import {
  drawFootersAllPages,
  drawHeader,
  drawTable,
  embedSvgAsImage,
  ensureSpace,
  inputsFingerprint,
  PAGE_W,
  pdfStr,
  setGray,
  STATUS_LABEL,
  titledFilename,
  truncateToWidth,
  type PdfResult,
  type TableCol,
} from './utils';
import type { Fem2DAnalysisResult } from '../../features/fem2d/pipeline';
import type { MemberStatus, MemberVerdict2D } from '../../features/fem2d/checks';
import type { DisplayGroup2D, Fem2DMember, Fem2DModel } from '../../features/fem2d/types';

const M = 18;
const FEM2D_ENGINE = '1.0';

const TEMPLATE_NAME: Record<Fem2DModel['templateId'], string> = {
  'portal-frame': 'Pórtico simple',
  gable: 'Pórtico a dos aguas',
  multistory: 'Pórtico de plantas',
  'pratt-truss': 'Cercha Pratt',
  custom: 'Estructura personalizada',
};

const TEMPLATE_SLUG: Record<Fem2DModel['templateId'], string> = {
  'portal-frame': 'portico-simple',
  gable: 'portico-dos-aguas',
  multistory: 'portico-plantas',
  'pratt-truss': 'cercha-pratt',
  custom: 'estructura',
};

/** Agrupado de PRESENTACIÓN (Fase 2, paso 12): displayGroup de plantilla o el
 *  fallback pilar/viga por verticalidad. Ningún número del PDF depende de esto. */
const GROUP_LABEL: Record<DisplayGroup2D, string> = {
  pilar: 'Pilar',
  viga: 'Viga / dintel',
  cordon: 'Cordón',
  diagonal: 'Diagonal',
  montante: 'Montante',
};

const GROUP_ORDER: DisplayGroup2D[] = ['pilar', 'viga', 'cordon', 'diagonal', 'montante'];

/** tan(10°) — mismo fallback de presentación que checks.ts. */
const VERTICAL_TAN_DISPLAY = Math.tan((10 * Math.PI) / 180);

function displayGroupOf(m: Fem2DMember, nodeById: Map<string, { x: number; y: number }>): DisplayGroup2D {
  if (m.displayGroup) return m.displayGroup;
  const a = nodeById.get(m.i);
  const b = nodeById.get(m.j);
  return a && b && Math.abs(b.x - a.x) <= VERTICAL_TAN_DISPLAY * Math.abs(b.y - a.y) ? 'pilar' : 'viga';
}

const STATUS_TO_CHECK: Record<MemberStatus, 'ok' | 'warn' | 'fail' | 'neutral'> = {
  ok: 'ok', warn: 'warn', fail: 'fail', pending: 'neutral',
};

/** Nombre de archivo por defecto (título vacío). Compartido con el TitlePromptModal. */
export function fem2dFallbackFilename(templateId: Fem2DModel['templateId']): string {
  return `fem2d-${TEMPLATE_SLUG[templateId]}.pdf`;
}

// ── Descripción derivada del MODELO (columna derecha) ────────────────────────
//
// Con el editor libre los parámetros de plantilla ya no describen la realidad
// tras cualquier edición: la columna se deriva SIEMPRE del modelo (geometría,
// perfiles agrupados por rol, cargas agregadas por hipótesis). Válida para las
// plantillas intactas Y para 'custom'.

interface ParamSection {
  header: string;
  lines: string[];
}

function profileName(key: string): string {
  return STEEL_CATALOG[key]?.name ?? key;
}

const SUPPORT_LABEL: Record<string, string> = {
  pinned: 'articulado',
  fixed: 'empotrado',
  roller: 'deslizante',
};

const GROUP_PLURAL: Record<DisplayGroup2D, string> = {
  pilar: 'Pilares',
  viga: 'Vigas',
  cordon: 'Cordones',
  diagonal: 'Diagonales',
  montante: 'Montantes',
};

/** Longitud y cosenos directores de un miembro (0-safe). */
function memberGeom(m: Fem2DMember, nodeById: Map<string, { x: number; y: number }>) {
  const a = nodeById.get(m.i);
  const b = nodeById.get(m.j);
  if (!a || !b) return null;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L <= 0) return null;
  return { L, c: (b.x - a.x) / L, s: (b.y - a.y) / L };
}

export function describeModel(model: Fem2DModel, system: UnitSystem): ParamSection[] {
  const fmt = (v: number, q: Quantity) => formatQuantity(v, q, system);
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

  // GEOMETRIA: bounding + contadores + apoyos por tipo.
  const xs = model.nodes.map((n) => n.x);
  const ys = model.nodes.map((n) => n.y);
  const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  const supportCounts = new Map<string, number>();
  for (const s of model.supports) {
    supportCounts.set(s.type, (supportCounts.get(s.type) ?? 0) + 1);
  }
  const apoyos = [...supportCounts.entries()]
    .map(([t, n]) => `${n} ${SUPPORT_LABEL[t] ?? t}${n === 1 ? '' : 's'}`)
    .join(', ');
  const geometria: ParamSection = {
    header: 'GEOMETRIA',
    lines: [
      `${model.nodes.length} nudos · ${model.members.length} barras`,
      `Envolvente ${width.toFixed(1)} × ${height.toFixed(1)} m`,
      `Apoyos: ${apoyos || 'sin apoyos'}`,
    ],
  };

  // PERFILES: agrupados por grupo de presentación → perfiles/acero o secciones HA en uso.
  const byGroup = new Map<DisplayGroup2D, Set<string>>();
  for (const m of model.members) {
    const desc = m.material === 'rc' && m.rcSection
      ? `${m.rcSection.b}×${m.rcSection.h} cm HA-${m.rcSection.fck}`
      : m.material === 'timber' && m.timberSection
        ? `${m.timberSection.gradeId} ${m.timberSection.b}×${m.timberSection.h} mm`
        : m.material === 'steel' && m.steelSelection
          ? `${profileName(m.steelSelection.profileKey)} ${m.steelSelection.steel}`
          : m.material === 'timber' ? 'madera' : 'HA';
    const g = displayGroupOf(m, nodeById);
    const set = byGroup.get(g) ?? new Set<string>();
    set.add(desc);
    byGroup.set(g, set);
  }
  const perfiles: ParamSection = {
    header: 'PERFILES',
    lines: GROUP_ORDER.filter((r) => byGroup.has(r)).map(
      (r) => `${GROUP_PLURAL[r]}: ${[...byGroup.get(r)!].join(' / ')}`,
    ),
  };

  // CARGAS: agregadas por hipótesis — nº de cargas + resultante mundo (ΣFx, ΣFy).
  // UDL en marco local se pasa a mundo con los cosenos del miembro; las UDL
  // integran w·L (con extensión parcial si from/to).
  const perLc = new Map<string, { n: number; Fx: number; Fy: number }>();
  const bump = (lc: string, fx: number, fy: number) => {
    const e = perLc.get(lc) ?? { n: 0, Fx: 0, Fy: 0 };
    e.n += 1;
    e.Fx += fx;
    e.Fy += fy;
    perLc.set(lc, e);
  };
  const memberById = new Map(model.members.map((m) => [m.id, m]));
  for (const ld of model.loads) {
    if (ld.kind === 'node') {
      bump(ld.lc, ld.Fx, ld.Fy);
      continue;
    }
    const m = memberById.get(ld.member);
    const g = m ? memberGeom(m, nodeById) : null;
    if (!g) continue;
    if (ld.kind === 'udl') {
      const span = ((ld.to ?? 1) - (ld.from ?? 0)) * g.L;
      const [wx, wy] = ld.frame === 'local'
        ? [ld.wx * g.c - ld.wy * g.s, ld.wx * g.s + ld.wy * g.c]
        : [ld.wx, ld.wy];
      bump(ld.lc, wx * span, wy * span);
    } else {
      const [fx, fy] = ld.frame === 'local'
        ? [ld.Fx * g.c - ld.Fy * g.s, ld.Fx * g.s + ld.Fy * g.c]
        : [ld.Fx, ld.Fy];
      bump(ld.lc, fx, fy);
    }
  }
  const LC_ORDER = ['G', 'Q', 'W', 'S', 'E'];
  const cargas: ParamSection = {
    header: 'CARGAS',
    lines: LC_ORDER.filter((lc) => perLc.has(lc)).map((lc) => {
      const e = perLc.get(lc)!;
      const parts: string[] = [];
      if (Math.abs(e.Fx) > 1e-9) parts.push(`SumFx = ${fmt(e.Fx, 'force')}`);
      if (Math.abs(e.Fy) > 1e-9) parts.push(`SumFy = ${fmt(e.Fy, 'force')}`);
      return `${lc}: ${e.n} carga${e.n === 1 ? '' : 's'}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
    }),
  };
  if (cargas.lines.length === 0) cargas.lines.push('Sin cargas aplicadas');

  return [
    geometria,
    perfiles,
    cargas,
    { header: 'OPCIONES', lines: [`Peso propio: ${model.selfWeight ? 'incluido' : 'omitido'}`] },
  ];
}

// ── Embed de una figura desde su clon oculto (mode='pdf') ────────────────────

async function embedFigure(
  doc: jsPDF,
  id: string,
  box: { x: number; y: number; width: number; height: number },
): Promise<boolean> {
  const container = document.getElementById(id);
  const svg = container ? (container.querySelector('svg') as SVGSVGElement | null) : null;
  if (!svg) return false;
  return embedSvgAsImage(doc, svg, box);
}

// ── Tablas de comprobaciones ─────────────────────────────────────────────────

interface SummaryRow { barra: string; rol: string; eta: string; estado: string }
interface CheckRow2D { barra: string; comprobacion: string; valor: string; art: string; eta: string }

function orderedVerdicts(model: Fem2DModel, result: Fem2DAnalysisResult): MemberVerdict2D[] {
  const byGroup = new Map<DisplayGroup2D, MemberVerdict2D[]>();
  for (const m of model.members) {
    const v = result.checks?.perMember[m.id];
    if (!v) continue;
    const arr = byGroup.get(v.group) ?? [];
    arr.push(v);
    byGroup.set(v.group, arr);
  }
  const out: MemberVerdict2D[] = [];
  for (const group of GROUP_ORDER) out.push(...(byGroup.get(group) ?? []));
  return out;
}

function etaStr(v: MemberVerdict2D): string {
  if (v.status === 'pending') return '—';
  return v.eta <= 1 ? `${(v.eta * 100).toFixed(0)}%` : `${(v.eta * 100).toFixed(0)}% !`;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportFem2DPDF(
  model: Fem2DModel,
  result: Fem2DAnalysisResult,
  system: UnitSystem = 'si',
  title?: string,
): Promise<PdfResult> {
  const elementTitle = title ?? '';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const checks = result.checks!;

  // ── Cabecera + línea normativa ────────────────────────────────────────────
  const { contentY } = drawHeader(
    doc,
    {
      title: 'Concreta - FEM 2D (porticos y cerchas)',
      elementTitle,
      engineVersion: FEM2D_ENGINE,
      // La huella es del MODELO (lo que realmente se calculó) — con el editor
      // libre los parámetros de plantilla ya no determinan el resultado.
      inputsHash: inputsFingerprint(model),
    },
    M,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setGray(doc, 110);
  // Compacta a propósito: con "Estructura personalizada" la versión larga
  // rebasaba el margen derecho (lo cazó pdfLayout). truncateToWidth de red
  // por si un nombre futuro vuelve a crecer.
  doc.text(
    truncateToWidth(
      doc,
      pdfStr(
        `${TEMPLATE_NAME[model.templateId]}  ·  CE Anejo 22 · CTE DB-SE-AE · ` +
          `combinaciones multi-principal (Tabla 4.2) · 2o orden simplificado (alpha_cr)`,
      ),
      PAGE_W - 2 * M,
    ),
    M,
    contentY,
  );

  // ── Figura del modelo + columna de parámetros ──────────────────────────────
  const FIG_Y = contentY + 4;
  const FIG_W = 116;
  const FIG_H = 76;
  await embedFigure(doc, 'fem2d-model-svg-pdf', { x: M, y: FIG_Y, width: FIG_W, height: FIG_H });

  const COL_R = M + FIG_W + 6;
  const LH = 4.4;
  let ry = FIG_Y + 2;
  for (const sec of describeModel(model, system)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(sec.header, COL_R, ry);
    ry += LH;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 80);
    for (const l of sec.lines) {
      doc.text(pdfStr(l), COL_R, ry);
      ry += LH;
    }
    ry += 1.5;
  }

  // ── Resultados globales ────────────────────────────────────────────────────
  let by = Math.max(FIG_Y + FIG_H + 6, ry + 2);
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, by - 2, PAGE_W - M, by - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('RESULTADOS', M, by + 3);
  const globalStatus = STATUS_TO_CHECK[checks.status];
  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[globalStatus], PAGE_W - M, by + 3, { align: 'right' });
  by += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setGray(doc, 70);
  const maxPct = checks.status === 'pending' ? '—' : `${(checks.maxEta * 100).toFixed(0)}%`;
  doc.text(pdfStr(`Utilizacion maxima = ${maxPct}`), M, by);
  doc.text(pdfStr(`${model.members.length} barras · ${model.nodes.length} nudos`), M + 80, by);
  by += LH;
  // αcr on its OWN line (a long "amplificado" suffix must never reach the right
  // margin). Absent for trusses (no sway storeys → alphaCr null).
  if (checks.alphaCr !== null) {
    const a = checks.alphaCr;
    const aStr = a === Infinity ? 'inf' : a.toFixed(1);
    const secondOrder = [
      ...(checks.amplified ? ['efectos de 2o orden amplificados'] : []),
      ...(checks.notionalApplied ? ['imperfeccion de desplome H = phi·V incluida (§5.3.2)'] : []),
    ];
    doc.text(
      pdfStr(`Estabilidad al desplome: alpha_cr = ${aStr}${secondOrder.length > 0 ? ` (${secondOrder.join('; ')})` : ''}`),
      M,
      by,
    );
    by += LH;
  }
  by += 2;

  // ── Diagramas de esfuerzos N/V/M ───────────────────────────────────────────
  const DIAG_W = 54;
  const DIAG_H = 40;
  by = ensureSpace(doc, by, DIAG_H + 14, M);
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, by - 2, PAGE_W - M, by - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text('DIAGRAMAS DE ESFUERZOS (envolvente ELU)', M, by + 3);
  by += 6;
  const diagLabels: Array<{ id: string; label: string }> = [
    { id: 'fem2d-N-svg-pdf', label: 'Axil N' },
    { id: 'fem2d-V-svg-pdf', label: 'Cortante V' },
    { id: 'fem2d-M-svg-pdf', label: 'Momento M' },
  ];
  for (let i = 0; i < diagLabels.length; i++) {
    const x = M + i * (DIAG_W + 4);
    await embedFigure(doc, diagLabels[i].id, { x, y: by, width: DIAG_W, height: DIAG_H });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 110);
    doc.text(pdfStr(diagLabels[i].label), x + DIAG_W / 2, by + DIAG_H + 3.5, { align: 'center' });
  }
  by += DIAG_H + 8;

  const verdicts = orderedVerdicts(model, result);

  // ── Tabla resumen por barra ────────────────────────────────────────────────
  by += 2;
  by = ensureSpace(doc, by, 14, M);
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, by - 2, PAGE_W - M, by - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('RESUMEN POR BARRA', M, by + 3);
  by += 8;

  const summaryCols: TableCol<SummaryRow>[] = [
    { key: 'barra', label: 'Barra', w: 30 },
    { key: 'rol', label: 'Grupo', w: 42 },
    { key: 'eta', label: 'Ut. max', w: 26, align: 'right' },
    { key: 'estado', label: 'Estado', w: 32, align: 'right' },
  ];
  by = drawTable(doc, {
    x: M,
    y: by,
    M,
    cols: summaryCols,
    rows: verdicts.map((v) => ({
      barra: v.memberId,
      rol: GROUP_LABEL[v.group],
      eta: etaStr(v),
      estado: STATUS_LABEL[STATUS_TO_CHECK[v.status]],
    })),
  });

  // ── Tabla de geometría: nudos (id · x · y · apoyo) ─────────────────────────
  // Con el editor libre las coordenadas ya no se derivan de una plantilla: el
  // PDF debe documentar la geometría real calculada (≤60 filas, drawTable pagina).
  by += 4;
  by = ensureSpace(doc, by, 14, M);
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, by - 2, PAGE_W - M, by - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text(pdfStr('GEOMETRIA — NUDOS'), M, by + 3);
  by += 8;

  const supportByNode = new Map(model.supports.map((s) => [s.node, s.type]));
  interface NodeRow { id: string; x: string; y: string; apoyo: string }
  const nodeCols: TableCol<NodeRow>[] = [
    { key: 'id', label: 'Nudo', w: 24 },
    { key: 'x', label: 'x (m)', w: 28, align: 'right' },
    { key: 'y', label: 'y (m)', w: 28, align: 'right' },
    { key: 'apoyo', label: 'Apoyo', w: 40 },
  ];
  by = drawTable(doc, {
    x: M,
    y: by,
    M,
    cols: nodeCols,
    rows: model.nodes.map((n) => ({
      id: n.id,
      x: n.x.toFixed(2),
      y: n.y.toFixed(2),
      apoyo: SUPPORT_LABEL[supportByNode.get(n.id) ?? ''] ?? '—',
    })),
  });

  // ── Tabla de comprobaciones (una fila por check) ───────────────────────────
  by += 4;
  by = ensureSpace(doc, by, 14, M);
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, by - 2, PAGE_W - M, by - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('COMPROBACIONES', M, by + 3);
  by += 8;

  const checkRows: CheckRow2D[] = [];
  for (const v of verdicts) {
    v.checks.forEach((c, i) => {
      checkRows.push({
        barra: i === 0 ? v.memberId : '',
        comprobacion: c.name,
        valor: c.val,
        art: c.ref,
        eta: v.status === 'pending' ? '—' : c.eta > 0 || c.ref ? `${(c.eta * 100).toFixed(0)}%` : '',
      });
    });
  }
  // Los nombres/valores/artículos llegan de los motores de acero (longitudes
  // impredecibles: p.ej. "CTE DB-SE-A §6.2.8 — Interacción cortante y flexión").
  // En una tabla de ancho fijo hay que TRUNCAR por ancho medido, o el texto se
  // sale del margen (lo caza pdfLayout). truncateToWidth mide bajo la fuente
  // activa (drawTable pinta estas celdas en normal 7.5).
  const clip = (s: string, w: number) => truncateToWidth(doc, pdfStr(s), w - 2.5);
  const checkCols: TableCol<CheckRow2D>[] = [
    { key: 'barra', label: 'Barra', w: 18, bold: (r) => r.barra !== '' },
    { key: 'comprobacion', label: 'Comprobacion', w: 54, render: (r) => clip(r.comprobacion, 54) },
    { key: 'valor', label: 'Valor', w: 50, render: (r) => clip(r.valor, 50) },
    { key: 'art', label: 'Articulo', w: 34, render: (r) => clip(r.art, 34) },
    { key: 'eta', label: 'Ut%', w: 14, align: 'right' },
  ];
  by = drawTable(doc, { x: M, y: by, M, cols: checkCols, rows: checkRows });

  // ── Disclaimer + footers ───────────────────────────────────────────────────
  by += 4;
  by = ensureSpace(doc, by, 14, M);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  setGray(doc, 120);
  doc.text(
    pdfStr(
      'Predimensionamiento — analisis lineal de portico (rigidez directa, 3 GDL) con ' +
        'combinaciones CTE multi-principal y 2o orden simplificado por alpha_cr. Vigas HA: flexion ' +
        'compuesta M+N por fibras, flecha diferida fisurada (zeta 7.4.3, phi_ef=2) y cortante; pilares ' +
        'con cortante (HA con sigma_cp / acero Vpl). Quedan fuera de v1: la interaccion completa M+N en ' +
        'esquina de portico (acero), el 2o orden de vigas HA esbeltas (lambda > lambda_lim => pendiente) ' +
        'y el pandeo fuera del plano. No sustituye un calculo estructural completo.',
    ),
    M,
    by,
    { maxWidth: PAGE_W - 2 * M },
  );

  drawFootersAllPages(doc, { engineVersion: FEM2D_ENGINE }, M);

  const filename = titledFilename(elementTitle, fem2dFallbackFilename(model.templateId));
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = doc.getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
