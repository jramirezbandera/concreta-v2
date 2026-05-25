// BlogSection.tsx — featured posts row on the landing page (3 cards).

import { Link } from 'react-router';
import { ALL_POSTS } from '../../../blog/posts';
import { PostCard } from '../../../blog/PostCard';
import './blog-section.css';

export function BlogSection() {
  const featured = ALL_POSTS.slice(0, 3);
  return (
    <section className="section" id="blog">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow">08 · Blog</div>
            <h2 className="section-title">Notas técnicas y de producto.</h2>
          </div>
          <p className="section-lede">
            Interpretaciones normativas, tutoriales con casos reales y registro
            de cambios. Escrito por gente que calcula.{' '}
            <Link to="/blog" className="link-arrow">Todos los artículos →</Link>
          </p>
        </div>

        <div className="posts">
          {featured.map((p) => <PostCard post={p} key={p.slug} />)}
        </div>
      </div>
    </section>
  );
}
