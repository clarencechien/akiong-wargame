import type { Ctx } from '../context.js';
import { fmt, pct } from '../context.js';
import type { GateResult } from './gates.js';

const STRIKE_DAYS = 3;

/** 階段 2：火力打擊（D+0 → D+3）。 */
export function tickStrike(ctx: Ctx): void {
  const { s } = ctx;
  const m = s.military;
  if (s.day === 0 && s.hour === 0) {
    const missiles = Math.round(ctx.param('fire.firstWaveMissiles'));
    m.airControl = ctx.param('fire.redAirControl');
    ctx.emit('military', 'strike', `D 日 04:00，火箭軍對台灣機場、雷達站與岸置飛彈陣地發射首波飛彈，三日計畫用量 ${fmt(missiles)} 枚。`, {
      missiles,
    });
    // 固定岸置陣地在首波即被打擊
    const fixedShare = ctx.param('fire.coastalFixedShare');
    const fixedSurv = ctx.param('fire.fixedSiteSurvival');
    m.twCoastalMissiles = fixedShare * fixedSurv + (1 - fixedShare);
    const airfield = ctx.param('fire.airfieldSurvival');
    ctx.emit('military', 'airfieldsHit', `西部機場跑道多數受損，台灣空軍可用機場剩 ${pct(airfield)}；佳山與志航洞庫內的機隊未受損。`, {
      airfieldSurvival: airfield,
    });
  }
  if (s.hour === 12 && s.day >= 0 && s.day <= STRIKE_DAYS) {
    // 機動岸置飛彈每日損失，依飛彈數量相對基準調整（上限 1.5 倍）
    const intensity = Math.min(1.5, ctx.param('fire.firstWaveMissiles') / 1200);
    const d = ctx.param('fire.mobileLauncherDailyAttrition') * intensity;
    // 只有機動部分會每日損耗
    const fixedShare = ctx.param('fire.coastalFixedShare');
    const fixedLeft = fixedShare * ctx.param('fire.fixedSiteSurvival');
    const mobileLeft = Math.max(0, m.twCoastalMissiles - fixedLeft);
    m.twCoastalMissiles = fixedLeft + mobileLeft * (1 - d);
    if (s.day === 1) {
      ctx.emit('military', 'launcherHunt', `偵察衛星與無人機搜索機動發射車，第一日戰果評估：守方岸置飛彈剩 ${pct(m.twCoastalMissiles)}。`, {
        twCoastalMissiles: m.twCoastalMissiles,
      });
    }
  }
}

export function gateStrike(ctx: Ctx): GateResult | null {
  const { s } = ctx;
  if (!(s.day === STRIKE_DAYS && s.hour === 23)) return null;
  const remaining = s.military.twCoastalMissiles;
  const max = ctx.param('gate.strike.coastalMissilesMax');
  if (remaining >= max) {
    return {
      kind: 'fail',
      gate: 'strike',
      by: 'coastalMissilesIntact',
      shortfall: (remaining - max) / max,
      text: `三日打擊後守方岸置飛彈仍有 ${pct(remaining)}（可渡海上限 ${pct(max)}）。機動發射車躲在隧道與民宅間，衛星找不到。船團出港等於送死，指揮中心取消 D+4 的渡海。`,
    };
  }
  return {
    kind: 'pass',
    next: 'crossing',
    text: `三日打擊後守方岸置飛彈剩 ${pct(remaining)}，判定可渡海。船團開始裝載。`,
  };
}
