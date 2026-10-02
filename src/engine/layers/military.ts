import type { Ctx } from '../context.js';
import { dayLabel, fmt, pct } from '../context.js';
import { regionalLossMultiplier } from './regional.js';
import type { FleetGroup } from '../types.js';

/** 海況是否允許小艇與駁船作業（今日海況好、好天預算未用罄、不在颱風期）。 */
export function seaOpen(ctx: Ctx): boolean {
  const { s, k } = ctx;
  if (!s.military.seaGood) return false;
  if (s.military.weatherWindowDays <= 0) return false;
  if (k.typhoonDay !== null && s.day >= k.typhoonDay && s.day < k.typhoonDay + k.typhoonHaltDays) return false;
  return true;
}

/**
 * 每趟航渡的船團損失比例：
 *   台灣自身（岸置 × 殘存 + 潛艦 + 殘存空軍 × (1 − 紅方制空)）× 美軍介入後加成
 *   + 美軍介入後的額外損失（潛艦 + 遠程反艦飛彈）× 日本態度係數。
 * 校準依 CSIS 2023：台灣單獨作戰前 10 天擊沉約 16% 兩棲艦；美軍介入基準情境 10–14 天擊沉約 90%。
 */
export function lossPerTransit(ctx: Ctx): number {
  const m = ctx.s.military;
  const taiwan =
    ctx.param('cross.coastalLossPerTransit') * m.twCoastalMissiles +
    ctx.param('cross.subLossPerTransit') +
    ctx.param('cross.airLossPerTransit') * (1 - m.airControl);
  const us = ctx.s.regional.usEngaged ? ctx.param('cross.usSubLossPerTransit') * ctx.k.sortieCoef : 0;
  return Math.min(0.95, taiwan * regionalLossMultiplier(ctx) + us);
}

/**
 * 船團循環：staging → enroute → arrived（卸載） → returning → staging。
 * 回傳本小時的船團損失（佔原始總戰力比例），給家前線層用。
 */
export function tickFleet(ctx: Ctx, departuresAllowed: boolean): number {
  const { s, k } = ctx;
  const m = s.military;
  const transitHours = ctx.param('lift.transitHours');
  const cycleHours = ctx.param('lift.waveRoundTripDays') * 24;
  const loadHours = Math.max(6, (cycleHours - 2 * transitHours) / 2);
  const hourlyLoss = lossPerTransit(ctx) / transitHours;
  const open = seaOpen(ctx);
  const n = m.fleetGroups.length;
  let lostThisHour = 0;
  let arrivedCount = 0;
  for (const g of m.fleetGroups) if (g.status === 'arrived') arrivedCount++;
  const unloadPerGroupHour = arrivedCount > 0 ? k.beachThroughputPerDay / 24 / arrivedCount : 0;

  for (const g of m.fleetGroups) {
    switch (g.status) {
      case 'staging': {
        g.legHours++;
        if (departuresAllowed && open && g.legHours >= loadHours && g.strength > 0.05) {
          g.status = 'enroute';
          g.legHours = 0;
          if (g.trips === 0 && !s.flags.has('firstDeparture')) {
            s.flags.add('firstDeparture');
            ctx.emit('military', 'fleetDeparture', `第一波船團自${portName(ctx)}出港，${fmt(k.liftCapacity)} 人的運量押在這一趟。`, {
              liftCapacity: k.liftCapacity,
              groups: n,
            });
          }
        }
        break;
      }
      case 'enroute': {
        if (!open) {
          // 海況關閉：在航船團被打散
          const loss = g.strength * ctx.param('cross.scatterLoss');
          g.strength -= loss;
          lostThisHour += loss / n;
          g.status = 'scattered';
          g.legHours = 0;
          ctx.emit('military', 'fleetScattered', `海況惡化，第 ${g.id + 1} 船團在海峽中線被打散，小艇與駁船損失 ${pct(ctx.param('cross.scatterLoss'))}。`, {
            group: g.id,
            weatherWindowDays: m.weatherWindowDays,
          });
          break;
        }
        const loss = g.strength * hourlyLoss;
        g.strength -= loss;
        lostThisHour += loss / n;
        g.legHours++;
        g.position = lerpPos(ctx, g.legHours / transitHours);
        if (g.legHours >= transitHours) {
          g.status = 'arrived';
          g.legHours = 0;
          if (!s.flags.has('firstArrival')) {
            s.flags.add('firstArrival');
            ctx.emit('military', 'fleetArrived', `第一波船團抵達${beachName(ctx)}外海，開始換乘登陸艇。`, { group: g.id });
          }
        }
        break;
      }
      case 'arrived': {
        if (!open) {
          // 錨泊卸載中遇壞海況：登陸艇與駁船無法作業，船團被迫起錨避風，本趟卸載中止
          const loss = g.strength * ctx.param('cross.scatterLoss') * 0.5;
          g.strength -= loss;
          lostThisHour += loss / n;
          g.status = 'scattered';
          g.legHours = 0;
          g.trips++;
          if (!s.flags.has('unloadingAborted')) {
            s.flags.add('unloadingAborted');
            ctx.emit('military', 'unloadingAborted', `海況轉差，第 ${g.id + 1} 船團在${beachName(ctx)}外海被迫起錨避風，換乘中的登陸艇翻覆，本波卸載中止。`, {
              group: g.id,
            });
          }
          break;
        }
        // 卸載受灘頭吞吐量限制；靠岸船團仍受岸置火力（半速）
        const loss = g.strength * hourlyLoss * 0.5;
        g.strength -= loss;
        lostThisHour += loss / n;
        const remaining = g.capacity * g.strength; // legHours 在此狀態代表「已卸載小時數」
        const unloaded = Math.min(unloadPerGroupHour, remaining);
        // 換乘與衝灘：守方火砲在灘岸造成損失（守方尚未展開時減半）
        const surf = ctx.param('beach.surfZoneLoss') * (m.defenderStrength > 0 ? 1 : 0.5);
        m.troopsArrived += unloaded;
        m.troopsAshore += unloaded * (1 - surf);
        if (m.beachhead) m.secondWaveDelivered += unloaded;
        g.legHours++;
        // 船團在灘頭外海下錨直到卸完（CSIS 2023 p.47：兩棲艦在灘頭外錨泊、往返中國港口接駁），卸完即返航
        if (g.legHours * unloadPerGroupHour >= g.capacity * g.strength) {
          g.status = 'returning';
          g.legHours = 0;
          g.trips++;
        }
        break;
      }
      case 'returning': {
        const loss = g.strength * hourlyLoss * 0.3;
        g.strength -= loss;
        lostThisHour += loss / n;
        g.legHours++;
        g.position = lerpPos(ctx, 1 - g.legHours / transitHours);
        if (g.legHours >= transitHours) {
          g.status = 'staging';
          g.legHours = 0;
        }
        break;
      }
      case 'scattered': {
        g.legHours++;
        if (g.legHours >= 24) {
          g.status = 'staging';
          g.legHours = 0;
        }
        break;
      }
    }
  }
  m.fleetLoss = Math.min(1, m.fleetLoss + lostThisHour);
  return lostThisHour;
}

const DAYS_IN_MONTH = 30;

/**
 * 日界處理：逐日海況（兩態馬可夫鏈）、好天預算倒數、守方岸置飛彈隨交戰消耗。
 * 穩態好天比例 p = 該月可用海況天數 ÷ 30；壞天平均持續 badSpellMeanDays。
 * D 日由指揮官挑在好天開始。好天預算用罄 = 本月窗口關閉（季風確立）。
 */
export function dailyMilitary(ctx: Ctx): void {
  const { s, k } = ctx;
  const m = s.military;
  if (s.day < 0) return;
  if (s.day > 0) {
    const p = Math.min(0.95, Math.max(0.05, k.windowDays / DAYS_IN_MONTH));
    const r = 1 / ctx.param('weather.badSpellMeanDays'); // 壞 → 好
    const q = Math.min(0.9, (r * (1 - p)) / p); // 好 → 壞
    const wasGood = m.seaGood;
    m.seaGood = wasGood ? !ctx.rng.chance(q) : ctx.rng.chance(r);
    if (wasGood && !m.seaGood && m.weatherWindowDays > 0) {
      ctx.emit('military', 'seaBad', `海況轉差：海峽浪高逾 2 公尺，登陸艇與駁船停止作業，在航船團改為抗風航行。`, {
        weatherWindowDays: m.weatherWindowDays,
      });
    } else if (!wasGood && m.seaGood && m.weatherWindowDays > 0) {
      ctx.emit('military', 'seaGood', `海況好轉，船團恢復出港與卸載。本月好天還剩約 ${m.weatherWindowDays} 天。`, {
        weatherWindowDays: m.weatherWindowDays,
      });
    }
  }
  const prev = m.weatherWindowDays;
  if (m.seaGood) m.weatherWindowDays = Math.max(0, m.weatherWindowDays - 1);
  if (prev > 0 && m.weatherWindowDays === 0) {
    s.flags.add('seaClosed');
    ctx.emit('military', 'windowClosed', `${ctx.a.month} 月的海況窗口在 ${dayLabel(s.day)} 用罄，季風確立，登陸艇與駁船無法再作業。`, {
      month: ctx.a.month,
    });
  }
  if (ctx.k.typhoonDay !== null && s.day === ctx.k.typhoonDay) {
    ctx.emit('military', 'typhoon', `颱風警報：未來 ${ctx.k.typhoonHaltDays} 天海峽風力達 8 級以上，所有渡海作業中止。`, {
      haltDays: ctx.k.typhoonHaltDays,
    });
  }
  // 渡海期間守方岸置飛彈持續被反制（發射即暴露）
  if (s.phase !== 'mobilize' && s.phase !== 'strike') {
    m.twCoastalMissiles *= 1 - ctx.param('fire.mobileLauncherDailyAttrition') * 0.5;
  }
}

/**
 * 守方灘頭有效戰力：
 *   灘頭守備旅（即時在位）+ 軍團其餘常備旅（依 reinforcementHours 線性到位）
 *   + 後備旅 × 動員率 × 動員進度，全部 × 工事與地形倍數。
 */
export function defenderStrength(ctx: Ctx, hoursSinceLanding = 0): number {
  const { s, k, a } = ctx;
  const mobilizeStart = k.detectedDay + ctx.param('detect.twReserveActivationLagDays');
  const extraWarning = a.auxiliary === 'penghu' ? ctx.param('aux.penghu.warningDays') : 0;
  const ramp = Math.min(1, Math.max(0, (s.day - mobilizeStart + extraWarning) / 14));
  let beachBrigades = k.regularBrigades;
  if (s.flags.has('eastFeintPinned')) beachBrigades = Math.max(1, beachBrigades - 1);
  const reinforce = Math.min(1, hoursSinceLanding / ctx.param('beach.reinforcementHours'));
  const regular = beachBrigades + k.regionalBrigades * reinforce;
  const reg = regular * ctx.param('beach.brigadeStrength');
  const res = k.reserveBrigades * ctx.param('beach.reserveBrigadeStrength') * a.twReserve * ramp;
  return (reg + res) * ctx.param('beach.defenderAdvantage');
}

/** 灘頭戰每小時交換（Lanchester 線性律）。守方戰力 = 應到位戰力 − 累計損失。 */
export function tickBeachCombat(ctx: Ctx, hoursSinceLanding: number): void {
  const m = ctx.s.military;
  if (m.troopsAshore <= 0) return;
  const c = ctx.param('beach.hourlyExchangeRate');
  const heavy = ctx.param('beach.heavyEquipFraction');
  const attackerEff = m.troopsAshore * (0.5 + 0.5 * heavy);
  m.defenderLosses += c * attackerEff;
  m.defenderStrength = Math.max(0, defenderStrength(ctx, hoursSinceLanding) - m.defenderLosses);
  const loss = c * m.defenderStrength * 0.5;
  m.troopsAshore = Math.max(0, m.troopsAshore - loss);
}

function lerpPos(ctx: Ctx, t: number): [number, number] {
  const port = portLonlat(ctx);
  const beach = beachLonlat(ctx);
  const tt = Math.min(1, Math.max(0, t));
  return [port[0] + (beach[0] - port[0]) * tt, port[1] + (beach[1] - port[1]) * tt];
}

import { GEO, beachesOf, portFor } from '../geography.js';
function portLonlat(ctx: Ctx): [number, number] {
  return portFor(ctx.a.mainAxis).lonlat;
}
function beachLonlat(ctx: Ctx): [number, number] {
  return beachesOf(ctx.a.mainAxis)[0]?.lonlat ?? [GEO.map.lon[0], GEO.map.lat[0]];
}
export function portName(ctx: Ctx): string {
  return portFor(ctx.a.mainAxis).name;
}
export function beachName(ctx: Ctx): string {
  return beachesOf(ctx.a.mainAxis)[0]?.name ?? '灘頭';
}
export function groupSummary(groups: FleetGroup[]): string {
  return groups.map((g) => `${g.id + 1}:${Math.round(g.strength * 100)}%`).join(' ');
}
