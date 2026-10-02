import { describe, expect, it } from 'vitest';
import { PARAM_DEFS } from '../src/engine/params.js';
import { GEO } from '../src/engine/geography.js';

describe('參數庫格式', () => {
  it('每筆都有 source 與 range，value 在 range 內，id 不重複', () => {
    const ids = new Set<string>();
    for (const p of PARAM_DEFS) {
      expect(ids.has(p.id), `重複 id：${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.source.trim().length, `缺 source：${p.id}`).toBeGreaterThan(0);
      expect(p.source, `source 不可寫「同上」：${p.id}`).not.toBe('同上');
      expect(p.range).toHaveLength(2);
      expect(p.range[0]).toBeLessThanOrEqual(p.range[1]);
      expect(p.value).toBeGreaterThanOrEqual(p.range[0]);
      expect(p.value).toBeLessThanOrEqual(p.range[1]);
      expect(typeof p.assumption).toBe('boolean');
    }
  });

  it('HANDOFF §5.1 九個參數群都有', () => {
    const groups = new Set(PARAM_DEFS.map((p) => p.id.split('.')[0]));
    for (const g of ['weather', 'lift', 'detect', 'fire', 'cross', 'beach', 'regional', 'world', 'home']) {
      expect(groups.has(g), `缺參數群：${g}`).toBe(true);
    }
  });

  it('地理：西岸灘頭與東岸灘頭都有，東岸不可補給', () => {
    expect(GEO.beaches.filter((b) => b.coast === 'west').length).toBeGreaterThanOrEqual(10);
    expect(GEO.beaches.filter((b) => b.coast === 'east').length).toBeGreaterThanOrEqual(3);
    for (const b of GEO.beaches.filter((b) => b.region === 'east')) expect(b.supplyable).toBe(false);
  });
});
