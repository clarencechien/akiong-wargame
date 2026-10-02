import { describe, expect, it } from 'vitest';
import { run } from '../src/engine/simulate.js';
import { BASELINE } from '../src/engine/assumptions.js';

describe('效能預算', () => {
  it('單場（含快照）< 1 s（CI 放寬到 2 s）', () => {
    run(BASELINE, 1); // 暖機
    const t0 = performance.now();
    run(BASELINE, 2);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(process.env.CI ? 2000 : 1000);
  });

  it('100 場（不含快照）< 10 s', () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) run(BASELINE, 100 + i, { snapshots: false });
    expect(performance.now() - t0).toBeLessThan(10_000);
  });
});
