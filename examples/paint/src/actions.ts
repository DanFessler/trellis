import type { WorkspaceHandle } from "@danfessler/trellis-react";
import type { DocParams } from "./paint/PaintDoc";
import { app, documents, exportPng } from "./store";
import { confirmDialog } from "./ui/Dialog";
import { newDocumentDialog } from "./ui/NewDocument";

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const mod = isMac ? "⌘" : "Ctrl+";
export const shift = isMac ? "⇧" : "Shift+";
export const alt = isMac ? "⌥" : "Alt+";

export const activeDoc = () => documents.get(app.get().activeDoc);

function nextUntitled(ws: WorkspaceHandle) {
  const names = new Set(ws.views({ type: "document" }).map((v) => String((v.params as DocParams).name ?? v.title)));
  let n = 1;
  while (names.has(`Untitled-${n}`)) n++;
  return `Untitled-${n}`;
}

export async function newDocument(ws: WorkspaceHandle) {
  const opts = await newDocumentDialog(nextUntitled(ws));
  if (!opts) return;
  const info = ws.open("document", { params: { ...opts } satisfies DocParams, placement: "stage" });
  app.set({ activeDoc: info.id });
}

export function openSample(ws: WorkspaceHandle) {
  const info = ws.open("document", { params: { name: "Dusk Study", width: 1600, height: 1000, sample: "dusk" } satisfies DocParams, placement: "stage" });
  app.set({ activeDoc: info.id });
}

export function duplicateDocument(ws: WorkspaceHandle, id: string) {
  const doc = documents.get(id);
  const view = ws.view(id);
  if (!doc || !view) return;
  const params: DocParams = { name: `${doc.name} copy`, width: doc.width, height: doc.height, background: "transparent", cloneOf: id };
  const info = ws.open("document", { params, placement: { into: view.panelId } });
  app.set({ activeDoc: info.id });
}

export function exportDocument(id: string | null | undefined) {
  const doc = documents.get(id);
  if (doc) void exportPng(doc);
}

export async function resetLayout(ws: WorkspaceHandle) {
  const dirty = documents.all().some((d) => d.dirty);
  const choice = await confirmDialog({
    title: "Reset the workspace?",
    message: dirty
      ? "Panels return to their default positions and all documents are closed. Unsaved changes will be lost."
      : "Panels return to their default positions and all documents are closed.",
    cancel: "cancel",
    actions: [
      { value: "cancel", label: "Cancel" },
      { value: "reset", label: "Reset Layout", kind: dirty ? "danger" : "primary" },
    ],
  });
  if (choice !== "reset") return;
  await documents.forgetAll();
  ws.reset();
}
