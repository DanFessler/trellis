/// <reference types="vite/client" />

interface MarkdownPage {
  title: string;
  description: string;
  headings: { depth: number; id: string; text: string }[];
  html: string;
}

declare module "*.md" {
  const page: MarkdownPage;
  export default page;
}

interface DocMeta {
  slug: string;
  title: string;
  description: string;
  section: string;
  order: number;
  nav?: string;
}

interface DocVersion {
  /** URL segment: "0.2", or "next". */
  key: string;
  /** Full version for releases; null for next. */
  version: string | null;
  kind: "release" | "next";
  /** The git tag or branch the docs came from. */
  ref: string;
}

declare module "virtual:docs" {
  /** The latest release's key, served at /docs/<page>. */
  export const latest: string;
  /** The latest release first, then next, then older releases. */
  export const versions: DocVersion[];
  export const indexes: Record<string, DocMeta[]>;
  export const loaders: Record<string, Record<string, () => Promise<{ default: MarkdownPage }>>>;
}

declare module "virtual:trellis-release" {
  /** The latest released version, such as "0.2.0". */
  export const release: string | null;
}
