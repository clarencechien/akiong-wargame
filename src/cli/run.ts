/**
 * CLI：跑 N 場印分佈。
 *   npm run sim -- --n 1000 --seed 1 [--month 4 --scale medium --us delayed --japan bases --reserve 0.55 --econ high --axis north --aux penghu] [--json] [--events]
 */
import { parseArgs } from 'node:util';
import { run } from '../engine/simulate.js';
import { BASELINE } from '../engine/assumptions.js';
import type { Assumptions, Run } from '../engine/types.js';
import { GATE_LABEL } from '../engine/phases/gates.js';

const { values } = parseArgs({
  options: {
    n: { type: 'string', default: '1000' },
    seed: { type: 'string', default: '1' },
    month: { type: 'string' },
    scale: { type: 'string' },
    us: { type: 'string' },
    japan: { type: 'string' },
    reserve: { type: 'string' },
    econ: { type: 'string' },
    axis: { type: 'string' },
    aux: { type: 'string' },
    json: { type: 'boolean', default: false },
    events: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
  },
});

const a: Assumptions = { ...BASELINE };
if (values.month) a.month = Number(values.month) as Assumptions['month'];
if (values.scale) a.scale = values.scale as Assumptions['scale'];
if (values.us) a.us = values.us as Assumptions['us'];
if (values.japan) a.japan = values.japan as Assumptions['japan'];
if (values.reserve) a.twReserve = Number(values.reserve) as Assumptions['twReserve'];
if (values.econ) a.econTolerance = values.econ as Assumptions['econTolerance'];
if (values.axis) a.mainAxis = values.axis as Assumptions['mainAxis'];
if (values.aux) a.auxiliary = values.aux as Assumptions['auxiliary'];

const n = Number(values.n);
const seed0 = Number(values.seed);

if (values.events) {
  const r = run(a, seed0);
  for (const e of r.events) {
    const d = e.day < 0 ? `D${e.day}` : `D+${e.day}`;
    console.log(`${d.padStart(5)} ${String(e.hour).padStart(2, '0')}:00 [${e.layer}] ${e.kind}: ${e.text}`);
  }
  console.log('\noutcome:', JSON.stringify(r.outcome));
  process.exit(0);
}

export interface Summary {
  n: number;
  beachheadRate: number;
  solidBeachheadRate: number;
  objectiveRate: number;
  medianEndDay: number;
  p10EndDay: number;
  p90EndDay: number;
  byPhase: Record<string, number>;
  byReason: Record<string, number>;
  byFailedBy: Record<string, number>;
  histogram: Record<number, number>;
  meanFleetLoss: number;
  msPerRun: number;
}

export function summarize(runs: Pick<Run, 'outcome'>[], ms: number): Summary {
  const days = runs.map((r) => r.outcome.endedAt.day).sort((x, y) => x - y);
  const q = (p: number) => days[Math.min(days.length - 1, Math.floor(p * days.length))] ?? 0;
  const count = <T extends string | number>(f: (r: Pick<Run, 'outcome'>) => T): Record<T, number> => {
    const out = {} as Record<T, number>;
    for (const r of runs) {
      const key = f(r);
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  };
  return {
    n: runs.length,
    beachheadRate: runs.filter((r) => r.outcome.beachhead).length / runs.length,
    solidBeachheadRate: runs.filter((r) => r.outcome.solidBeachhead).length / runs.length,
    objectiveRate: runs.filter((r) => r.outcome.reason === 'objectiveReached').length / runs.length,
    medianEndDay: q(0.5),
    p10EndDay: q(0.1),
    p90EndDay: q(0.9),
    byPhase: count((r) => r.outcome.endedAt.phase),
    byReason: count((r) => r.outcome.reason),
    byFailedBy: count((r) => `${r.outcome.endedAt.phase}/${r.outcome.failedBy ?? r.outcome.reason}`),
    histogram: count((r) => r.outcome.endedAt.day),
    meanFleetLoss: runs.reduce((s, r) => s + r.outcome.fleetLoss, 0) / runs.length,
    msPerRun: ms / runs.length,
  };
}

const t0 = performance.now();
const runs: Pick<Run, 'outcome'>[] = [];
for (let i = 0; i < n; i++) {
  const r = run(a, seed0 + i, { snapshots: false });
  runs.push({ outcome: r.outcome });
}
const ms = performance.now() - t0;
const sum = summarize(runs, ms);

if (values.json) {
  console.log(JSON.stringify({ assumptions: a, summary: sum }, null, 2));
} else {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`假設：${JSON.stringify(a)}`);
  console.log(`場數：${n}　seed 起點：${seed0}　每場 ${sum.msPerRun.toFixed(2)} ms`);
  console.log('');
  console.log(`登陸成功（灘頭堡存活 48 小時且第二波卸載）：${pct(sum.beachheadRate)}　（驗收 ≥ 40% 且高於穩固灘頭堡）`);
  console.log(`穩固灘頭堡（補給 ≥ 3 天且兵力 ≥ 所需）：${pct(sum.solidBeachheadRate)}　（驗收 5–30%，ADR-0001）`);
  console.log(`30 天內達成戰略目標：${pct(sum.objectiveRate)}　（驗收 < 10%）`);
  console.log(`終止日中位數：D+${sum.medianEndDay}　P10 D+${sum.p10EndDay}　P90 D+${sum.p90EndDay}　（驗收中位 D+8 到 D+14）`);
  console.log(`平均船團損失：${pct(sum.meanFleetLoss)}`);
  console.log('');
  console.log('止於階段：');
  for (const ph of ['mobilize', 'strike', 'crossing', 'landing', 'inland'] as const) {
    const c = sum.byPhase[ph] ?? 0;
    console.log(`  ${ph.padEnd(9)} ${String(c).padStart(5)}  ${pct(c / n).padStart(6)}  門檻：${GATE_LABEL[ph]}`);
  }
  console.log('原因：');
  for (const [k, c] of Object.entries(sum.byFailedBy).sort((x, y) => y[1] - x[1])) {
    console.log(`  ${k.padEnd(28)} ${String(c).padStart(5)}  ${pct(c / n).padStart(6)}`);
  }
  console.log('終止日直方圖：');
  const maxC = Math.max(...Object.values(sum.histogram));
  for (const [d, c] of Object.entries(sum.histogram).sort((x, y) => Number(x[0]) - Number(y[0]))) {
    const bar = '█'.repeat(Math.round((c / maxC) * 40));
    console.log(`  ${(Number(d) < 0 ? `D${d}` : `D+${d}`).padStart(5)} ${String(c).padStart(5)} ${bar}`);
  }
  const ok1 = sum.solidBeachheadRate >= 0.05 && sum.solidBeachheadRate <= 0.3;
  const ok1b = sum.beachheadRate >= 0.4 && sum.beachheadRate > sum.solidBeachheadRate;
  const ok2 = sum.objectiveRate < 0.1;
  const ok3 = sum.medianEndDay >= 8 && sum.medianEndDay <= 14;
  console.log('');
  console.log(`§5.2 驗收：穩固灘頭堡 ${ok1 ? '✓' : '✗'}　登陸成功 ${ok1b ? '✓' : '✗'}　目標 ${ok2 ? '✓' : '✗'}　中位日 ${ok3 ? '✓' : '✗'}`);
  if (!values.quiet) process.exitCode = ok1 && ok1b && ok2 && ok3 ? 0 : 1;
}
