// PostCard — blog post card, shared by the listing, related-posts and the
// landing's BlogSection.

import { Link } from 'react-router';
import { CAT_COLORS, CAT_BG, type Post } from './posts';
import './post-card.css';

export function PostCard({ post }: { post: Post }) {
  return (
    <Link className="post" to={`/blog/${post.slug}`}>
      <div className="post-thumb">
        {post.cover && (
          <img
            className="post-thumb-img"
            src={post.cover}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="post-thumb-fallback mono">
          <span className="dim">{post.category}</span>
          <span className="dim">{post.norm}</span>
        </div>
      </div>
      <div className="post-body">
        <div className="post-meta mono">
          <span
            className="tag"
            style={{
              color: CAT_COLORS[post.category] || 'var(--accent)',
              background: CAT_BG[post.category] || 'var(--color-tint-accent)',
            }}
          >
            {post.category}
          </span>
          <span className="dim">{post.date}</span>
        </div>
        <h3 className="post-title">{post.title}</h3>
        <p className="post-excerpt">{post.excerpt}</p>
        <div className="post-foot mono">
          <span className="dim">{post.read} · leer</span>
          <span className="post-arr">→</span>
        </div>
      </div>
    </Link>
  );
}
