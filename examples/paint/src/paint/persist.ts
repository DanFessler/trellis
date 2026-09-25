import type { Blend, PaintDoc } from "./PaintDoc";

/** Pixels live in IndexedDB so documents survive a reload alongside Trellis's persisted layout. */
interface StoredLayer {
  name: string;
  visible: boolean;
  opacity: number;
  blend: Blend;
  blob: Blob;
}
export interface StoredDoc {
  name: string;
  width: number;
  height: number;
  active: number;
  layers: StoredLayer[];
}

const DB_NAME = "trellis-paint";
const STORE = "documents";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (!dbPromise)
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return db().then(
    (d) =>
      new Promise((resolve) => {
        if (!d) return resolve(null);
        try {
          const req = run(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));

export async function saveDoc(doc: PaintDoc) {
  const layers: StoredLayer[] = [];
  for (const l of doc.layers) {
    const blob = await toBlob(l.canvas);
    if (!blob) return;
    layers.push({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, blob });
  }
  const stored: StoredDoc = {
    name: doc.name,
    width: doc.width,
    height: doc.height,
    active: doc.layers.findIndex((l) => l.id === doc.activeLayerId),
    layers,
  };
  await tx("readwrite", (s) => s.put(stored, doc.id));
}

export const loadDoc = (id: string) => tx<StoredDoc | undefined>("readonly", (s) => s.get(id));
export const deleteDoc = (id: string) => tx("readwrite", (s) => s.delete(id));
export const clearDocs = () => tx("readwrite", (s) => s.clear());

export async function hydrate(doc: PaintDoc, stored: StoredDoc) {
  if (stored.width !== doc.width || stored.height !== doc.height) return false;
  const layers = [];
  for (const l of stored.layers) {
    const layer = { ...doc.makeLayer(l.name), visible: l.visible, opacity: l.opacity, blend: l.blend };
    const bmp = await createImageBitmap(l.blob);
    layer.canvas.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    layers.push(layer);
  }
  if (!layers.length) return false;
  doc.layers = layers;
  doc.activeLayerId = layers[Math.max(0, Math.min(layers.length - 1, stored.active))].id;
  doc.name = stored.name;
  doc.emit(true);
  return true;
}
