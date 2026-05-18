// Blog — dedicated /blog route. Lists every post in src/posts/, with a
// category filter. Ported from the Claude Design handoff (blog.html).

import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { LandingNav } from './landing/LandingNav';
import { LandingFooter } from './landing/LandingFooter';
import { PostCard } from './blog/PostCard';
import { ALL_POSTS } from './blog/posts';
import './landing.css';
import './subpage.css';

export function Blog() {
  const [active, setActive] = useState('Todos');

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of ALL_POSTS) m[p.category] = (m[p.category] || 0) + 1;
    return m;
  }, []);
  const cats = ['Todos', ...Object.keys(counts)];

  const list = active === 'Todos' ? ALL_POSTS : ALL_POSTS.filter((p) => p.category === active);
  const heading =
    active === 'Todos'
      ? `Todos los artículos (${list.length})`
      : `${active.toLowerCase()} · ${list.length} artículo${list.length === 1 ? '' : 's'}`;

  return (
    <div className="landing-root">
      <Helmet>
        <title>Blog — Concreta</title>
        <meta
          name="description"
          content="Notas técnicas y de producto: interpretaciones normativas del CE y el CTE, tutoriales con casos reales y registro de cambios. Escrito por gente que calcula."
        />
      </Helmet>

      <LandingNav />

      <section className="subpage-hero">
        <div className="container subpage-hero-inner">
          <div className="subpage-eyebrow">08 · Blog</div>
          <h1 className="subpage-title">Notas técnicas y de producto.</h1>
          <p className="subpage-lede">
            Interpretaciones normativas, tutoriales con casos reales y registro
            de cambios. Escrito por gente que calcula.
          </p>
        </div>
      </section>

      <main className="subpage-body">
        <div className="container">
          <div className="blog-filter">
            {cats.map((c) => {
              const n = c === 'Todos' ? ALL_POSTS.length : counts[c];
              return (
                <button
                  type="button"
                  key={c}
                  className={`chip ${c === active ? 'active' : ''}`}
                  onClick={() => setActive(c)}
                >
                  {c} <span className="dim">· {n}</span>
                </button>
              );
            })}
          </div>

          <h2 className="subsec-title" style={{ marginBottom: 8 }}>{heading}</h2>

          {list.length === 0 ? (
            <p className="subsec-lede">
              Aún no hay artículos en esta categoría.
            </p>
          ) : (
            <div className="posts-grid">
              {list.map((p) => <PostCard post={p} key={p.slug} />)}
            </div>
          )}
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
