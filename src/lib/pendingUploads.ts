import { uploadToCloudinary, type CloudinaryUploadResult } from "./cloudinary";
import { supabase } from "./supabase";

const DB_NAME = "pinly-pending-uploads";
const STORE_NAME = "uploads";
const DB_VERSION = 1;

export interface PendingUpload {
  id: string; // auto-generated
  pinId: string;
  coupleId: string;
  file: File;
  sortOrder: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePendingUploads(
  pinId: string,
  coupleId: string,
  files: File[],
  startOrder = 0,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (let i = 0; i < files.length; i++) {
    const entry: PendingUpload = {
      id: `${pinId}_${Date.now()}_${i}`,
      pinId,
      coupleId,
      file: files[i],
      sortOrder: startOrder + i,
    };
    store.put(entry);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getPendingUploads(): Promise<PendingUpload[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function removePendingUpload(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearPendingUploadsForPin(pinId: string): Promise<void> {
  const all = await getPendingUploads();
  const toRemove = all.filter((u) => u.pinId === pinId);
  if (toRemove.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const entry of toRemove) {
    store.delete(entry.id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Process all pending uploads from IndexedDB.
 * Uploads each file to Cloudinary, inserts pin_images row, then removes from queue.
 */
export async function processPendingUploads(
  onProgress?: (pinId: string, pct: number) => void,
  onDone?: (pinId: string) => void,
): Promise<void> {
  const pending = await getPendingUploads();
  if (pending.length === 0) return;

  // Group by pinId
  const byPin = new Map<string, PendingUpload[]>();
  for (const entry of pending) {
    const group = byPin.get(entry.pinId) ?? [];
    group.push(entry);
    byPin.set(entry.pinId, group);
  }

  for (const [pinId, entries] of byPin) {
    let completed = 0;
    const total = entries.length;
    const results: (CloudinaryUploadResult & { sortOrder: number })[] = [];

    for (const entry of entries) {
      try {
        const result = await uploadToCloudinary(entry.file, {
          folder: `pinly/${entry.coupleId}`,
        });
        results.push({ ...result, sortOrder: entry.sortOrder });
        await removePendingUpload(entry.id);
      } catch (err) {
        console.warn("Pending upload failed for", entry.id, err);
        // Leave in queue for next retry
      }
      completed++;
      onProgress?.(pinId, Math.round((completed / total) * 100));
    }

    if (results.length > 0) {
      const rows = results.map((r) => ({
        pin_id: pinId,
        cloudinary_url: r.url,
        cloudinary_public_id: r.publicId,
        width: r.width,
        height: r.height,
        sort_order: r.sortOrder,
      }));
      const { error } = await supabase.from("pin_images").insert(rows);
      if (error) console.warn("Failed to insert pin_images:", error);
    }

    onDone?.(pinId);
  }
}
