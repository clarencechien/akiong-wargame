import { describe, expect, it } from 'vitest';
import { encodeShare, decodeShare } from '../src/engine/share.js';
import { BASELINE } from '../src/engine/assumptions.js';
import type { Assumptions } from '../src/engine/types.js';

describe('分享編碼', () => {
  it('encode → decode 還原假設與 seed', () => {
    const a: Assumptions = { ...BASELINE, month: 12, mainAxis: 'east', auxiliary: 'blockadeFirst', twReserve: 0.8, greyZone: 'mid' };
    const code = encodeShare(a, 0xdeadbeef);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const d = decodeShare(code);
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.assumptions).toEqual(a);
      expect(d.seed).toBe(0xdeadbeef);
    }
  });

  it('舊版引擎的編碼能辨識版本並拒絕', () => {
    const code = encodeShare(BASELINE, 1, 'v0.0.9');
    const d = decodeShare(code);
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.reason).toBe('oldEngine');
      expect(d.engineVersion).toBe('v0.0.9');
    }
  });

  it('亂碼回 badFormat', () => {
    expect(decodeShare('abc').ok).toBe(false);
  });
});
