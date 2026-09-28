import { latest, versions } from "virtual:docs";

/** Where a page of a version lives. The latest release has the short, canonical /docs/<page>. */
export const docHref = (version: string, slug: string) =>
  version === latest ? `/docs/${slug}` : `/docs/${version}/${slug}`;

/** /docs/<page> is the latest release; /docs/<version>/<page> is any version, "next" included. */
export function parseDocsPath(path: string): { version: string; slug: string } | { redirect: string } {
  const [first = "", second = ""] = path.replace(/^\/docs\/?/, "").split("/");
  const isVersion = versions.some((v) => v.key === first);
  if (!first) return { redirect: "/docs/introduction" };
  if (isVersion && !second) return { redirect: docHref(first, "introduction") };
  if (isVersion) return { version: first, slug: second };
  return { version: latest, slug: first };
}
