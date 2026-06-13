// Pricing + Blog tests:
//   - /pricing renders plans, comparison and FAQ
//   - /blog lists every post; the category filter narrows the list
//   - /blog/:slug renders a Markdown post (headings, callouts)
//   - an unknown slug shows the 404 state
//   - nav active state on /pricing and /blog/:slug

import { describe, expect, it, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { Pricing } from '../../pages/Pricing';
import { Blog } from '../../pages/Blog';
import { BlogPost } from '../../pages/BlogPost';
import { ALL_POSTS } from '../../pages/blog/posts';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderAt(initial: string) {
  const router = createMemoryRouter(
    [
      { path: '/pricing', element: <Pricing /> },
      { path: '/blog', element: <Blog /> },
      { path: '/blog/:slug', element: <BlogPost /> },
    ],
    { initialEntries: [initial] },
  );
  return render(
    <HelmetProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </HelmetProvider>,
  );
}

describe('Pricing page', () => {
  it('renders plans, comparison table and FAQ', () => {
    renderAt('/pricing');
    expect(
      screen.getByRole('heading', { name: /Suscripción mensual\. Sin sorpresas/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Para el técnico individual.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Comparativa completa/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Por qué suscripción y no licencia perpetua/i }),
    ).toBeInTheDocument();
  });

  it('marks "Precio" active on /pricing', () => {
    renderAt('/pricing');
    const links = screen.getAllByRole('link', { name: 'Precio' });
    expect(links.some((a) => a.getAttribute('aria-current') === 'page')).toBe(true);
  });
});

describe('Blog listing', () => {
  it('lists every post', () => {
    renderAt('/blog');
    expect(
      screen.getByRole('heading', { name: new RegExp(`Todos los artículos \\(${ALL_POSTS.length}\\)`) }),
    ).toBeInTheDocument();
    for (const p of ALL_POSTS) {
      expect(screen.getByRole('heading', { name: p.title })).toBeInTheDocument();
    }
  });

  it('the category filter narrows the list', () => {
    renderAt('/blog');
    fireEvent.click(screen.getByRole('button', { name: /CHANGELOG/ }));
    expect(screen.getByRole('heading', { name: /changelog · 1 artículo/i })).toBeInTheDocument();
    // the changelog post is shown, a tutorial post is not
    expect(screen.getByRole('heading', { name: /v0\.4 —/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Punzonamiento en placas/ }),
    ).not.toBeInTheDocument();
  });
});

describe('Blog post reader', () => {
  it('renders a Markdown post with headings and a callout', () => {
    renderAt('/blog/punzonamiento-u1-a-2d');
    expect(
      screen.getByRole('heading', { name: /Punzonamiento en placas: u1 a 2d/i, level: 1 }),
    ).toBeInTheDocument();
    // markdown body rendered: an h2 from the post
    expect(screen.getByRole('heading', { name: 'Contexto normativo' })).toBeInTheDocument();
    // a blockquote became a callout
    expect(document.querySelector('.post-callout')).toBeTruthy();
    // a fenced code block became a formula block
    expect(document.querySelector('.post-formula')).toBeTruthy();
    // the TOC lists the post's h2 sections
    const toc = document.querySelector('.post-toc-list');
    expect(toc && within(toc as HTMLElement).getByText('Contexto normativo')).toBeTruthy();
  });

  it('shows the 404 state for an unknown slug', () => {
    renderAt('/blog/no-existe');
    expect(screen.getByRole('heading', { name: /Artículo no encontrado/i })).toBeInTheDocument();
  });

  it('marks "Blog" active on a post page', () => {
    renderAt('/blog/punzonamiento-u1-a-2d');
    const links = screen.getAllByRole('link', { name: 'Blog' });
    expect(links.some((a) => a.getAttribute('aria-current') === 'page')).toBe(true);
  });
});
