import type { Ctx } from '../context.js';
import { dayLabel, fmt } from '../context.js';
import type { GateResult } from './gates.js';

/** 階段 1：動員與集結（D-assembly → D-1）。 */
export function tickMobilize(ctx: Ctx): void {
  const { s, k, a } = ctx;
  if (s.hour !== 0) return;
  if (s.day === k.detectedDay && !s.flags.has('detected')) {
    s.flags.add('detected');
    ctx.emit('military', 'detected', `商用衛星影像顯示${scaleText(a.scale)}船團在福建沿海集結，開源情報帳號在 ${dayLabel(s.day)} 公開辨識。`, {
      leadDays: -k.detectedDay,
    });
    ctx.emit('world', 'marketsReact', '台股與亞洲股市開盤重挫，保險公司暫停承保台海航線戰爭險。');
  }
  const lag = Math.round(ctx.param('detect.twReserveActivationLagDays'));
  if (s.flags.has('detected') && s.day === k.detectedDay + lag && !s.flags.has('twReserveActivated')) {
    s.flags.add('twReserveActivated');
    ctx.emit('military', 'twReserveActivated', `台灣國防部發布後備召集令，動員率設定 ${Math.round(a.twReserve * 100)}%，第一批後備旅開始進駐海岸陣地。`, {
      twReserve: a.twReserve,
    });
  }
  if (a.scale !== 'raid' && s.day === k.detectedDay + 2 && !s.flags.has('requisition')) {
    s.flags.add('requisition');
    ctx.emit('homefront', 'requisition', '交通運輸部徵用渤海、福建航線滾裝船，渡輪航班全面停駛，船東與船員接到「國防動員」通知。');
  }
}

export function gateMobilize(ctx: Ctx): GateResult | null {
  const { s, k } = ctx;
  if (!(s.day === -1 && s.hour === 23)) return null;
  const minDays = 3;
  if (k.windowDays < minDays) {
    return {
      kind: 'fail',
      gate: 'mobilize',
      by: 'windowClosed',
      shortfall: (minDays - k.windowDays) / minDays,
      text: `船團已就位，但 ${ctx.a.month} 月可用海況只有 ${k.windowDays} 天，不足以完成一次渡海；聯合作戰指揮中心下令待命，窗口沒有再開。`,
    };
  }
  return {
    kind: 'pass',
    next: 'strike',
    text: `船團就位，${ctx.a.month} 月海況窗口估計 ${k.windowDays} 天，總運量 ${fmt(k.liftCapacity)} 人。D 日下達。`,
  };
}

function scaleText(scale: Ctx['a']['scale']): string {
  return scale === 'raid' ? '小規模' : scale === 'medium' ? '數十艘規模的' : '含徵用民船的大規模';
}
