/**
 * 本機存檔（IndexedDB）：已跑過的局 = assumptions + seeds + 結果摘要。不存事件簿，不上傳。
 * 失敗（隱私模式、配額）一律靜默，功能照常。
 */
import type { Assumptions, Outcome } from '../engine/types.js';

export interface SavedBatch {
  id?: number;
  at: number; // epoch ms
  engineVersion: string;
  assumptions: Assumptions;
  seeds: number[];
  summary: {
    n: number;
    landed: number;
    solid: number;
    objective: number;
    medianDay: number;
  };
}

const DB = 'akiong-wargame';
const STORE = 'batches';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function summarize(outcomes: Outcome[]): SavedBatch['summary'] {
  const days = outcomes.map((o) => o.endedAt.day).sort((a, b) => a - b);
  return {
    n: outcomes.length,
    landed: outcomes.filter((o) => o.beachhead).length,
    solid: outcomes.filter((o) => o.solidBeachhead).length,
    objective: outcomes.filter((o) => o.reason === 'objectiveReached').length,
    medianDay: days[Math.floor(days.length / 2)] ?? 0,
  };
}

export async function saveBatch(b: Omit<SavedBatch, 'id'>): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(b);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export async function listBatches(limit = 8): Promise<SavedBatch[]> {
  const db = await open();
  if (!db) return [];
  const rows = await new Promise<SavedBatch[]>((resolve) => {
    try {
      const out: SavedBatch[] = [];
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor(null, 'prev');
      req.onsuccess = () => {
        const c = req.result;
        if (c && out.length < limit) {
          out.push(c.value as SavedBatch);
          c.continue();
        } else resolve(out);
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve([]);
    }
  });
  db.close();
  return rows;
}

export async function clearBatches(): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}
