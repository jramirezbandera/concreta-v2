// posts.ts — build-time loader for blog posts.
// Every `.md` in src/posts/ is bundled via import.meta.glob. Adding a post is
// just dropping a file there — no manifest to keep in sync.

import { parseFrontmatter } from './markdown';

export type PostCategory = 'TUTORIAL' | 'NORMATIVA' | 'CHANGELOG' | 'PRODUCTO';

export interface Post {
  slug: string;
  title: string;
  date: string;
  category: string;
  read: string;
  norm: string;
  excerpt: string;
  author: string;
  authorRole: string;
  cover?: string;
  coverCaption?: string;
  /** Raw Markdown body (frontmatter stripped). */
  body: string;
}

const FILES = import.meta.glob('../../posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function toPost(raw: string, path: string): Post {
  const { meta, body } = parseFrontmatter(raw);
  const fileSlug = path.split('/').pop()!.replace(/\.md$/, '');
  return {
    slug: meta.slug || fileSlug,
    title: meta.title || fileSlug,
    date: meta.date || '',
    category: meta.category || 'PRODUCTO',
    read: meta.read || '—',
    norm: meta.norm || '—',
    excerpt: meta.excerpt || '',
    author: meta.author || 'Javier Ramírez Bandera',
    authorRole: meta.authorRole || 'FUNDADOR · ARQUITECTO CALCULISTA',
    cover: meta.cover || undefined,
    coverCaption: meta.coverCaption || undefined,
    body,
  };
}

/** All posts, newest first. Files without YAML frontmatter (e.g. README.md)
    are not posts and are skipped. */
export const ALL_POSTS: Post[] = Object.entries(FILES)
  .filter(([, raw]) => raw.trimStart().startsWith('---'))
  .map(([path, raw]) => toPost(raw, path))
  .sort((a, b) => (a.date < b.date ? 1 : -1));

export function getPost(slug: string): Post | undefined {
  return ALL_POSTS.find((p) => p.slug === slug);
}

/** Category → tag colors, shared by blog cards and post headers. */
export const CAT_COLORS: Record<string, string> = {
  TUTORIAL: 'var(--accent)',
  NORMATIVA: 'var(--state-warn)',
  CHANGELOG: 'var(--state-ok)',
  PRODUCTO: 'var(--text-secondary)',
};
export const CAT_BG: Record<string, string> = {
  TUTORIAL: 'rgba(56, 189, 248, .10)',
  NORMATIVA: 'rgba(245, 158, 11, .10)',
  CHANGELOG: 'rgba(34, 197, 94, .10)',
  PRODUCTO: 'rgba(148, 163, 184, .10)',
};
