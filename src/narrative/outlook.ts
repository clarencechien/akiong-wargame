/**
 * 第三十一天之後：模型在 D+30 停筆（HANDOFF §5.2 以三十天為限），但灘頭上的人不會消失。
 * 這裡用本局的抽樣參數與最後一張快照做「外推」，不是模擬：
 *   - 守方縱深反擊每日扣 counterattackPerDay × (0.5 + 後備動員率) 的登陸部隊
 *   - 補給線：本月好天預算用罄 → 下個月的窗口才有船；船團剩多少決定一趟能送多少
 *   - 灘頭守不住的規模 = beach.requiredTroops × 0.3（與 inland 門檻 forcesDepleted 同一條線）
 * 回傳一句可以直接放進結局卡與史書的話，以及拆開的數字（給儀表板）。
 */
import type { Run } from '../engine/types.js';
import { P } from '../engine/params.js';
import { avgStrength } from '../engine/gateinfo.js';

export interface Outlook {
  /** 一句話（含數字） */
  text: string;
  /** 依本局消耗速度，灘頭兵力降到守不住規模的天數（從 D+30 起算） */
  daysToDepleted: number;
  /** 每日消耗比例 */
  dailyAttrition: number;
  /** 下個月的好天預算（天） */
  nextWindowDays: number;
  /** 船團剩餘戰力 */
  fleetLeft: number;
  /** 本月好天是否已用罄 */
  windowSpent: boolean;
  troopsAshore: number;
  holdLine: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString('zh-Hant-TW');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const MONTH_ZH = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

/** 只對 timeout / day30 有意義；其他結局回傳 null。 */
export function outlook(run: Run): Outlook | null {
  const o = run.outcome;
  if (o.reason !== 'timeout' || o.failedBy !== 'day30') return null;
  const s = run.snapshots[run.snapshots.length - 1];
  const p = run.sampledParams;
  const a = run.assumptions;
  const troopsAshore = s?.military.troopsAshore ?? o.maxTroopsAshore;
  const holdLine = P(p, 'beach.requiredTroops') * 0.3;
  const dailyAttrition = P(p, 'inland.counterattackPerDay') * (0.5 + a.twReserve);
  const daysToDepleted = troopsAshore > holdLine ? Math.ceil(Math.log(holdLine / troopsAshore) / Math.log(1 - dailyAttrition)) : 0;
  const nextMonth = (a.month % 12) + 1;
  const nextWindowDays = Math.round(P(p, `weather.windowDays.m${nextMonth}`));
  const fleetLeft = s ? avgStrength(s) : 1 - o.fleetLoss;
  const windowSpent = (s?.military.weatherWindowDays ?? 0) <= 0;
  const supplyDays = s?.military.supplyDays ?? 0;

  const parts: string[] = [];
  if (!o.beachhead || troopsAshore < 1) {
    parts.push('岸上沒有人需要被接走。');
  } else {
    parts.push(`灘頭上還有 ${fmt(troopsAshore)} 人。`);
    if (windowSpent) parts.push(`${MONTH_ZH[a.month]}的好天已經用完，下一個窗口在${MONTH_ZH[nextMonth]}，約 ${nextWindowDays} 天；在那之前補給只剩空投與夜間小艇。`);
    else if (supplyDays <= 0) parts.push(`補給線此刻是斷的，船團剩 ${pct(fleetLeft)}。`);
    else parts.push(`補給線還連著（存活 ${Math.round(supplyDays)} 天），船團剩 ${pct(fleetLeft)}。`);
    if (daysToDepleted > 0) parts.push(`依本局守方每天削掉 ${(dailyAttrition * 100).toFixed(1)}% 的速度，再 ${daysToDepleted} 天這支部隊就會降到 ${fmt(holdLine)} 人以下，守不住灘頭。`);
    else parts.push(`這支部隊已經低於 ${fmt(holdLine)} 人的守備下限。`);
    parts.push(fleetLeft < 0.4 ? '剩下的船不夠把他們接回來。' : windowSpent ? '船還在，但要等天氣。' : '接回來或繼續送人，是第三十一天要做的決定。');
  }
  return { text: parts.join(''), daysToDepleted, dailyAttrition, nextWindowDays, fleetLeft, windowSpent, troopsAshore, holdLine };
}
