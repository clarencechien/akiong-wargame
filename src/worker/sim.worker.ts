/**
 * 模擬 Worker：收到 { assumptions, seeds } 後逐場跑 run()，每場回報進度，最後回傳結果。
 * 不保留快照（播放時主執行緒依 seed 重算，引擎決定性保證一致）。
 */
import { run } from '../engine/simulate.js';
import type { Assumptions, Event, Outcome } from '../engine/types.js';

export interface WorkerRequest {
  type: 'run';
  jobId: number;
  assumptions: Assumptions;
  seeds: number[];
  keepEvents: boolean;
}
export interface WorkerResult {
  seed: number;
  outcome: Outcome;
  events?: Event[];
  flagged: string[];
}
export type WorkerResponse =
  | { type: 'progress'; jobId: number; done: number }
  | { type: 'result'; jobId: number; results: WorkerResult[] }
  | { type: 'error'; jobId: number; message: string };

const scope = self as unknown as { postMessage(m: WorkerResponse): void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== 'run') return;
  try {
    const results: WorkerResult[] = [];
    let lastReport = performance.now();
    for (let i = 0; i < msg.seeds.length; i++) {
      const seed = msg.seeds[i]!;
      const r = run(msg.assumptions, seed, { snapshots: false });
      const item: WorkerResult = { seed, outcome: r.outcome, flagged: r.flagged };
      if (msg.keepEvents) item.events = r.events;
      results.push(item);
      const now = performance.now();
      if (now - lastReport > 50 || i === msg.seeds.length - 1) {
        scope.postMessage({ type: 'progress', jobId: msg.jobId, done: i + 1 });
        lastReport = now;
      }
    }
    scope.postMessage({ type: 'result', jobId: msg.jobId, results });
  } catch (err) {
    scope.postMessage({ type: 'error', jobId: msg.jobId, message: err instanceof Error ? err.message : String(err) });
  }
};
