/**
 * 頭版分享卡：1080×1350 Canvas → PNG。
 * 標題公式 = 「我以為問題是{玩家最後改的假設或美軍}。問題是{failedGate 對應的三個名詞}。」
 */
import type { Assumptions, Outcome, Run } from '../engine/types.js';
import { encodeShare } from '../engine/share.js';
import type { BatchStats } from './chapter.js';

export const ASSUMPTION_LABEL: Record<keyof Assumptions, string> = {
  month: '月份',
  scale: '動員規模',
  us: '美軍',
  japan: '日本',
  twReserve: '台灣後備',
  econTolerance: '經濟容忍',
  mainAxis: '主攻軸',
  auxiliary: '輔助作戰',
  greyZone: '灰色作戰',
};

const NOUNS: Record<string, [string, string, string]> = {
  windowClosed: ['天候', '浪高', '登陸艇'],
  fleetBroken: ['船', '補給線', '時間'],
  coastalMissilesIntact: ['機動發射車', '偵察', '三天'],
  tooSlow: ['吞吐量', '海況', '守方縱深'],
  secondWaveFailed: ['第二波', '重裝備', '守備旅'],
  beachheadCrushed: ['守備旅', '火砲', '四十八小時'],
  forcesDepleted: ['縱深', '後備旅', '補給'],
  moraleCollapse: ['家前線', '薪水', '士氣'],
  day30: ['時間', '補給', '耐心'],
};

export function shareTitle(o: Outcome, lastChanged: keyof Assumptions | null, stats: BatchStats): { kicker: string; title: string } {
  const x = lastChanged ? ASSUMPTION_LABEL[lastChanged] : '美軍';
  if (o.reason === 'objectiveReached') {
    return { kicker: `D+${o.endedAt.day} 達成戰略目標`, title: `這一局過了。${stats.n} 局裡有 ${stats.objectiveN} 局過。` };
  }
  const nouns = NOUNS[o.failedBy ?? 'day30'] ?? NOUNS['day30']!;
  const kicker = o.reason === 'timeout' ? `登陸於第${o.endedAt.day}天停止` : `登陸於第${o.endedAt.day}天終止`;
  return { kicker, title: `我以為問題是${x}。\n問題是${nouns[0]}、${nouns[1]}、${nouns[2]}。` };
}

export function assumptionSummary(a: Assumptions): string {
  const axis = { north: '主攻北部', central: '主攻中部', south: '主攻南部', east: '主攻東岸' }[a.mainAxis];
  const aux = { none: '不分兵', penghu: '先取澎湖', eastFeint: '東岸佯攻', blockadeFirst: '封鎖為主' }[a.auxiliary];
  const us = { none: '美軍不介入', delayed: '美軍延遲介入', immediate: '美軍立即介入' }[a.us];
  const jp = { neutral: '日本中立', bases: '日本開放基地', belligerent: '日本參戰' }[a.japan];
  const scale = { raid: '偷襲型', medium: '中型動員', full: '全面動員' }[a.scale];
  return `${axis} · ${aux} · ${us} · ${jp} · ${scale} · ${a.month} 月 · 後備 ${Math.round(a.twReserve * 100)}%`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

export interface ShareCardInput {
  run: Run;
  stats: BatchStats;
  histogram: { day: number; count: number }[];
  lastChanged: keyof Assumptions | null;
  runIndex: number;
}

export function drawShareCard(canvas: HTMLCanvasElement, input: ShareCardInput): void {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { run, stats } = input;
  const o = run.outcome;
  const serif = '"Noto Serif TC", "PingFang TC", serif';
  const sans = '"Noto Sans TC", "PingFang TC", sans-serif';
  const mono = '"IBM Plex Mono", Menlo, monospace';
  ctx.fillStyle = '#0F1B2D';
  ctx.fillRect(0, 0, W, H);
  // 網格
  ctx.strokeStyle = '#1B2B42';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  const pad = 72;
  ctx.fillStyle = '#9DB4D0';
  ctx.font = `28px ${mono}`;
  ctx.textBaseline = 'top';
  ctx.fillText(`戰情快報 · 2027.${String(run.assumptions.month).padStart(2, '0')}`, pad, pad);
  const right = `第 ${input.runIndex + 1}/${stats.n} 局`;
  ctx.fillText(right, W - pad - ctx.measureText(right).width, pad);

  const { kicker, title } = shareTitle(o, input.lastChanged, stats);
  ctx.fillStyle = '#E0533F';
  ctx.font = `600 30px ${sans}`;
  ctx.fillText(kicker, pad, 360);
  ctx.fillStyle = '#E8EEF5';
  ctx.font = `700 76px ${serif}`;
  const lines = wrap(ctx, title, W - pad * 2);
  let y = 420;
  for (const l of lines) {
    ctx.fillText(l, pad, y);
    y += 100;
  }
  ctx.fillStyle = '#9DB4D0';
  ctx.font = `30px ${sans}`;
  const summary = wrap(ctx, assumptionSummary(run.assumptions), W - pad * 2);
  y += 20;
  for (const l of summary) {
    ctx.fillText(l, pad, y);
    y += 44;
  }
  // 數字
  const stat = (label: string, value: string, x: number, yy: number) => {
    ctx.fillStyle = '#9DB4D0';
    ctx.font = `24px ${sans}`;
    ctx.fillText(label, x, yy);
    ctx.fillStyle = '#E8EEF5';
    ctx.font = `600 44px ${mono}`;
    ctx.fillText(value, x, yy + 34);
  };
  const sy = Math.max(y + 40, 820);
  stat('最多上岸', `${o.maxTroopsAshore.toLocaleString('zh-Hant-TW')} 人`, pad, sy);
  stat('船團損失', `${Math.round(o.fleetLoss * 100)}%`, pad + 330, sy);
  stat('沿海停工', `${Math.round(o.coastalShutdown * 100)}%`, pad + 620, sy);

  // 直方圖
  const hx = pad;
  const hy = H - 330;
  const hw = 560;
  const hh = 140;
  const maxC = Math.max(1, ...input.histogram.map((b) => b.count));
  const bw = hw / Math.max(1, input.histogram.length);
  input.histogram.forEach((b, i) => {
    const bh = (b.count / maxC) * hh;
    ctx.fillStyle = b.day === o.endedAt.day ? '#E0533F' : '#5F7C9E';
    ctx.fillRect(hx + i * bw + 1, hy + hh - bh, Math.max(2, bw - 3), bh);
  });
  ctx.strokeStyle = '#5F7C9E';
  ctx.beginPath();
  ctx.moveTo(hx, hy + hh + 1);
  ctx.lineTo(hx + hw, hy + hh + 1);
  ctx.stroke();
  ctx.fillStyle = '#9DB4D0';
  ctx.font = `22px ${mono}`;
  const d0 = input.histogram[0]?.day ?? 0;
  const d1 = input.histogram[input.histogram.length - 1]?.day ?? 0;
  ctx.fillText(d0 < 0 ? `D${d0}` : `D+${d0}`, hx, hy + hh + 12);
  const lastLbl = d1 < 0 ? `D${d1}` : `D+${d1}`;
  ctx.fillText(lastLbl, hx + hw - ctx.measureText(lastLbl).width, hy + hh + 12);
  ctx.fillStyle = '#E0533F';
  const me = `D+${o.endedAt.day} 本局`;
  ctx.fillText(me, hx + hw / 2 - ctx.measureText(me).width / 2, hy + hh + 12);

  // 右下統計與編碼
  ctx.fillStyle = '#9DB4D0';
  ctx.font = `22px ${mono}`;
  const rx = W - pad;
  const linesR = [`同組假設 ${stats.n} 局`, `登陸成功 ${stats.landedN} 局 · 穩固灘頭堡 ${stats.solidN} 局`, `達成目標 ${stats.objectiveN} 局`, `seed ${run.seed} · ${run.engineVersion}`, encodeShare(run.assumptions, run.seed)];
  let ry = hy - 10;
  for (const l of linesR) {
    ctx.fillText(l, rx - ctx.measureText(l).width, ry);
    ry += 32;
  }
  ctx.fillStyle = '#5F7C9E';
  ctx.font = `20px ${sans}`;
  ctx.fillText('如果你是阿共，你要怎麼打過來？ · 台海兵推教育版 · 本機模擬 · 所有參數附公開來源', pad, H - 110);
  ctx.fillText('教育用途的簡化模型，不代表任何官方評估。', pad, H - 76);
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
