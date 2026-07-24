import { uploadToCloudinary, type CloudinaryUploadResult } from "./cloudinary";
import { formatErrorMessage } from "./errorMessage";
import { toPinImageRows } from "./pinMediaUpload";
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

type PendingUploadResult = CloudinaryUploadResult & {
  pendingId: string;
  sortOrder: number;
};

const pendingUploadRuns = new Map<string, Promise<void>>();
const claimedPendingUploadIds = new Set<string>();

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
): Promise<string[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const ids: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const id = `${pinId}_${Date.now()}_${i}`;
    const entry: PendingUpload = {
      id,
      pinId,
      coupleId,
      file: files[i],
      sortOrder: startOrder + i,
    };
    ids.push(id);
    store.put(entry);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  ids.forEach((id) => claimedPendingUploadIds.add(id));
  return ids;
}

export function releasePendingUploads(ids: string[]) {
  ids.forEach((id) => claimedPendingUploadIds.delete(id));
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
  releasePendingUploads([id]);
}

export async function removePendingUploads(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const id of ids) {
    store.delete(id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  releasePendingUploads(ids);
}

async function insertPendingUploadRows(
  pinId: string,
  results: PendingUploadResult[],
) {
  if (results.length === 0) return;
  const rows = toPinImageRows(pinId, results, 0).map((row, index) => ({
    ...row,
    sort_order: results[index].sortOrder,
  }));
  const { error } = await supabase.from("pin_images").insert(rows);
  if (error) {
    throw new Error(
      formatErrorMessage(error, {
        fallback: "Failed to attach uploaded media to memory.",
      }),
    );
  }
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
  releasePendingUploads(toRemove.map((entry) => entry.id));
}

/**
 * Process all pending uploads from IndexedDB.
 * Uploads files to Cloudinary, inserts pin_images rows, then removes successful rows from the queue.
 */
async function processPendingUploadsForSpace(
  coupleId: string,
  onProgress?: (pinId: string, pct: number) => void,
  onDone?: (pinId: string) => void,
): Promise<void> {
  const pending = (await getPendingUploads()).filter(
    (entry) =>
      entry.coupleId === coupleId && !claimedPendingUploadIds.has(entry.id),
  );
  if (pending.length === 0) return;

  // Group by pinId
  const byPin = new Map<string, PendingUpload[]>();
  for (const entry of pending) {
    const group = byPin.get(entry.pinId) ?? [];
    group.push(entry);
    byPin.set(entry.pinId, group);
  }

  for (const [pinId, queuedEntries] of byPin) {
    const { data: pin, error: pinError } = await supabase
      .from("pins")
      .select("id")
      .eq("id", pinId)
      .eq("space_id", coupleId)
      .maybeSingle();
    if (pinError) {
      console.warn("Could not verify pending upload memory:", pinError);
      continue;
    }
    if (!pin) {
      await removePendingUploads(queuedEntries.map((entry) => entry.id));
      continue;
    }

    const queuedOrders = Array.from(
      new Set(queuedEntries.map((entry) => entry.sortOrder)),
    );
    const { data: existingRows, error: existingRowsError } = await supabase
      .from("pin_images")
      .select("sort_order")
      .eq("pin_id", pinId)
      .in("sort_order", queuedOrders);
    if (existingRowsError) {
      console.warn(
        "Could not verify already attached pending uploads:",
        existingRowsError,
      );
      continue;
    }

    const existingOrders = new Set(
      (existingRows ?? []).map((row) => row.sort_order),
    );
    const alreadyAttached = queuedEntries.filter((entry) =>
      existingOrders.has(entry.sortOrder),
    );
    if (alreadyAttached.length > 0) {
      await removePendingUploads(alreadyAttached.map((entry) => entry.id));
    }
    const entries = queuedEntries.filter(
      (entry) => !existingOrders.has(entry.sortOrder),
    );
    if (entries.length === 0) {
      onDone?.(pinId);
      continue;
    }

    let completed = 0;
    const total = entries.length;
    const results: PendingUploadResult[] = [];

    for (const entry of entries) {
      try {
        const result = await uploadToCloudinary(entry.file, {
          folder: `pinly/${entry.coupleId}`,
        });
        results.push({
          ...result,
          pendingId: entry.id,
          sortOrder: entry.sortOrder,
        });
      } catch (err) {
        console.warn(
          "Pending upload failed for",
          entry.id,
          formatErrorMessage(err),
          err,
        );
        // Leave in queue for next retry
      }
      completed++;
      onProgress?.(pinId, Math.round((completed / total) * 100));
    }

    if (results.length > 0) {
      try {
        await insertPendingUploadRows(pinId, results);
        await removePendingUploads(results.map((result) => result.pendingId));
      } catch (error) {
        console.warn(
          "Failed to insert pending upload rows:",
          formatErrorMessage(error),
          error,
        );
      }
    }

    onDone?.(pinId);
  }
}

export function processPendingUploads(
  coupleId: string,
  onProgress?: (pinId: string, pct: number) => void,
  onDone?: (pinId: string) => void,
): Promise<void> {
  const currentRun = pendingUploadRuns.get(coupleId);
  if (currentRun) return currentRun;

  const run = processPendingUploadsForSpace(coupleId, onProgress, onDone)
    .finally(() => {
      if (pendingUploadRuns.get(coupleId) === run) {
        pendingUploadRuns.delete(coupleId);
      }
    });
  pendingUploadRuns.set(coupleId, run);
  return run;
}
