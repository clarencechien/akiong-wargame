import type { Ctx } from '../context.js';
import { pct } from '../context.js';

/**
 * 家前線層：沿海停工、台商薪資、士氣、物價。
 * 時間 + 經濟自損容忍 → 停工曲線；船團損失 → 士氣。每小時呼叫，日界處理。
 */
export function tickHomefront(ctx: Ctx, fleetLossToday: number): void {
  const { s, a } = ctx;
  if (s.hour !== 0) return;
  const h = s.homefront;
  const atWar = s.phase !== 'mobilize';

  // 停工：集結期（被辨識後）慢速，開戰後全速；高容忍曲線更陡
  let rate = ctx.param('home.shutdownRatePerDay');
  if (a.econTolerance === 'high') rate *= ctx.param('home.shutdownHighTolMult');
  if (!atWar) rate *= s.flags.has('detected') ? 0.3 : 0;
  const prevShutdown = h.coastalShutdown;
  h.coastalShutdown = Math.min(0.9, h.coastalShutdown + rate);

  // 台商薪資：被辨識後資金匯入受阻，開戰後更快
  const payrollDrop = atWar ? 0.03 : s.flags.has('detected') ? 0.01 : 0;
  h.twBusinessPayroll = Math.max(0, h.twBusinessPayroll - payrollDrop * ctx.param('home.payrollDependence') * 2);

  // 物價
  h.priceIndex += atWar ? ctx.param('home.priceRisePerDay') : 0;

  // 士氣：開戰後每日基礎衰減 + 船團損失 + 停工壓力
  if (atWar) {
    let decay = ctx.param('home.moraleDecayPerDay');
    if (a.econTolerance === 'low') decay *= ctx.param('home.lowTolMoraleMult');
    decay += fleetLossToday * 10 * ctx.param('home.moraleLossPerFleetLoss');
    decay += h.coastalShutdown * 2;
    h.morale = Math.max(0, h.morale - decay);
  }

  // 事件
  for (const t of [0.1, 0.3, 0.5]) {
    if (prevShutdown < t && h.coastalShutdown >= t) {
      ctx.emit('homefront', 'coastalShutdown', `福建、廣東沿海停工比例達 ${pct(t)}，台資廠發不出薪水的消息開始在工人群組流傳。`, {
        coastalShutdown: h.coastalShutdown,
        twBusinessPayroll: h.twBusinessPayroll,
      });
    }
  }
  if (h.morale < 40 && !s.flags.has('moraleLow')) {
    s.flags.add('moraleLow');
    ctx.emit('homefront', 'moraleLow', '內部通報：沿海省份情緒指標跌破警戒線，宣傳口徑改為「階段性目標已達成」。', {
      morale: h.morale,
    });
  }
}
