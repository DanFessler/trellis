/// <reference types="vite/client" />

declare module "*.md" {
  const page: {
    title: string;
    description: string;
    headings: { depth: number; id: string; text: string }[];
    html: string;
  };
  export default page;
}

declare module "virtual:docs" {
  export const docs: { slug: string; title: string; description: string; section: string; order: number; nav?: string }[];
  export const loaders: Record<string, () => Promise<{ default: import("*.md").default }>>;
}
