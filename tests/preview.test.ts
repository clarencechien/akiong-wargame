import { describe, expect, it } from 'vitest';
import { preview, intelSlots, fillSlots } from '../src/engine/preview.js';
import { BASELINE } from '../src/engine/assumptions.js';
import intelNotes from '../data/intel-notes.json';

describe('開局前評估與情報評估', () => {
  it('基準假設：被提前發現為負日、4 月窗口比 8 月長、先取澎湖扣運量', () => {
    const p = preview(BASELINE);
    expect(p.detectedDay).toBeLessThan(0);
    expect(p.windowDays).toBeGreaterThan(preview({ ...BASELINE, month: 8 }).windowDays);
    expect(p.auxLiftCost).toBeCloseTo(0.18, 2);
    expect(p.liftCapacity).toBeLessThan(p.liftCapacityRaw);
    expect(p.flagged).toEqual([]);
    expect(preview({ ...BASELINE, mainAxis: 'east' }).supplyable).toBe(false);
  });

  it('每個假設的每個選項都有情報評估文案，且槽位都填得掉、每則 ≤ 60 字', () => {
    const notes = intelNotes as unknown as Record<string, Record<string, string>>;
    const options: Record<string, string[]> = {
      month: Array.from({ length: 12 }, (_, i) => String(i + 1)),
      scale: ['raid', 'medium', 'full'],
      us: ['none', 'delayed', 'immediate'],
      japan: ['neutral', 'bases', 'belligerent'],
      twReserve: ['0.3', '0.55', '0.8'],
      econTolerance: ['low', 'high'],
      mainAxis: ['north', 'central', 'south', 'east'],
      auxiliary: ['none', 'penghu', 'eastFeint', 'blockadeFirst'],
    };
    const slots = intelSlots(BASELINE);
    for (const [k, vals] of Object.entries(options)) {
      for (const v of vals) {
        const t = notes[k]?.[v];
        expect(t, `${k}.${v} 缺文案`).toBeTruthy();
        const filled = fillSlots(t!, slots);
        expect(filled, `${k}.${v} 有未填槽位`).not.toMatch(/\{\w+\}/);
        expect(filled.length, `${k}.${v} 超過 60 字：${filled}`).toBeLessThanOrEqual(60);
      }
    }
  });
});
