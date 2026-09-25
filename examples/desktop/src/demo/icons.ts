const apps = [
  {
    name: "Finder",
    art: '<path fill="#b4e7ff" d="M24 4h16a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H24z"/><path d="M25 8l-4 19h7v14M12 19v3m23-3v3M13 31q11 9 23-1"/>',
  },
  {
    name: "Notes",
    art: '<path fill="#fff9df" stroke="none" d="M5 13h38v29H5z"/><path d="M12 23h24M12 30h24M12 37h16"/>',
  },
  {
    name: "Mail",
    art: '<rect x="7" y="13" width="34" height="24" rx="3"/><path d="m8 15 16 13 16-13M8 35l11-10m21 10L29 25"/>',
  },
  {
    name: "Calendar",
    art: '<path fill="#fff" stroke="none" d="M5 16h38v26H5z"/><text x="24" y="12" font-size="7" fill="white" stroke="none" text-anchor="middle">SEP</text><text x="24" y="36" font-size="24" fill="#28282a" stroke="none" text-anchor="middle">22</text>',
  },
  {
    name: "Photos",
    art: Array.from(
      { length: 8 },
      (_, i) =>
        `<ellipse cx="24" cy="15" rx="6" ry="10" fill="hsl(${i * 45} 80% 62% / .8)" stroke="none" transform="rotate(${i * 45} 24 24)"/>`,
    ).join(""),
  },
  {
    name: "Spotify",
    art: '<circle cx="24" cy="24" r="18" fill="#1ed760" stroke="none"/><path d="M12 19q13-6 25 1M14 25q11-5 21 1M16 31q9-4 17 1" stroke="#111" stroke-width="3"/>',
  },
];
export function appIcon(index: number): string {
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${apps[index % apps.length].art}</svg>`;
}
