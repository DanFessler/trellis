import { useEffect } from "react";
import { DocsPage } from "./docs/DocsPage";
import { Landing } from "./landing/Landing";
import { NotFound } from "./NotFound";
import { useRouter } from "./router";

export function App() {
  const { location, navigate } = useRouter();
  const path = location.path;
  useEffect(() => {
    if (path === "/docs") navigate("/docs/introduction", { replace: true });
  }, [path, navigate]);
  if (path === "/") return <Landing />;
  if (path.startsWith("/docs/")) return <DocsPage slug={path.slice(6)} />;
  if (path === "/docs") return null;
  return <NotFound />;
}
