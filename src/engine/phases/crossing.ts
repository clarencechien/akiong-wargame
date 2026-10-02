import type { Ctx } from '../context.js';
import { fmt, pct } from '../context.js';
import { seaOpen } from '../layers/military.js';
import type { GateResult } from './gates.js';

/** 階段 3：渡海（D+4 起）。船團循環在 military 層跑，這裡只管事件與門檻。 */
export function tickCrossing(ctx: Ctx): void {
  const { s, a } = ctx;
  if (s.hour !== 0) return;
  if (a.auxiliary === 'penghu' && !s.flags.has('penghuTaken') && s.day === ctx.k.crossingStartDay + 1) {
    s.flags.add('penghuTaken');
    ctx.emit('military', 'penghuTaken', `澎湖守軍一個旅抵抗 36 小時後，馬公機場易手。代價：第一波運量少了 ${pct(ctx.param('aux.penghu.liftCost'))}，台灣多了兩天確認主攻方向。`, {
      liftCost: ctx.param('aux.penghu.liftCost'),
    });
  }
  if (a.auxiliary === 'eastFeint' && !s.flags.has('eastFeintResolved') && s.day === ctx.k.crossingStartDay) {
    s.flags.add('eastFeintResolved');
    if (ctx.rng.chance(ctx.param('aux.eastFeint.pinProb'))) {
      s.flags.add('eastFeintPinned');
      ctx.emit('military', 'eastFeint', '東岸佯攻船團在花蓮外海現身，花東防衛指揮部一個旅被釘在原地。');
    } else {
      ctx.emit('military', 'eastFeint', '東岸佯攻船團在花蓮外海現身，但守方判定為佯攻，未調動西岸守備。');
    }
  }
}

export function gateCrossing(ctx: Ctx): GateResult | null {
  const { s, k } = ctx;
  const m = s.military;
  const required = k.requiredTroops * 0.7;
  if (m.troopsArrived >= required) {
    return {
      kind: 'pass',
      next: 'landing',
      text: `抵岸兵力 ${fmt(m.troopsArrived)} 人，達到建立灘頭堡的最低需求（${fmt(required)} 人）。灘頭戰開始。`,
    };
  }
  const fleetStrength = m.fleetGroups.reduce((a, g) => a + g.strength, 0) / m.fleetGroups.length;
  const shortfall = 1 - m.troopsArrived / required;
  if (!seaOpen(ctx) && s.hour === 23 && m.weatherWindowDays <= 0) {
    return {
      kind: 'fail',
      gate: 'crossing',
      by: 'windowClosed',
      shortfall,
      text: `海況窗口關閉時只有 ${fmt(m.troopsArrived)} 人上岸（需 ${fmt(required)}）。灘頭上的部隊在風浪中失去補給與增援，守方砲兵開始清理灘頭。`,
    };
  }
  if (fleetStrength < 0.3 && s.hour === 23) {
    return {
      kind: 'fail',
      gate: 'crossing',
      by: 'fleetBroken',
      shortfall,
      text: `船團平均戰力剩 ${pct(fleetStrength)}，已無法集中運量；上岸 ${fmt(m.troopsArrived)} 人（需 ${fmt(required)}）。渡海中止。`,
    };
  }
  if (s.day >= k.crossingStartDay + Math.round(ctx.param('cross.maxDays')) && s.hour === 23) {
    return {
      kind: 'fail',
      gate: 'crossing',
      by: 'tooSlow',
      shortfall,
      text: `渡海 ${Math.round(ctx.param('cross.maxDays'))} 天只送上 ${fmt(m.troopsArrived)} 人（需 ${fmt(required)}），守方縱深部隊已集結完成，兵力無法再集中。`,
    };
  }
  return null;
}
