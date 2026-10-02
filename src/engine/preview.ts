/**
 * 開局前評估（作戰室右欄）：由 derive + initialState 直接算，不跑模擬、不抽樣（參數全取眾數）。
 * 也提供情報評估文案的槽位值。
 */
import type { Assumptions } from './types.js';
import { modeParams, P } from './params.js';
import { derive, flaggedAssumptions } from './assumptions.js';
import { GEO, beachesOf } from './geography.js';
import type { Rng } from './rng.js';

/** 不抽樣的假 rng：chance 永遠 false、int 取下界。 */
const NO_RNG: Rng = {
  next: () => 0,
  triangular: (_lo, mode) => mode,
  int: (lo) => lo,
  chance: () => false,
  pick: (arr) => arr[0]!,
  state: () => 0,
};

export interface Preview {
  detectedDay: number; // 負數
  assemblyDays: number;
  windowDays: number;
  typhoonProb: number;
  liftCapacity: number; // 已扣輔助作戰
  liftCapacityRaw: number; // 未扣
  auxLiftCost: number;
  beachesWest: number;
  beachesEast: number;
  beachCount: number; // 主攻區代表灘頭
  regularBrigades: number;
  regionalBrigades: number;
  reserveBrigades: number;
  supplyable: boolean;
  usEntryDay: number | null;
  sortieCoef: number;
  homefrontPressureDay: number; // 沿海停工達 10% 的預估日（可能為負：集結期就浮現）
  flagged: string[];
}

export function preview(a: Assumptions): Preview {
  const p = modeParams();
  const k = derive(a, p, NO_RNG);
  const liftCapacityRaw = Math.round(k.liftCapacity / (1 - k.auxLiftCost));
  let rate = P(p, 'home.shutdownRatePerDay');
  if (a.econTolerance === 'high') rate *= P(p, 'home.shutdownHighTolMult');
  // 停工達 10% 的預估日：被辨識後以 0.3 倍速累積，開戰後全速（與 layers/homefront.ts 一致）
  const preRate = rate * 0.3;
  const preWar = -k.detectedDay * preRate;
  const homefrontPressureDay = preWar >= 0.1 ? k.detectedDay + Math.ceil(0.1 / preRate) : Math.ceil((0.1 - preWar) / rate);
  return {
    detectedDay: k.detectedDay,
    assemblyDays: k.assemblyDays,
    windowDays: k.windowDays,
    typhoonProb: P(p, `weather.typhoonProb.m${a.month}`),
    liftCapacity: k.liftCapacity,
    liftCapacityRaw,
    auxLiftCost: k.auxLiftCost,
    beachesWest: GEO.beaches.filter((b) => b.coast === 'west').length,
    beachesEast: GEO.beaches.filter((b) => b.coast === 'east').length,
    beachCount: k.beachCount,
    regularBrigades: k.regularBrigades,
    regionalBrigades: k.regionalBrigades,
    reserveBrigades: k.reserveBrigades,
    supplyable: k.supplyable,
    usEntryDay: k.usEntryDay,
    sortieCoef: k.sortieCoef,
    homefrontPressureDay,
    flagged: flaggedAssumptions(a),
  };
}

/** 情報評估文案的槽位值（給 intel-notes.json 的 {slot} 用）。 */
export function intelSlots(a: Assumptions): Record<string, string> {
  const p = modeParams();
  const pv = preview(a);
  const beaches = beachesOf(a.mainAxis);
  return {
    windowDays: String(pv.windowDays),
    typhoonPct: `${Math.round(pv.typhoonProb * 100)}%`,
    leadDays: String(-pv.detectedDay),
    assemblyWeeks: String(Math.round(pv.assemblyDays / 7)),
    liftCapacity: fmtWan(pv.liftCapacity),
    liftCapacityRaw: fmtWan(pv.liftCapacityRaw),
    penghuCost: `${Math.round(P(p, 'aux.penghu.liftCost') * 100)}%`,
    feintCost: `${Math.round(P(p, 'aux.eastFeint.liftCost') * 100)}%`,
    usEntryDay: pv.usEntryDay === null ? '—' : `D+${pv.usEntryDay}`,
    sortiePct: `${Math.round(pv.sortieCoef * 100)}%`,
    neutralDropPct: `${Math.round((1 - P(p, 'regional.japanSortieCoef.neutral')) * 100)}%`,
    reservePct: `${Math.round(a.twReserve * 100)}%`,
    reserveBrigades: String(pv.reserveBrigades),
    regularBrigades: String(pv.regularBrigades + pv.regionalBrigades),
    beachNames: beaches.slice(0, 2).map((b) => b.name).join('、'),
    beachesWest: String(pv.beachesWest),
    beachesEast: String(pv.beachesEast),
    homefrontDay: pv.homefrontPressureDay < 0 ? `D${pv.homefrontPressureDay}` : `D+${pv.homefrontPressureDay}`,
    requiredTroops: fmtWan(P(p, 'beach.requiredTroops')),
  };
}

function fmtWan(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')} 萬`;
  return n.toLocaleString('zh-Hant-TW');
}

export function fillSlots(text: string, slots: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);
}
