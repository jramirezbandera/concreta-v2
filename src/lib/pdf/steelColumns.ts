// PDF export for Steel Columns module
// Uses jsPDF + svg2pdf.js to render the hidden off-screen SVG clone.
// Page: A4 portrait, margins 20mm, grayscale.
//
// jsPDF built-in fonts (Helvetica) cover latin-1 only.
// Greek letters (λ, χ, β) and special chars must be substituted with ASCII.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type SteelColumnInputs, type ColumnBCType } from '../../data/defaults';
import { type SteelColumnResult, type SteelCheckStatus } from '../calculations/steelColumns';

const PAGE_W = 210;
const PAGE_H = 297;
const M      = 20;

type DisplayStatus = Exclude<SteelCheckStatus, 'neutral'>;

const STATUS_LABEL: Record<DisplayStatus, string> = {
  ok:   'CUMPLE',
  warn: 'ADVERTENCIA',
  fail: 'INCUMPLE',
};

function setGray(doc: jsPDF, g: number) {
  doc.setTextColor(g, g, g);
  doc.setDrawColor(g, g, g);
}

function pdfStr(s: string): string {
  return s
    .replace(/λ/g, 'lam')
    .replace(/χ/g, 'chi')
    .replace(/β/g, 'beta')
    .replace(/[^\x00-\xFF]/g, '?');
}

function fmt(v: number, d = 1): string {
  return v.toFixed(d);
}

const BC_LABEL: Record<ColumnBCType, string> = {
  pp:     'Art.-Art. (beta=1.0)',
  pf:     'Art.-Emp. (beta=0.7)',
  ff:     'Emp.-Emp. (beta=0.5)',
  fc:     'Emp.-Libre (beta=2.0)',
  custom: 'Personalizado',
};

export async function exportSteelColumnsPDF(
  inp: SteelColumnInputs,
  result: SteelColumnResult,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const cw = PAGE_W - 2 * M;
  let y = M;

  // ── Header ────────────────────────────────────────────────────────────────
  setGray(doc, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('concreta', M, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 80);
  const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text(dateStr, PAGE_W - M, y, { align: 'right' });

  y += 5;
  setGray(doc, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Pilares — Acero', M, y);

  y += 4;
  setGray(doc, 100);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('CE DB-SE-A — Codigo Estructural  |  EC3 §6.3', M, y);

  y += 2;
  setGray(doc, 200);
  doc.line(M, y, PAGE_W - M, y);
  y += 5;

  // ── Inputs table ─────────────────────────────────────────────────────────
  setGray(doc, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('DATOS DE ENTRADA', M, y);
  y += 4;

  const inputRows: [string, string][] = [
    ['Perfil',       `${inp.sectionType} ${inp.size}`],
    ['Acero',        inp.steel],
    ['Ly (eje fuerte)', `${fmt(inp.Ly / 1000, 2)} m`],
    ['Lz (eje debil)',  `${fmt(inp.Lz / 1000, 2)} m`],
    ['Cond. apoyo',  BC_LABEL[inp.bcType]],
    ['betay',        inp.beta_y.toFixed(2)],
    ['betaz',        inp.beta_z.toFixed(2)],
    ['Lky',          `${fmt(inp.beta_y * inp.Ly / 1000, 2)} m`],
    ['Lkz',          `${fmt(inp.beta_z * inp.Lz / 1000, 2)} m`],
    ['NEd',          `${fmt(inp.Ned, 1)} kN`],
    ['My,Ed',        `${fmt(inp.My_Ed, 1)} kNm`],
    ['Mz,Ed',        `${fmt(inp.Mz_Ed, 1)} kNm`],
  ];

  doc.setFontSize(8);
  for (const [label, value] of inputRows) {
    setGray(doc, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(pdfStr(label), M, y);
    setGray(doc, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(pdfStr(value), M + 50, y);
    y += 5;
  }

  y += 2;
  setGray(doc, 200);
  doc.line(M, y, PAGE_W - M, y);
  y += 5;

  // ── SVG block ─────────────────────────────────────────────────────────────
  const svgEl = document.getElementById('steel-columns-svg-pdf') as SVGElement | null;
  if (svgEl) {
    const svgW = 380;
    const svgH = 200;
    const scale = cw / svgW;
    const rendH = svgH * scale;
    if (y + rendH < PAGE_H - M) {
      await svg2pdf(svgEl, doc, { x: M, y, width: cw, height: rendH });
      y += rendH + 5;
    }
  }

  setGray(doc, 200);
  doc.line(M, y, PAGE_W - M, y);
  y += 5;

  // ── Results table ─────────────────────────────────────────────────────────
  setGray(doc, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VERIFICACIONES', M, y);
  y += 4;

  doc.setFontSize(8);
  for (const c of result.checks) {
    if (y > PAGE_H - M - 5) {
      doc.addPage();
      y = M;
    }

    if (c.neutral) {
      setGray(doc, 80);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfStr(c.description), M, y);
      setGray(doc, 120);
      doc.text(pdfStr(c.tag ?? '—'), PAGE_W - M, y, { align: 'right' });
    } else {
      const status = c.status as DisplayStatus;
      setGray(doc, 60);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfStr(c.description), M, y);

      setGray(doc, 0);
      doc.setFont('helvetica', 'bold');
      const pct = Math.min(c.utilization * 100, 100);
      const tag = c.utilization <= 1
        ? `${pct.toFixed(0)}%  ${STATUS_LABEL[status]}`
        : STATUS_LABEL[status];
      doc.text(pdfStr(tag), PAGE_W - M, y, { align: 'right' });

      // Progress bar
      const barW = 40;
      const barH = 1.5;
      const barX = PAGE_W - M - barW - 22;
      setGray(doc, 200);
      doc.rect(barX, y - 3, barW, barH, 'F');
      setGray(doc, status === 'ok' ? 80 : status === 'warn' ? 120 : 0);
      doc.rect(barX, y - 3, barW * Math.min(c.utilization, 1), barH, 'F');
    }
    y += 5;
  }

  y += 3;
  setGray(doc, 200);
  doc.line(M, y, PAGE_W - M, y);
  y += 5;

  // ── Key values ────────────────────────────────────────────────────────────
  setGray(doc, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VALORES CLAVE', M, y);
  y += 4;

  const keyRows: [string, string][] = [
    ['NRd',     `${fmt(result.NRd, 1)} kN`],
    ['My,Rd',   `${fmt(result.My_Rd, 1)} kNm`],
    ['Mz,Rd',   `${fmt(result.Mz_Rd, 1)} kNm`],
    ['Nb,Rd,y', `${fmt(result.Nb_Rd_y, 1)} kN`],
    ['Nb,Rd,z', `${fmt(result.Nb_Rd_z, 1)} kN`],
    ['chi_y',   result.chi_y.toFixed(3)],
    ['chi_z',   result.chi_z.toFixed(3)],
    ['lam_y',   result.lambda_y.toFixed(3)],
    ['lam_z',   result.lambda_z.toFixed(3)],
  ];
  if (!result.isBox && result.Mcr > 0) {
    keyRows.push(
      ['Mcr',   `${fmt(result.Mcr, 1)} kNm`],
      ['chi_LT', result.chi_LT.toFixed(3)],
      ['Mb,Rd', `${fmt(result.Mb_Rd, 1)} kNm`],
    );
  }

  doc.setFontSize(8);
  for (const [label, value] of keyRows) {
    if (y > PAGE_H - M - 5) { doc.addPage(); y = M; }
    setGray(doc, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(pdfStr(label), M, y);
    setGray(doc, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(pdfStr(value), M + 50, y);
    y += 5;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - M + 3;
  setGray(doc, 140);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('gamM0 = 1.05  gamM1 = 1.05', M, footerY);
  doc.text('1', PAGE_W - M, footerY, { align: 'right' });

  doc.save(`concreta-pilar-acero-${inp.sectionType}${inp.size}-Ly${Math.round(inp.Ly/100)}-Lz${Math.round(inp.Lz/100)}.pdf`);
}
