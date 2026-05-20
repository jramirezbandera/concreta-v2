import { useLocation } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { routeMeta, DEFAULT_META } from '../../data/routeMeta';

// Sits above the route Suspense boundary so the document title and description
// update synchronously on navigation, before the lazy chunk lands. Without
// this, the previous route's <Helmet> stays painted for the full chunk-load
// window. Modules with dynamic per-instance content (BlogPost) keep their own
// <Helmet> — react-helmet-async merges children, last-mounted wins.
export function RouteHelmet() {
  const { pathname } = useLocation();
  const meta = resolveMeta(pathname);
  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
    </Helmet>
  );
}

function resolveMeta(pathname: string) {
  if (routeMeta[pathname]) return routeMeta[pathname];
  // Dynamic blog posts: show the blog index meta as a placeholder until
  // BlogPost.tsx mounts and overrides with the post-specific title/excerpt.
  if (pathname.startsWith('/blog/')) return routeMeta['/blog'];
  return DEFAULT_META;
}
