import documentStyles from "./document.css?inline";
import { folders } from "./folders";

const sidebar = (heading: string, items: string[], active = 0) =>
  `<aside><div class="section-label">${heading}</div>${items.map((name, i) => `<div class="sidebar-item ${i === active ? "selected" : ""}">${name}</div>`).join("")}<div class="sidebar-bottom">On this desktop</div></aside>`;
const toolbar = (title: string, detail: string) =>
  `<div class="toolbar"><strong>${title}</strong><span>${detail}</span></div>`;
const art = (n: number, label = "") =>
  `<div class="art art-${n % 4}" role="img" aria-label="${label || "Abstract landscape"}"><i></i><b></b></div>`;
const pages = [
  {
    title: "Finder — Studio",
    body: `${toolbar("Studio", "▦ &nbsp; Icon view")}<div class="shell">${sidebar("Favorites", ["◷ &nbsp; Recents", "▱ &nbsp; Desktop", "▱ &nbsp; Documents", "↓ &nbsp; Downloads", "☁ &nbsp; Cloud Drive"], 2)}<main><div class="breadcrumb">Documents <span>›</span> Studio</div><div class="file-grid">${["Projects", "Reference", "Archive", "Brand assets", "Workspace.fig", "Read me.txt", "Coast.jpg", "Palette.png"].map((name, i) => `<label class="file"><input type="radio" name="file" aria-label="Select ${name}"><div class="file-content">${i < 4 ? '<div class="folder"></div>' : i < 6 ? `<div class="document"><span>${i === 4 ? "✣" : "Aa"}</span><small>${i === 4 ? "FIG" : "TXT"}</small></div>` : art(i, name)}<span>${name}</span><small>${i < 4 ? `${i + 3} items` : i === 4 ? "2.4 MB" : "Yesterday"}</small></div></label>`).join("")}</div></main></div><div class="statusbar">8 items <span>Studio · Local folder</span></div>`,
  },
  {
    title: "Notes — Workspace ideas",
    body: `${toolbar("Notes", "3 notes")}<div class="shell">${sidebar("My notes", ["Workspace ideas", "Weekend list", "Little observations"])}<main class="note"><div class="note-date">September 21, 2026 at 10:42 AM</div><h1>Workspace ideas</h1><textarea aria-label="Note content" spellcheck="false">A desktop that feels like a place.\n\nEverything has a home. Nothing gets buried.\n\nIdeas to explore\n• Zoom out to see the whole picture\n• Keep related things close together\n• Make moving between tasks feel natural\n\nWhat if folders were spaces you could step into?</textarea><div class="note-check"><label><input type="checkbox" checked> Try a few familiar apps</label><label><input type="checkbox"> Find a rhythm for the animations</label></div></main></div>`,
  },
  {
    title: "Mail — Inbox",
    body: `${toolbar("Inbox", "3 messages · Demo")}<div class="shell">${sidebar("Mailboxes", ["▣ &nbsp; Inbox <em>3</em>", "☆ &nbsp; Starred", "↗ &nbsp; Sent", "▤ &nbsp; Drafts", "▱ &nbsp; Archive"])}<main class="mail-list">${[
      [
        "JL",
        "Jamie Lee",
        "A few thoughts on the workspace",
        "10:24 AM",
        "I tried the new layout this morning. Having the notes right beside the project folder feels surprisingly natural. Let’s keep exploring that.",
      ],
      [
        "AS",
        "Alex Santos",
        "Friday’s studio session",
        "Yesterday",
        "I booked the big table for Friday afternoon. Bring whatever you’re working on — sketches, prototypes, or just a good question.",
      ],
      [
        "ST",
        "Studio Team",
        "September references",
        "Monday",
        "The new reference collection is in the Studio folder. There are a few lovely examples of quiet interfaces and thoughtful use of color.",
      ],
    ]
      .map(
        ([initials, name, subject, time, body], i) =>
          `<details class="message" ${i === 0 ? "open" : ""}><summary><span class="avatar avatar-${i}">${initials}</span><div><strong>${name}</strong><small>${subject}</small></div><time>${time}</time></summary><article><div class="recipient">To: you@studio.local</div><h2>${subject}</h2><p>Hi there,</p><p>${body}</p><p>${name.split(" ")[0]}</p><textarea aria-label="Draft reply to ${name}" placeholder="Write a reply…"></textarea></article></details>`,
      )
      .join("")}</main></div>`,
  },
  {
    title: "Calendar — September",
    body: `${toolbar("September 2026", "Month")}<div class="shell">${sidebar("Calendars", ['<span class="dot blue"></span> Personal', '<span class="dot green"></span> Studio', '<span class="dot orange"></span> Reminders'])}<main class="calendar"><div class="weekdays">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<span>${d}</span>`).join("")}</div><div class="month">${Array.from(
      { length: 35 },
      (_, i) => {
        const day = i === 0 ? 31 : i > 30 ? i - 30 : i;
        const event: Record<number, string> = {
          4: "Studio session",
          9: "Design review",
          15: "Coffee with Alex",
          21: "Explore ideas",
          24: "Team catch-up",
          28: "Project notes",
        };
        return `<div class="day ${i === 0 || i > 30 ? "other" : ""}"><span class="${i === 21 ? "today" : ""}">${day}</span>${event[i] ? `<div class="event ${i % 2 ? "green" : "blue"}">${event[i]}</div>` : ""}</div>`;
      },
    ).join(
      "",
    )}</div><div class="agenda"><span class="section-label">MONDAY, SEPTEMBER 21</span><h2>Make some room for ideas.</h2><p><span class="dot green"></span> 10:00 – 11:00 &nbsp; Explore ideas</p></div></main></div>`,
  },
  {
    title: "Photos — Places",
    body: `${toolbar("Places", "8 photos · Illustrated collection")}<div class="shell">${sidebar("Library", ["▦ &nbsp; All Photos", "♡ &nbsp; Favorites", "▱ &nbsp; Places", "▱ &nbsp; Studio"], 2)}<main><div class="collection-heading"><h1>Places</h1><p>A little outside, inside.</p></div><div class="photos">${["Coastal light", "Dunes", "Blue hour", "The hills", "Morning walk", "Quiet water", "Last light", "Sunday"].map((name, i) => `<figure>${art(i, name)}<figcaption>${name}</figcaption></figure>`).join("")}</div></main></div>`,
  },
  {
    title: "Spotify — Slow mornings",
    body: `${toolbar("Spotify", "Slow mornings")}<div class="shell">${sidebar("Your Library", ["⌂ &nbsp; Home", "⌕ &nbsp; Search", "♥ &nbsp; Liked Songs", "≡ &nbsp; Slow mornings"], 3)}<main class="music"><div class="album-heading">${art(2, "Slow mornings album artwork")}<div><div class="section-label">PLAYLIST</div><h1>Slow mornings</h1><p>A little room to think.</p><small>Studio selections · 6 tracks</small></div></div><div class="playlist-actions"><span class="play-disc" aria-hidden="true">▶</span><span>♡</span><span>↓</span><span>•••</span><small>List &nbsp; ≡</small></div><div class="track-heading"><span># &nbsp; Title</span><span>◷</span></div><div class="tracks">${[
      ["First light", "North Window", "3:42"],
      ["A place to begin", "Soft Geometry", "4:18"],
      ["Between the trees", "North Window", "2:56"],
      ["Open water", "Low Tide", "5:02"],
      ["Small hours", "Soft Geometry", "3:34"],
      ["Home again", "Low Tide", "4:11"],
    ]
      .map(
        ([name, artist, duration], i) =>
          `<label class="track"><input type="radio" name="track" aria-label="Select ${name}"><span class="track-content"><small>${i + 1}</small><span><strong>${name}</strong><small>${artist}</small></span><time>${duration}</time></span></label>`,
      )
      .join(
        "",
      )}</div><p class="demo-label">Demo library · Audio isn’t connected</p></main></div><div class="player"><div class="now-playing">${art(2)}<div><strong>First light</strong><small>North Window</small></div><span>♡</span></div><div class="transport"><div aria-hidden="true">⌘ &nbsp; ◀▏ &nbsp; <b>▶</b> &nbsp; ▏▶ &nbsp; ↻</div><div class="progress"><small>0:00</small><i></i><small>3:42</small></div></div><div class="volume" aria-hidden="true">☷ &nbsp; ▱ &nbsp; ◖ <i></i></div></div>`,
  },
];

/** One demo page per app. */
export function webpage(index: number, folderId?: string) {
  const folder = folderId ? folders[folderId] : undefined;
  const page = folder
    ? {
        title: `Finder — ${folder.name}`,
        body: `${toolbar(folder.name, "▦ &nbsp; Icon view")}<div class="shell">${sidebar(
          "Desktop",
          Object.entries(folders).map(
            ([id, value]) =>
              `<span data-open-resource="${id}" tabindex="0" role="button">▱ &nbsp; ${value.name}</span>`,
          ),
          Object.keys(folders).indexOf(folderId!),
        )}<main><div class="breadcrumb">Desktop <span>›</span> ${folder.name}</div><div class="file-grid">${folder.items.map((item, i) => `<label class="file" ${item.folder ? `data-open-resource="${item.folder}"` : ""}><input type="radio" name="file" aria-label="Select ${item.name}"><div class="file-content">${item.folder ? '<div class="folder"></div>' : /\.(jpg|png)$/.test(item.name) ? art(i, item.name) : '<div class="document"><span>Aa</span><small>FILE</small></div>'}<span>${item.name}</span><small>${item.folder ? `${folders[item.folder].items.length} items` : "Demo file"}</small></div></label>`).join("")}</div></main></div><div class="statusbar">${folder.items.length} items <span>${folder.name} · Demo folder</span></div>`,
      }
    : pages[index % pages.length];
  // Pages draw their own title bar; the heading also names the window.
  const [, heading = "", detail = ""] =
    /<div class="toolbar"><strong>(.*?)<\/strong><span>(.*?)<\/span>/.exec(page.body) ?? [];
  return {
    title: page.title,
    heading,
    detail: detail.replace(/&nbsp;/g, " "),
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title}</title><style>${documentStyles}</style></head><body class="app-${index % pages.length}">${page.body}</body></html>`,
  };
}
