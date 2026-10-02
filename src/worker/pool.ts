/**
 * Worker pool：依 navigator.hardwareConcurrency 開 worker，把 seeds 輪流分配，彙總進度與結果。
 * 主執行緒只做播放。
 */
import type { Assumptions } from '../engine/types.js';
import type { WorkerRequest, WorkerResponse, WorkerResult } from './sim.worker.js';

export interface BatchResult {
  assumptions: Assumptions;
  results: WorkerResult[]; // 依 seed 順序
  ms: number;
  workers: number;
}

export function poolSize(): number {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(8, n));
}

export function runBatch(
  assumptions: Assumptions,
  seeds: number[],
  onProgress: (done: number, total: number) => void,
  opts: { keepEvents?: boolean; workers?: number } = {},
): Promise<BatchResult> {
  const total = seeds.length;
  const workers = Math.min(opts.workers ?? poolSize(), Math.max(1, total));
  const t0 = performance.now();
  const chunks: number[][] = Array.from({ length: workers }, () => []);
  seeds.forEach((s, i) => chunks[i % workers]!.push(s));
  const doneByWorker = new Array<number>(workers).fill(0);
  const collected: WorkerResult[] = [];

  return new Promise((resolve, reject) => {
    let finished = 0;
    chunks.forEach((chunk, wi) => {
      const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      const jobId = wi;
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (m.jobId !== jobId) return;
        if (m.type === 'progress') {
          doneByWorker[wi] = m.done;
          onProgress(doneByWorker.reduce((a, b) => a + b, 0), total);
        } else if (m.type === 'result') {
          collected.push(...m.results);
          w.terminate();
          finished++;
          if (finished === workers) {
            collected.sort((a, b) => a.seed - b.seed);
            resolve({ assumptions, results: collected, ms: performance.now() - t0, workers });
          }
        } else {
          w.terminate();
          reject(new Error(m.message));
        }
      };
      w.onerror = (ev) => {
        w.terminate();
        reject(new Error(ev.message));
      };
      const req: WorkerRequest = { type: 'run', jobId, assumptions, seeds: chunk, keepEvents: opts.keepEvents ?? false };
      w.postMessage(req);
    });
  });
}
