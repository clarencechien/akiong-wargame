import { signal, computed, effect } from '@preact/signals';
import type { Run } from '../../engine/types.js';
import { run } from '../../engine/simulate.js';
import { batch, runIndex } from '../state.ts';

export type Speed = 1 | 4 | 16;

/** 播放的那一局：依 seed 在主執行緒重算（含快照）。 */
export const currentRun = computed<Run | null>(() => {
  const b = batch.value;
  const r = b?.results[runIndex.value];
  if (!b || !r) return null;
  return run(b.assumptions, r.seed);
});

export const snapIndex = signal(0);
export const playing = signal(false);
export const speed = signal<Speed>(4);

export const currentState = computed(() => {
  const r = currentRun.value;
  if (!r) return null;
  const i = Math.min(snapIndex.value, r.snapshots.length - 1);
  return r.snapshots[i] ?? null;
});

export const atEnd = computed(() => {
  const r = currentRun.value;
  return !r || snapIndex.value >= r.snapshots.length - 1;
});

/** 目前時刻（小時數）以前的事件 */
export const visibleEvents = computed(() => {
  const r = currentRun.value;
  const s = currentState.value;
  if (!r || !s) return [];
  const now = s.day * 24 + s.hour;
  return r.events.filter((e) => e.day * 24 + e.hour <= now);
});

export function resetPlayback(): void {
  snapIndex.value = 0;
  playing.value = false;
}

export function jumpToEnd(): void {
  const r = currentRun.value;
  if (r) snapIndex.value = r.snapshots.length - 1;
  playing.value = false;
}

export function cycleSpeed(): void {
  speed.value = speed.value === 1 ? 4 : speed.value === 4 ? 16 : 1;
}

// 計時器：×1 = 每秒 2 張快照（12 模型小時）
let timer: ReturnType<typeof setInterval> | null = null;
effect(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (!playing.value) return;
  const ms = 1000 / (2 * speed.value);
  timer = setInterval(() => {
    const r = currentRun.peek();
    if (!r) return;
    if (snapIndex.peek() >= r.snapshots.length - 1) {
      playing.value = false;
      return;
    }
    snapIndex.value = snapIndex.peek() + 1;
  }, ms);
});

// 換局就回到開頭
effect(() => {
  void runIndex.value;
  void batch.value;
  snapIndex.value = 0;
  playing.value = false;
});
