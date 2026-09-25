/** In-memory example folders; no access to the host filesystem. */
export const desktopFolders = ["studio", "projects", "reference"] as const;
export const folders: Record<
  string,
  { name: string; items: { name: string; folder?: string }[] }
> = {
  studio: {
    name: "Studio",
    items: [
      { name: "Projects", folder: "projects" },
      { name: "Reference", folder: "reference" },
      { name: "Workspace.fig" },
      { name: "Read me.txt" },
    ],
  },
  projects: {
    name: "Projects",
    items: [
      { name: "Desktop prototype.fig" },
      { name: "Explorations.fig" },
      { name: "Project notes.txt" },
      { name: "Roadmap.pdf" },
    ],
  },
  reference: {
    name: "Reference",
    items: [
      { name: "Coast.jpg" },
      { name: "Mountains.jpg" },
      { name: "Palette.png" },
      { name: "Inspiration.pdf" },
    ],
  },
};
