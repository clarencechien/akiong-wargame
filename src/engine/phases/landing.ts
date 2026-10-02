import type { Ctx } from '../context.js';
import { fmt, pct } from '../context.js';
import { defenderStrength } from '../layers/military.js';
import type { GateResult } from './gates.js';

/** 階段 4：搶灘與灘頭堡。進入時設定守方戰力並記錄起始小時。 */
export function enterLanding(ctx: Ctx): void {
  const { s } = ctx;
  s.military.defenderStrength = defenderStrength(ctx);
  s.military.arrivedAtLandingStart = s.military.troopsArrived;
  s.flags.add(`landingStart:${s.day * 24 + s.hour}`);
  ctx.emit('military', 'landingStart', `${ctx.k.regularBrigades} 個守備旅與陸續到位的後備旅在灘頭後方展開，守方有效戰力約 ${fmt(s.military.defenderStrength)} 人當量。`, {
    defenderStrength: Math.round(s.military.defenderStrength),
    troopsAshore: Math.round(s.military.troopsAshore),
  });
}

export function landingStartHour(ctx: Ctx): number {
  for (const f of ctx.s.flags) {
    if (f.startsWith('landingStart:')) return Number(f.slice('landingStart:'.length));
  }
  return Number.POSITIVE_INFINITY;
}

export function tickLanding(ctx: Ctx): void {
  // 灘頭戰交換在 military 層；這裡不另做事
  void ctx;
}

export function gateLanding(ctx: Ctx): GateResult | null {
  const { s, k } = ctx;
  const m = s.military;
  const nowHour = s.day * 24 + s.hour;
  const elapsed = nowHour - landingStartHour(ctx);
  const holdHours = ctx.param('beach.holdHours');
  const minHold = k.requiredTroops * 0.5;
  if (m.troopsAshore < minHold * 0.6) {
    return {
      kind: 'fail',
      gate: 'landing',
      by: 'beachheadCrushed',
      shortfall: 1 - m.troopsAshore / minHold,
      text: `灘頭上的部隊在守方砲兵與反擊下剩 ${fmt(m.troopsAshore)} 人，重裝備多數還在海上。灘頭堡被壓回海裡。`,
    };
  }
  if (elapsed < holdHours) return null;
  if (s.hour !== 23) return null;
  // 第二波：灘頭建立後再卸載的兵力需達一定比例；海況關閉則不可能
  const secondWaveNeeded = k.requiredTroops * 0.3;
  const sinceStart = m.troopsArrived - m.arrivedAtLandingStart;
  const fleetStrength = m.fleetGroups.reduce((a, g) => a + g.strength, 0) / m.fleetGroups.length;
  if (m.troopsAshore >= minHold && sinceStart >= secondWaveNeeded) {
    return {
      kind: 'pass',
      next: 'inland',
      text: `灘頭堡撐過 ${holdHours} 小時，第二波 ${fmt(sinceStart)} 人卸載完成。上岸兵力 ${fmt(m.troopsAshore)} 人，船團剩 ${pct(fleetStrength)}。`,
    };
  }
  if (elapsed >= holdHours + 48 || m.weatherWindowDays <= 0 || fleetStrength < 0.25) {
    const by = m.weatherWindowDays <= 0 ? 'windowClosed' : fleetStrength < 0.25 ? 'fleetBroken' : 'secondWaveFailed';
    return {
      kind: 'fail',
      gate: 'landing',
      by,
      shortfall: Math.max(0, 1 - sinceStart / secondWaveNeeded),
      text:
        by === 'windowClosed'
          ? `灘頭堡存活，但海況窗口關閉，第二波只卸下 ${fmt(sinceStart)} 人（需 ${fmt(secondWaveNeeded)}）。灘頭上的 ${fmt(m.troopsAshore)} 人成了孤軍。`
          : by === 'fleetBroken'
            ? `灘頭堡存活，但船團剩 ${pct(fleetStrength)}，第二波無船可運。灘頭上的 ${fmt(m.troopsAshore)} 人成了孤軍。`
            : `灘頭堡存活 ${holdHours} 小時，但第二波只卸下 ${fmt(sinceStart)} 人（需 ${fmt(secondWaveNeeded)}），守方砲兵把灘頭變成射擊場。`,
    };
  }
  return null;
}
