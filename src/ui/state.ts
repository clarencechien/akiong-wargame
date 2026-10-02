import { signal, computed } from '@preact/signals';
import type { Assumptions } from '../engine/types.js';
import { BASELINE } from '../engine/assumptions.js';
import type { BatchResult } from '../worker/pool.js';
import { listBatches, type SavedBatch } from '../store/db.js';

export type Screen = 'warroom' | 'situation' | 'chronicle' | 'sources';

export const isMobile = (): boolean => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;

export const screen = signal<Screen>('warroom');
export const assumptions = signal<Assumptions>({ ...BASELINE });
export const runCount = signal<1 | 10 | 100>(isMobile() ? 10 : 100);
export const running = signal(false);
export const progress = signal<{ done: number; total: number } | null>(null);
export const batch = signal<BatchResult | null>(null);
export const runIndex = signal(0);
export const error = signal<string | null>(null);
/** 玩家最後改的假設（分享卡標題用：「我以為問題是…」） */
export const lastChanged = signal<keyof Assumptions | null>(null);

export const currentResult = computed(() => batch.value?.results[runIndex.value] ?? null);

export function setAssumption<K extends keyof Assumptions>(key: K, value: Assumptions[K]): void {
  if (assumptions.value[key] !== value) lastChanged.value = key;
  assumptions.value = { ...assumptions.value, [key]: value };
}

/** 本機存檔裡最近跑過的局（null = 尚未讀取） */
export const recent = signal<SavedBatch[] | null>(null);
export async function loadRecent(): Promise<void> {
  recent.value = await listBatches(6);
}
