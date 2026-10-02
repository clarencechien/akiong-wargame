import { describe, expect, it } from 'vitest';
import { run } from '../src/engine/simulate.js';
import { BASELINE } from '../src/engine/assumptions.js';
import type { Outcome } from '../src/engine/types.js';
import { derive } from '../src/engine/assumptions.js';
import { sampleParams } from '../src/engine/params.js';
import { mulberry32 } from '../src/engine/rng.js';

/**
 * HANDOFF §5.2 分佈校準（2026-10-02 版，ADR-0001）。基準假設跑 1,000 場：
 *   - 穩固灘頭堡比例 5–30%（補給 ≥ 3 天且兵力 ≥ 所需；對應 CSIS「solid beachhead」）
 *   - 登陸成功比例 ≥ 40% 且高於穩固灘頭堡比例
 *   - 30 天內達成戰略目標 < 10%
 *   - 中位終止日 D+8 到 D+14
 * 不在範圍 → 回 docs/model.md §4 校準紀錄補機制或修參數，不調係數。
 */
const N = 1000;

function runMany(): Outcome[] {
  const out: Outcome[] = [];
  for (let i = 0; i < N; i++) out.push(run(BASELINE, 1 + i, { snapshots: false }).outcome);
  return out;
}

describe('分佈校準（HANDOFF §5.2，基準假設 1,000 場）', () => {
  const outcomes = runMany();
  const rate = (f: (o: Outcome) => boolean) => outcomes.filter(f).length / outcomes.length;
  const days = outcomes.map((o) => o.endedAt.day).sort((a, b) => a - b);
  const median = days[Math.floor(days.length / 2)]!;
  const landed = rate((o) => o.beachhead);
  const solid = rate((o) => o.solidBeachhead);

  it('穩固灘頭堡比例落在 5–30%', () => {
    expect(solid).toBeGreaterThanOrEqual(0.05);
    expect(solid).toBeLessThanOrEqual(0.3);
  });

  it('登陸成功比例 ≥ 40% 且高於穩固灘頭堡比例：失敗主因是維持不了，不是上不了岸', () => {
    expect(landed).toBeGreaterThanOrEqual(0.4);
    expect(landed).toBeGreaterThan(solid);
  });

  it('30 天內達成戰略目標比例 < 10%', () => {
    expect(rate((o) => o.reason === 'objectiveReached')).toBeLessThan(0.1);
  });

  it('中位終止日落在 D+8 到 D+14', () => {
    expect(median).toBeGreaterThanOrEqual(8);
    expect(median).toBeLessThanOrEqual(14);
  });

  it('基準局最大宗以船團被擊沉收場（CSIS 2023 p.84–87 的機制）', () => {
    const fleetBroken = rate((o) => o.failedBy === 'fleetBroken');
    const counts = outcomes.reduce<Record<string, number>>((acc, o) => {
      const k = o.failedBy ?? o.reason;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    for (const [k, c] of Object.entries(counts)) if (k !== 'fleetBroken') expect(fleetBroken).toBeGreaterThan(c / outcomes.length);
    expect(fleetBroken).toBeGreaterThan(0.35);
  });
});

describe('假設的方向性（手測項目自動化）', () => {
  const n = 300;
  const stat = (a: Parameters<typeof run>[0]) => {
    const os: Outcome[] = [];
    for (let i = 0; i < n; i++) os.push(run(a, 1 + i, { snapshots: false }).outcome);
    return {
      solid: os.filter((o) => o.solidBeachhead).length / n,
      landed: os.filter((o) => o.beachhead).length / n,
      windowClosed: os.filter((o) => o.failedBy === 'windowClosed').length / n,
      objective: os.filter((o) => o.reason === 'objectiveReached').length / n,
    };
  };

  it('8 月的登陸成功率遠低於 4 月（颱風季 + 海況）', () => {
    expect(stat({ ...BASELINE, month: 8 }).landed).toBeLessThan(stat(BASELINE).landed * 0.3);
  });

  it('美軍立即介入時穩固灘頭堡比例低於延遲介入；不介入時高於延遲介入', () => {
    const base = stat(BASELINE).solid;
    expect(stat({ ...BASELINE, us: 'immediate' }).solid).toBeLessThan(base);
    expect(stat({ ...BASELINE, us: 'none' }).solid).toBeGreaterThan(base);
  });

  it('美軍不介入也不到五成能在 30 天內達成戰略目標', () => {
    expect(stat({ ...BASELINE, us: 'none' }).objective).toBeLessThan(0.5);
  });

  it('偷襲型動員的登陸成功率低於中型', () => {
    expect(stat({ ...BASELINE, scale: 'raid' }).landed).toBeLessThan(stat(BASELINE).landed);
  });

  it('12 月的登陸成功率遠低於 4 月（一年兩度的時機）', () => {
    expect(stat({ ...BASELINE, month: 12 }).landed).toBeLessThan(stat(BASELINE).landed * 0.3);
  });

  it('東岸主攻永遠無法達成戰略目標（不可補給）', () => {
    expect(stat({ ...BASELINE, mainAxis: 'east' }).objective).toBe(0);
  });

  it('先取澎湖使第一波運量比不取少 12–25%（參數 range）', () => {
    const rng = mulberry32(42);
    const p = sampleParams(rng);
    const none = derive({ ...BASELINE, auxiliary: 'none' }, p, mulberry32(1));
    const penghu = derive({ ...BASELINE, auxiliary: 'penghu' }, p, mulberry32(1));
    const ratio = penghu.liftCapacity / none.liftCapacity;
    expect(ratio).toBeGreaterThanOrEqual(0.75);
    expect(ratio).toBeLessThanOrEqual(0.88);
    expect(Math.abs(1 - ratio - p['aux.penghu.liftCost']!)).toBeLessThan(0.01);
  });
});
