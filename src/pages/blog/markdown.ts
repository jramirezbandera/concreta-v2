// markdown.ts — frontmatter parsing + Markdown rendering for the blog.
// Posts are trusted, repo-authored .md files, so rendering to an HTML string
// and post-processing the DOM is safe here.

import { marked } from 'marked';

/** Accent-stripped, hyphenated slug for heading anchors. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Split `---\nYAML\n---\nbody`. Minimal YAML: `key: value`, double-quoted strings. */
export function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = src.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const km = line.match(/^([A-Za-z][\w]*)\s*:\s*(.*)$/);
    if (!km) continue;
    let v = km[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    meta[km[1]] = v;
  }
  return { meta, body: m[2] };
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** ISO date → "8 de mayo de 2026". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** "Javier Ramírez Bandera" → "JR". */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

export interface TocEntry {
  id: string;
  text: string;
}

/**
 * Render a Markdown body to HTML, then post-process:
 *  - h2/h3 get slugified ids; h2s are collected for the TOC
 *  - blockquotes become callouts (⚠ warn · ✓ tip · otherwise norm)
 *  - <pre> blocks become formula blocks
 *  - lone images are wrapped in <figure> with a caption
 */
export function renderMarkdown(body: string): { html: string; toc: TocEntry[] } {
  const rawHtml = marked.parse(body, { async: false }) as string;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = rawHtml;

  const toc: TocEntry[] = [];
  wrapper.querySelectorAll('h2, h3').forEach((h) => {
    const text = h.textContent || '';
    h.id = slugify(text);
    if (h.tagName === 'H2') toc.push({ id: h.id, text });
  });

  wrapper.querySelectorAll('blockquote').forEach((bq) => {
    const txt = (bq.textContent || '').trim();
    let cls = 'post-callout';
    if (/^\s*⚠/.test(txt)) cls += ' post-callout-warn';
    else if (/^\s*✓/.test(txt)) cls += ' post-callout-tip';
    else cls += ' post-callout-norm';

    const strong = bq.querySelector('p > strong:first-child');
    if (strong) {
      const head = document.createElement('div');
      head.className = 'post-callout-h mono';
      head.textContent = (strong.textContent || '').toUpperCase();
      strong.parentElement?.removeChild(strong);
      const p = bq.querySelector('p');
      if (p) p.innerHTML = p.innerHTML.replace(/^[\s—–\-:]*/, '');
      bq.insertBefore(head, bq.firstChild);
    }
    bq.className = cls;
  });

  wrapper.querySelectorAll('pre').forEach((pre) => pre.classList.add('post-formula'));

  wrapper.querySelectorAll('p > img:only-child').forEach((img) => {
    const p = img.parentElement;
    if (!p) return;
    const fig = document.createElement('figure');
    fig.className = 'post-figure';
    fig.appendChild(img.cloneNode(false));
    const alt = (img as HTMLImageElement).alt;
    if (alt) {
      const cap = document.createElement('figcaption');
      cap.className = 'post-figcaption mono';
      cap.textContent = alt;
      fig.appendChild(cap);
    }
    p.parentElement?.replaceChild(fig, p);
  });

  return { html: wrapper.innerHTML, toc };
}
