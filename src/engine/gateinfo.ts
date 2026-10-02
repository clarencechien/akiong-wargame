/**
 * 「下一道門檻」資訊：從任一快照的 state 與本局抽樣參數算出目前門檻、進度與差多少。戰情室左欄用。
 */
import type { Phase, Run, State } from './types.js';
import { P } from './params.js';
import { GATE_LABEL } from './phases/gates.js';

export interface GateInfo {
  phase: Phase;
  label: string;
  /** 0..1 */
  progress: number;
  /** 兩三句，含數字 */
  text: string;
  /** 第二條件（landing 的第二波、inland 的士氣） */
  secondary?: { label: string; progress: number };
}

const fmt = (n: number) => Math.round(n).toLocaleString('zh-Hant-TW');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export function gateInfo(run: Run, s: State): GateInfo {
  const p = run.sampledParams;
  const required = P(p, 'beach.requiredTroops');
  const m = s.military;
  switch (s.phase) {
    case 'mobilize': {
      const need = 3;
      return {
        phase: s.phase,
        label: GATE_LABEL.mobilize,
        progress: clamp(m.weatherWindowDays / need),
        text: `D-1 檢查：本月好天預算 ${m.weatherWindowDays} 天（至少需 ${need} 天）。船團集結中，被發現只是時間問題。`,
      };
    }
    case 'strike': {
      const max = P(p, 'gate.strike.coastalMissilesMax');
      return {
        phase: s.phase,
        label: GATE_LABEL.strike,
        progress: clamp((1 - m.twCoastalMissiles) / (1 - max)),
        text: `守方岸置飛彈剩 ${pct(m.twCoastalMissiles)}，D+3 前要壓到 ${pct(max)} 以下。固定陣地打得掉，機動發射車找不到。`,
      };
    }
    case 'crossing': {
      const need = required * 0.7;
      return {
        phase: s.phase,
        label: GATE_LABEL.crossing,
        progress: clamp(m.troopsArrived / need),
        text: `抵岸 ${fmt(m.troopsArrived)} 人，需 ${fmt(need)} 人。好天還剩 ${m.weatherWindowDays} 天，船團平均戰力 ${pct(avgStrength(s))}。`,
      };
    }
    case 'landing': {
      const hold = P(p, 'beach.holdHours');
      const start = landingStartHour(s);
      const elapsed = Math.max(0, s.day * 24 + s.hour - start);
      const second = m.troopsArrived - m.arrivedAtLandingStart;
      const secondNeed = required * 0.3;
      return {
        phase: s.phase,
        label: GATE_LABEL.landing,
        progress: clamp(elapsed / hold),
        text: `灘頭堡已撐 ${Math.round(elapsed)} 小時（需 ${hold}），上岸 ${fmt(m.troopsAshore)} 人、守方 ${fmt(m.defenderStrength)} 人當量。第二波已卸 ${fmt(second)}／${fmt(secondNeed)} 人。`,
        secondary: { label: '第二波卸載', progress: clamp(second / secondNeed) },
      };
    }
    case 'inland': {
      const need = P(p, 'inland.supplyDaysRequired');
      const moraleNeed = P(p, 'inland.moraleSlow');
      return {
        phase: s.phase,
        label: GATE_LABEL.inland,
        progress: clamp(m.supplyDays / need),
        text: `補給線連續存活 ${m.supplyDays.toFixed(1)} 天（需 ${need}），士氣 ${Math.round(s.homefront.morale)}（需 > ${moraleNeed}）。船團剩 ${pct(avgStrength(s))}。`,
        secondary: { label: '士氣', progress: clamp(s.homefront.morale / 100) },
      };
    }
  }
}

export function avgStrength(s: State): number {
  const g = s.military.fleetGroups;
  return g.length ? g.reduce((a, x) => a + x.strength, 0) / g.length : 0;
}

export function landingStartHour(s: State): number {
  for (const f of s.flags) if (f.startsWith('landingStart:')) return Number(f.slice('landingStart:'.length));
  return Number.POSITIVE_INFINITY;
}

export const PHASE_NAME: Record<Phase, string> = {
  mobilize: '動員與集結',
  strike: '火力打擊與封鎖',
  crossing: '渡海',
  landing: '搶灘與灘頭堡',
  inland: '縱深與持久',
};
export const PHASE_ORDER: readonly Phase[] = ['mobilize', 'strike', 'crossing', 'landing', 'inland'];
