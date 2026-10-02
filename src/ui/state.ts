import { signal, computed } from '@preact/signals';
import type { Assumptions } from '../engine/types.js';
import { BASELINE } from '../engine/assumptions.js';
import type { BatchResult } from '../worker/pool.js';

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

export const currentResult = computed(() => batch.value?.results[runIndex.value] ?? null);

export function setAssumption<K extends keyof Assumptions>(key: K, value: Assumptions[K]): void {
  assumptions.value = { ...assumptions.value, [key]: value };
}
