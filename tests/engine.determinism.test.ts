import { describe, expect, it } from 'vitest';
import { run } from '../src/engine/simulate.js';
import { BASELINE } from '../src/engine/assumptions.js';
import type { Assumptions } from '../src/engine/types.js';

describe('引擎決定性', () => {
  it('同 assumptions + seed 跑兩次，events 深度相等', () => {
    const a = run(BASELINE, 12345);
    const b = run(BASELINE, 12345);
    expect(b.events).toEqual(a.events);
    expect(b.outcome).toEqual(a.outcome);
    expect(b.sampledParams).toEqual(a.sampledParams);
    expect(b.snapshots.length).toBe(a.snapshots.length);
  });

  it('不同 seed 得到不同局', () => {
    const a = run(BASELINE, 1);
    const b = run(BASELINE, 2);
    expect(a.sampledParams).not.toEqual(b.sampledParams);
  });

  it('不同假設、同 seed 得到不同局（hash(assumptions) 進入 PRNG）', () => {
    const a = run(BASELINE, 7);
    const alt: Assumptions = { ...BASELINE, month: 10 };
    const b = run(alt, 7);
    expect(a.sampledParams).not.toEqual(b.sampledParams);
  });

  it('事件 id 連續、時間單調不減', () => {
    const r = run(BASELINE, 99);
    r.events.forEach((e, i) => expect(e.id).toBe(i));
    for (let i = 1; i < r.events.length; i++) {
      const prev = r.events[i - 1]!;
      const cur = r.events[i]!;
      expect(cur.day * 24 + cur.hour).toBeGreaterThanOrEqual(prev.day * 24 + prev.hour);
    }
  });

  it('快照每 6 小時一張，且最後一張是結局', () => {
    const r = run(BASELINE, 3);
    for (const s of r.snapshots.slice(0, -1)) expect(s.hour % 6).toBe(0);
    const last = r.snapshots[r.snapshots.length - 1]!;
    expect(last.day).toBe(r.outcome.endedAt.day);
  });

  it('東岸主攻會標紅', () => {
    const r = run({ ...BASELINE, mainAxis: 'east' }, 1);
    expect(r.flagged).toContain('assumption.mainAxis.east');
    const gateEvent = r.events.find((e) => e.kind === 'gateFailed' || e.kind === 'timeout' || e.kind === 'objectiveReached');
    expect(gateEvent).toBeDefined();
  });
});
