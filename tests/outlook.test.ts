import { describe, expect, it } from 'vitest';
import { run } from '../src/engine/simulate.ts';
import { BASELINE } from '../src/engine/assumptions.ts';
import { outlook } from '../src/narrative/outlook.ts';
import { verdict } from '../src/narrative/verdict.ts';
import { fill } from '../src/narrative/chapter.ts';
import { mulberry32 } from '../src/engine/rng.ts';

describe('第三十一天之後（D+30 外推）', () => {
  it('撐到 D+30 的局，結局會說岸上的人怎麼了；其他結局回傳 null', () => {
    let found = 0;
    for (let seed = 1; seed <= 400 && found < 3; seed++) {
      const r = run({ ...BASELINE, us: 'none', scale: 'full' }, seed, { snapshots: true });
      const ol = outlook(r);
      if (r.outcome.reason === 'timeout' && r.outcome.failedBy === 'day30') {
        found++;
        expect(ol).not.toBeNull();
        if (r.outcome.beachhead) {
          expect(ol!.text).toMatch(/灘頭上還有/);
          expect(ol!.daysToDepleted).toBeGreaterThanOrEqual(0);
          expect(ol!.dailyAttrition).toBeGreaterThan(0);
        }
        const v = verdict(r);
        expect(v.detail).toContain(ol!.text);
        const last = r.events[r.events.length - 1]!;
        expect(last.kind).toBe('timeout');
        expect(last.text).toMatch(/史料到此為止/);
      } else {
        expect(ol).toBeNull();
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('fill：行內替換 {{甲|乙}}', () => {
  it('沒給 rng 取第一個；給了 rng 依 seed 決定，且同 seed 同結果', () => {
    const t = '{{天還沒亮|凌晨四點}}，{who}出門{{了|去了}}。';
    expect(fill(t, { who: '他' })).toBe('天還沒亮，他出門了。');
    const a = fill(t, { who: '他' }, mulberry32(7));
    const b = fill(t, { who: '他' }, mulberry32(7));
    expect(a).toBe(b);
    expect(a).not.toContain('{{');
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) seen.add(fill(t, { who: '他' }, mulberry32(s)));
    expect(seen.size).toBeGreaterThan(1);
  });
  it('巢狀也解得開', () => {
    expect(fill('{{{{甲|乙}}丙|丁}}', {})).toBe('甲丙');
  });
});
