import { useEffect } from "react";
import { DocsPage } from "./docs/DocsPage";
import { parseDocsPath } from "./docs/paths";
import { Landing } from "./landing/Landing";
import { NotFound } from "./NotFound";
import { useRouter } from "./router";

export function App() {
  const { location, navigate } = useRouter();
  const path = location.path;
  const docs = path === "/docs" || path.startsWith("/docs/") ? parseDocsPath(path) : null;
  const redirect = docs && "redirect" in docs ? docs.redirect : null;
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect, navigate]);
  if (path === "/") return <Landing />;
  if (docs && "slug" in docs) return <DocsPage key={docs.version} version={docs.version} slug={docs.slug} />;
  if (docs) return null;
  return <NotFound />;
}
