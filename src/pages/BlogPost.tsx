// BlogPost — /blog/:slug route. Renders a Markdown post with a sticky TOC,
// callouts, formula blocks and related posts. Ported from the Claude Design
// handoff (blog-post.html).

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { LandingNav } from './landing/LandingNav';
import { LandingFooter } from './landing/LandingFooter';
import { PostCard } from './blog/PostCard';
import { ALL_POSTS, getPost, CAT_COLORS, CAT_BG } from './blog/posts';
import { renderMarkdown, formatDate, getInitials } from './blog/markdown';
import './landing.css';
import './subpage.css';
import './blog-post.css';

export function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPost(slug) : undefined;

  const rendered = useMemo(() => (post ? renderMarkdown(post.body) : null), [post]);
  const [activeId, setActiveId] = useState('');
  const [copied, setCopied] = useState(false);

  // TOC active state — highlight the section currently in view.
  useEffect(() => {
    if (!rendered) return;
    const headings = document.querySelectorAll<HTMLElement>('.post-prose h2');
    if (!headings.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveId(e.target.id);
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [rendered]);

  // ── 404 ──
  if (!post || !rendered) {
    return (
      <div className="landing-root">
        <Helmet><title>Artículo no encontrado — Concreta</title></Helmet>
        <LandingNav />
        <main className="subpage-body">
          <div className="container post-state">
            <div className="section-eyebrow">404</div>
            <h1 className="subpage-title" style={{ marginBottom: 14 }}>Artículo no encontrado.</h1>
            <p className="subpage-lede">
              No existe ningún artículo con la dirección solicitada.
            </p>
            <p style={{ marginTop: 32 }}>
              <Link to="/blog" className="btn"><span className="arr">←</span> Volver al blog</Link>
            </p>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const related = ALL_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="landing-root">
      <Helmet>
        <title>{post.title} — Concreta</title>
        <meta name="description" content={post.excerpt} />
      </Helmet>

      <LandingNav />

      <main>
        <header className="post-hero">
          <div className="post-hero-inner">
            <div className="post-breadcrumb mono">
              <Link to="/blog">blog</Link>
              <span className="dim">/</span>
              <span className="dim">{post.category.toLowerCase()}</span>
            </div>
            <h1 className="post-h-title">{post.title}</h1>
            <p className="post-h-dek">{post.excerpt}</p>
            <div className="post-h-meta">
              <div className="post-h-author">
                <div className="post-h-avatar dot-grid"><span className="mono">{getInitials(post.author)}</span></div>
                <div>
                  <div className="post-h-author-name">{post.author}</div>
                  <div className="post-h-author-role mono dim">{post.authorRole}</div>
                </div>
              </div>
              <div className="post-h-stats">
                <div className="post-h-stat">
                  <span className="mono dim">PUBLICADO</span>
                  <span>{formatDate(post.date)}</span>
                </div>
                <div className="post-h-stat">
                  <span className="mono dim">LECTURA</span>
                  <span>{post.read}</span>
                </div>
                <div className="post-h-stat">
                  <span className="mono dim">CATEGORÍA</span>
                  <span>
                    <span
                      className="tag"
                      style={{
                        color: CAT_COLORS[post.category] || 'var(--accent)',
                        background: CAT_BG[post.category] || 'rgba(56,189,248,.10)',
                      }}
                    >
                      {post.category}
                    </span>
                  </span>
                </div>
                <div className="post-h-stat">
                  <span className="mono dim">NORMA</span>
                  <span><span className="tag dim">{post.norm}</span></span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {post.cover && (
          <div className="post-feature">
            <figure className="post-feature-figure">
              <div className="post-feature-img">
                <img src={post.cover} alt={post.title} />
              </div>
              {post.coverCaption && (
                <figcaption className="post-figcaption mono">{post.coverCaption}</figcaption>
              )}
            </figure>
          </div>
        )}

        <div className="post-body-wrap">
          <div className="container post-body-grid">
            <aside className="post-toc">
              {rendered.toc.length > 0 && (
                <>
                  <div className="post-toc-h mono">ÍNDICE</div>
                  <ol className="post-toc-list">
                    {rendered.toc.map((t) => (
                      <li key={t.id}>
                        <a href={`#${t.id}`} className={activeId === t.id ? 'active' : undefined}>
                          {t.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <div className="post-toc-share">
                <div className="post-toc-h mono">COMPARTIR</div>
                <div className="post-toc-share-row">
                  <a
                    className="post-toc-share-btn"
                    href={`https://linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    linkedin
                  </a>
                  <a
                    className="post-toc-share-btn"
                    href={`https://x.com/intent/post?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    x
                  </a>
                  <button type="button" className="post-toc-share-btn" onClick={copyLink}>
                    {copied ? '✓ copiado' : 'copiar enlace'}
                  </button>
                </div>
              </div>
            </aside>

            <div className="post-prose">
              <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
              <div className="post-author-card">
                <div className="post-author-avatar dot-grid"><span className="mono">{getInitials(post.author)}</span></div>
                <div>
                  <div className="post-author-name">{post.author}</div>
                  <div className="post-author-role mono dim">{post.authorRole}</div>
                  <p className="post-author-bio">
                    Arquitecto especializado en cálculo de estructuras. Escribe
                    Concreta y los artículos del blog.
                  </p>
                  <div className="post-author-links mono">
                    <a href="https://linkedin.com/in/javier-ram%C3%ADrez-bandera" target="_blank" rel="noreferrer">linkedin</a>
                    <a href="https://github.com/jramirezbandera" target="_blank" rel="noreferrer">github</a>
                    <a href="https://alteestudio.com" target="_blank" rel="noreferrer">alteestudio.com</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="post-related">
            <div className="container">
              <div className="post-related-h">
                <div>
                  <div className="section-eyebrow">Sigue leyendo</div>
                  <h2 className="section-title">Artículos relacionados</h2>
                </div>
                <Link to="/blog" className="link-arrow">Todos los artículos →</Link>
              </div>
              <div className="posts">
                {related.map((p) => <PostCard post={p} key={p.slug} />)}
              </div>
            </div>
          </section>
        )}
      </main>

      <LandingFooter />
    </div>
  );
}
