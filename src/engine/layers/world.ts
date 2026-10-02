import type { Ctx } from '../context.js';
import { pct } from '../context.js';

/** 世界層：晶片、航運、能源、市場。由軍事事件與時間觸發。每小時呼叫。 */
export function tickWorld(ctx: Ctx): void {
  const { s } = ctx;
  if (s.hour !== 0) return;
  const w = s.world;
  const marketMax = ctx.param('world.marketShockMax');

  // 集結被辨識 → 市場先跌一部分
  if (s.flags.has('detected') && s.day < 0) {
    w.marketShock = Math.max(marketMax * 0.3, w.marketShock - 0.01);
  }
  if (s.phase === 'mobilize') return;

  // 開戰後：晶片停工、航運改道、能源、市場
  if (!s.flags.has('chipShutdown')) {
    s.flags.add('chipShutdown');
    w.chipOutput = ctx.param('world.chipOutputAfterStrike');
    ctx.emit('world', 'chipShutdown', `新竹、台中、台南晶圓廠停工，全球先進製程產能剩 ${pct(w.chipOutput)}。`, {
      chipOutput: w.chipOutput,
    });
  }
  const rerouteMax = ctx.param('world.shippingRerouteMax');
  const prevReroute = w.shippingReroute;
  w.shippingReroute = Math.min(rerouteMax, w.shippingReroute + rerouteMax / 3);
  if (prevReroute < 0.5 && w.shippingReroute >= 0.5) {
    ctx.emit('world', 'shippingReroute', `超過半數貨櫃航線改道呂宋海峽以東，戰爭險保費跳升。`, {
      shippingReroute: w.shippingReroute,
    });
  }
  const energyMax = ctx.param('world.energyPriceShock');
  w.energyPrice = Math.min(energyMax, w.energyPrice + (energyMax - 1) / 5);
  const prevMarket = w.marketShock;
  w.marketShock = Math.max(marketMax, w.marketShock + marketMax / 5);
  if (prevMarket > marketMax * 0.6 && w.marketShock <= marketMax * 0.6) {
    ctx.emit('world', 'marketShock', `全球股市自開戰以來跌幅達 ${pct(-w.marketShock)}，半導體供應鏈斷裂訂價進場。`, {
      marketShock: w.marketShock,
    });
  }
  // 台灣能源庫存（1.0 只倒數，不觸發結局）
  w.twEnergyDays = Math.max(0, w.twEnergyDays - 1);
}
