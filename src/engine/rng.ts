/**
 * 決定性 PRNG：mulberry32。
 * 整個引擎的隨機來源只有這一個；禁止 Math.random()。
 */
export interface Rng {
  /** [0, 1) 均勻分佈 */
  next(): number;
  /** 三角分佈：下界 lo、眾數 mode、上界 hi */
  triangular(lo: number, mode: number, hi: number): number;
  /** [lo, hi] 整數均勻 */
  int(lo: number, hi: number): number;
  /** 以機率 p 回傳 true */
  chance(p: number): boolean;
  /** 從陣列抽一個 */
  pick<T>(arr: readonly T[]): T;
  /** 目前內部狀態（除錯用） */
  state(): number;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    triangular(lo, mode, hi) {
      if (hi <= lo) return lo;
      const u = next();
      const fc = (mode - lo) / (hi - lo);
      if (u < fc) return lo + Math.sqrt(u * (hi - lo) * (mode - lo));
      return hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
    },
    int(lo, hi) {
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    chance(p) {
      return next() < p;
    },
    pick(arr) {
      const v = arr[Math.floor(next() * arr.length)];
      if (v === undefined) throw new Error('pick: 空陣列');
      return v;
    },
    state() {
      return a;
    },
  };
}

/** FNV-1a 32-bit，字串 → 無號整數；用於 hash(assumptions)。 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 把兩個 32-bit 整數混成一個（splitmix 風格），用於 hash(assumptions) + seed。 */
export function mix32(a: number, b: number): number {
  let z = (a ^ Math.imul(b, 0x9e3779b9)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}
