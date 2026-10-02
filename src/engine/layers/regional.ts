import type { Ctx } from '../context.js';
import { dayLabel } from '../context.js';

/** 區域層：美軍介入倒數、日本基地、琉球封鎖線。每小時呼叫。 */
export function tickRegional(ctx: Ctx): void {
  const { s, k } = ctx;
  if (s.hour !== 0) return;
  if (k.usEntryDay !== null && !s.regional.usEngaged && s.day >= k.usEntryDay && s.day >= 0) {
    s.regional.usEngaged = true;
    s.flags.add('usEngaged');
    const where = ctx.a.japan === 'neutral' ? '自關島與航母' : '自沖繩、九州與關島';
    ctx.emit('regional', 'usEngaged', `美軍${where}開始對海峽船團發動打擊（${dayLabel(s.day)}）。`, {
      sortieCoef: k.sortieCoef,
    });
    // 美軍介入後紅方制空下降
    const drop = ctx.param('regional.usAirShare') * k.sortieCoef;
    s.military.airControl = Math.max(0, s.military.airControl - drop);
    if (ctx.a.japan !== 'neutral') {
      s.regional.ryukyuClosed = true;
      ctx.emit('regional', 'ryukyuClosed', '琉球群島水道由美日海空兵力封閉，解放軍東出太平洋的航路受限。');
    }
  }
  if (ctx.a.japan === 'belligerent' && s.day === 1 && !s.flags.has('japanBelligerent')) {
    s.flags.add('japanBelligerent');
    ctx.emit('regional', 'japanBelligerent', '日本宣布行使集體自衛權，自衛隊加入對船團的攻擊。');
  }
}

/** 渡海損耗的區域倍數：美軍介入 → ×(1 + (usMultiplier − 1) × 出擊架次係數)。 */
export function regionalLossMultiplier(ctx: Ctx): number {
  if (!ctx.s.regional.usEngaged) return 1;
  const usMult = ctx.param('cross.usMultiplier');
  return 1 + (usMult - 1) * ctx.k.sortieCoef;
}
