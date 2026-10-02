import { describe, expect, it } from 'vitest';
import { run } from '../src/engine/simulate.js';
import { BASELINE } from '../src/engine/assumptions.js';
import { gateInfo, PHASE_ORDER } from '../src/engine/gateinfo.js';

describe('下一道門檻資訊', () => {
  it('每張快照都算得出門檻，進度在 0..1，階段只往前', () => {
    const r = run(BASELINE, 11);
    let last = -1;
    for (const s of r.snapshots) {
      const g = gateInfo(r, s);
      expect(g.phase).toBe(s.phase);
      expect(g.progress).toBeGreaterThanOrEqual(0);
      expect(g.progress).toBeLessThanOrEqual(1);
      expect(g.text.length).toBeGreaterThan(10);
      const i = PHASE_ORDER.indexOf(s.phase);
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });
});
