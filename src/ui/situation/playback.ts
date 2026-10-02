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

/** 進戰情室自動播放（×4）；換局也重播 */
export const autoplay = signal(true);
let autoplayTimer: ReturnType<typeof setTimeout> | null = null;
effect(() => {
  void runIndex.value;
  void batch.value;
  snapIndex.value = 0;
  playing.value = false;
  if (autoplayTimer) clearTimeout(autoplayTimer);
  if (autoplay.peek() && currentRun.peek()) {
    autoplayTimer = setTimeout(() => {
      if (snapIndex.peek() === 0 && !playing.peek()) playing.value = true;
    }, 1200);
  }
});

/** 覆蓋在地圖上的大字：階段切換、D 日、結局 */
export const banner = computed<{ title: string; sub: string; kind: 'phase' | 'end' } | null>(() => {
  const r = currentRun.value;
  const s = currentState.value;
  if (!r || !s) return null;
  if (atEnd.value) return { title: '結局', sub: '', kind: 'end' };
  const now = s.day * 24 + s.hour;
  // 最近 12 小時內的階段切換
  const ev = [...r.events].reverse().find((e) => (e.kind === 'phaseAdvance' || e.kind === 'start') && now - (e.day * 24 + e.hour) >= 0 && now - (e.day * 24 + e.hour) < 12);
  if (!ev) return null;
  const to = String(ev.data?.['to'] ?? 'mobilize');
  const titles: Record<string, [string, string]> = {
    mobilize: ['集結令下達', '船團開始集結，任何人都看得見'],
    strike: ['D 日', '火箭軍開火，三天內要壓制岸置飛彈'],
    crossing: ['船團出港', '渡海開始，天氣與飛彈都在等'],
    landing: ['搶灘', '四十八小時，第二波要跟上'],
    inland: ['灘頭堡站住了', '補給線要連續七天不斷'],
  };
  const t = titles[to] ?? titles['mobilize']!;
  return { title: t[0], sub: t[1], kind: 'phase' };
});
