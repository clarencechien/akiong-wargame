import type { Ctx } from '../context.js';
import { fmt } from '../context.js';
import { seaOpen } from '../layers/military.js';
import { regionalLossMultiplier } from '../layers/regional.js';
import type { GateResult } from './gates.js';

export const MAX_DAY = 30;

/** 階段 5：縱深與持久。補給線存活天數累計、守方縱深反擊、家前線壓力。 */
export function tickInland(ctx: Ctx): void {
  const { s, k, a } = ctx;
  const m = s.military;
  if (s.hour !== 6) return; // 每日一次結算（06:00）
  if (!k.supplyable) {
    // 東岸：背靠中央山脈，補給線無法連通西部政經中心
    m.supplyDays = 0;
    if (!s.flags.has('eastNoSupply')) {
      s.flags.add('eastNoSupply');
      ctx.emit('military', 'supplyCut', '登陸部隊控制了東岸平原，但往西只有兩條山路；補給線到此為止，無法向台北或台中推進。');
    }
  } else if (!seaOpen(ctx)) {
    m.supplyDays = Math.max(0, m.supplyDays - 1);
    if (!s.flags.has('supplySeaClosed')) {
      s.flags.add('supplySeaClosed');
      ctx.emit('military', 'supplyCut', '海況關閉，補給船團停在港內；灘頭的彈藥與燃料開始倒數。');
    }
  } else {
    const pHit = Math.min(0.9, ctx.param('inland.supplyHitProbPerDay') * (0.5 + m.twCoastalMissiles) * regionalLossMultiplier(ctx));
    if (ctx.rng.chance(pHit)) {
      m.supplyDays = Math.max(0, m.supplyDays - 2);
      ctx.emit('military', 'supplyCut', `補給船團在海峽中線遭攻擊，兩艘滾裝船沉沒；補給線存活天數歸零重算（目前 ${fmt(m.supplyDays)} 天）。`, {
        supplyDays: m.supplyDays,
      });
    } else {
      const slow = s.homefront.morale < ctx.param('inland.moraleSlow') ? 0.5 : 1;
      m.supplyDays += slow;
    }
  }
  // 守方縱深反擊：以後備動員率加權
  const counter = ctx.param('inland.counterattackPerDay') * (0.5 + a.twReserve);
  m.troopsAshore = Math.max(0, m.troopsAshore * (1 - counter));
}

export function gateInland(ctx: Ctx): GateResult | null {
  const { s, k } = ctx;
  const m = s.military;
  if (s.hour !== 23) return null;
  if (m.supplyDays >= ctx.param('inland.supplyDaysRequired') && s.homefront.morale > ctx.param('inland.moraleSlow')) {
    return {
      kind: 'objective',
      text: `補給線連續存活 ${fmt(m.supplyDays)} 天，上岸兵力 ${fmt(m.troopsAshore)} 人開始向內陸推進。戰略目標達成——至少教科書的這一章是這樣寫的。`,
    };
  }
  const fleetStrength = m.fleetGroups.reduce((a, g) => a + g.strength, 0) / m.fleetGroups.length;
  if (fleetStrength < 0.25 && m.supplyDays < ctx.param('inland.supplyDaysRequired')) {
    // CSIS 2023 p.84–87：基準情境多在船團被擊沉後決定——灘頭部隊成孤軍，只能靠空投與小艇
    return {
      kind: 'fail',
      gate: 'inland',
      by: 'fleetBroken',
      shortfall: 1 - m.supplyDays / ctx.param('inland.supplyDaysRequired'),
      text: `兩棲船團剩 ${Math.round(fleetStrength * 100)}%，已無法維持補給線（存活 ${fmt(m.supplyDays)} 天，需 ${ctx.param('inland.supplyDaysRequired')} 天）。灘頭上的 ${fmt(m.troopsAshore)} 人只能靠空投與小艇補給，攻勢到此為止。`,
    };
  }
  if (m.troopsAshore < k.requiredTroops * 0.3) {
    return {
      kind: 'fail',
      gate: 'inland',
      by: 'forcesDepleted',
      shortfall: 1 - m.troopsAshore / (k.requiredTroops * 0.3),
      text: `縱深作戰中登陸部隊剩 ${fmt(m.troopsAshore)} 人，補給線存活 ${fmt(m.supplyDays)} 天。灘頭堡還在，但已經打不出去。`,
    };
  }
  return null;
}
