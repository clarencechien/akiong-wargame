/**
 * 結局一句話：戰情室結局覆蓋層、史書結局卡、分享卡 kicker 共用。
 * 全部從 run 的 outcome、最後一張快照與本局抽樣參數算，數字可查。
 */
import type { Assumptions, Run } from '../engine/types.js';
import { P } from '../engine/params.js';
import { avgStrength } from '../engine/gateinfo.js';
import { outlook } from './outlook.js';

export interface Verdict {
  /** 一句話 */
  headline: string;
  /** 兩三句，含數字與差多少 */
  detail: string;
  /** 這一道門檻教的事 */
  lesson: string;
  /** 「如果重來」最相關的那個假設 */
  suggest: keyof Assumptions | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString('zh-Hant-TW');
const dl = (d: number) => (d < 0 ? `D${d}` : `D+${d}`);

export function verdict(run: Run): Verdict {
  const o = run.outcome;
  const p = run.sampledParams;
  const s = run.snapshots[run.snapshots.length - 1];
  const a = run.assumptions;
  const required = P(p, 'beach.requiredTroops');
  const day = dl(o.endedAt.day);
  const fleet = s ? avgStrength(s) : 1 - o.fleetLoss;
  const ashore = s?.military.troopsAshore ?? 0;
  const key = o.reason === 'objectiveReached' ? 'objectiveReached' : (o.failedBy ?? 'day30');
  switch (key) {
    case 'coastalMissilesIntact': {
      const left = s?.military.twCoastalMissiles ?? 0;
      const max = P(p, 'gate.strike.coastalMissilesMax');
      return {
        headline: `${day}，船團沒有出港。`,
        detail: `三日打擊後守方岸置飛彈剩 ${pct(left)}，可渡海上限 ${pct(max)}，差 ${pct(Math.max(0.005, left - max))}。固定陣地打掉了，機動發射車找不到。${fmt(Number(run.events.find((e) => e.kind === 'fleetDeparture')?.data?.['liftCapacity'] ?? 0) || P(p, 'lift.amphibShips.count') * P(p, 'lift.troopsPerAmphib') * P(p, `lift.scaleAmphibFraction.${a.scale}`))} 人的運量停在碼頭上。`,
        lesson: a.scale === 'raid' ? '偷襲型的飛彈數與偵察強度不夠壓制機動發射車；規模上去，火力與偵察才夠，但也就不再是偷襲。' : '會動的東西打不掉。三天的飛彈能清掉固定陣地，清不掉躲在隧道與民宅間的發射車。',
        suggest: a.scale === 'raid' ? 'scale' : 'month',
      };
    }
    case 'windowClosed':
      return {
        headline: `${day}，海況窗口關閉，登陸中止。`,
        detail: `${a.month} 月的好天用完了。上岸 ${fmt(o.maxTroopsAshore)} 人（需 ${fmt(required * 0.7)} 人），船團剩 ${pct(fleet)}。灘頭上的人失去補給與增援。`,
        lesson: '一年只有四月與十月兩個窗口，窗口裡也不是每天都開。天氣不聽命令。',
        suggest: 'month',
      };
    case 'fleetBroken':
      return {
        headline: o.endedAt.phase === 'inland' ? `${day}，船團剩 ${pct(fleet)}，灘頭成了孤軍。` : `${day}，船團剩 ${pct(fleet)}，渡海中止。`,
        detail: `上岸最多 ${fmt(o.maxTroopsAshore)} 人，船團損失 ${pct(o.fleetLoss)}。${s?.regional.usEngaged ? '美軍介入後每一趟航渡都在掉船，' : ''}第一趟過得去，之後的趟數過不去；沒有船，灘頭上的 ${fmt(ashore)} 人只能靠空投與小艇。`,
        lesson: '上岸不是最難的。CSIS 二十四局每一局解放軍都上得了岸，輸的都是同一件事：船沒了。',
        suggest: a.us === 'none' ? 'scale' : 'us',
      };
    case 'tooSlow':
      return {
        headline: `${day}，渡海拖過了上限。`,
        detail: `${Math.round(P(p, 'cross.maxDays'))} 天只送上 ${fmt(o.maxTroopsAshore)} 人（需 ${fmt(required * 0.7)}）。沒有港口，每天只能卸幾千人；壞海況又吃掉幾天。守方縱深部隊到齊了。`,
        lesson: '灘頭上的算術不是誰勇敢，是誰先到。吞吐量與天氣決定一切。',
        suggest: a.auxiliary !== 'none' ? 'auxiliary' : 'scale',
      };
    case 'secondWaveFailed':
      return {
        headline: `${day}，第二波沒有來。`,
        detail: `灘頭堡撐過 ${P(p, 'beach.holdHours')} 小時，但第二波只卸了 ${fmt((s?.military.troopsArrived ?? 0) - (s?.military.arrivedAtLandingStart ?? 0))} 人（需 ${fmt(required * 0.3)}）。船團剩 ${pct(fleet)}。守方砲兵把灘頭變成射擊場。`,
        lesson: '灘頭堡的定義不是有人站在沙灘上，是第二波卸得下來。美軍、天氣、守方砲兵打的都是第二波。',
        suggest: 'auxiliary',
      };
    case 'beachheadCrushed':
      return {
        headline: `${day}，灘頭堡被壓回海裡。`,
        detail: `上岸最多 ${fmt(o.maxTroopsAshore)} 人，守方 ${fmt(s?.military.defenderStrength ?? 0)} 人當量在 48 小時內到位。重裝備多數還在海上。`,
        lesson: '灘頭後方不只是沙灘上那幾個旅，是四十八小時內能到的所有旅。北部三分之一有台灣四成六的營。',
        suggest: 'mainAxis',
      };
    case 'forcesDepleted':
      return {
        headline: `${day}，灘頭堡還在，但打不出去了。`,
        detail: `登陸部隊剩 ${fmt(ashore)} 人，補給線連續存活 ${(s?.military.supplyDays ?? 0).toFixed(0)} 天（需 ${P(p, 'inland.supplyDaysRequired')}）。守方縱深每天都在扣人。`,
        lesson: '登陸只是開始。後備動員率決定灘頭後方能撐幾天。',
        suggest: 'mainAxis',
      };
    case 'moraleCollapse':
      return {
        headline: `${day}，中央宣布「階段性目標已達成」，行動停止。`,
        detail: `士氣跌破停止線。沿海停工 ${pct(o.coastalShutdown)}，船團損失 ${pct(o.fleetLoss)}，前線還有 ${fmt(ashore)} 人在灘頭上。`,
        lesson: '持久的代價先落在自己人身上。士氣不是突然崩的，是一天一天算出來的。',
        suggest: 'us',
      };
    case 'objectiveReached':
      return {
        headline: `${day}，補給線連續存活七天，戰略目標達成。`,
        detail: `上岸 ${fmt(ashore)} 人開始向內陸推進。船團損失 ${pct(o.fleetLoss)}，沿海停工 ${pct(o.coastalShutdown)}。`,
        lesson: '這一局過了。看看它過得多勉強，再看看一百局裡有幾局過。',
        suggest: null,
      };
    default: {
      const ol = outlook(run);
      return {
        headline: o.beachhead ? `D+30，灘頭堡還在，目標沒到。` : `D+30，戰事膠著。`,
        detail: `${ol?.text ?? `灘頭堡${o.beachhead ? '仍在' : '未建立'}，上岸 ${fmt(ashore)} 人，船團損失 ${pct(o.fleetLoss)}。`}史料到第三十天為止，後面是外推。`,
        lesson: o.beachhead
          ? '上岸不等於贏。三十天後灘頭還在，但每一天守方都在到位，而船與天氣決定還能不能補給。'
          : '三十天過去，目標還沒到。公開資料對第三十一天沒有話說。',
        suggest: o.beachhead && a.us !== 'none' ? 'month' : 'us',
      };
    }
  }
}
