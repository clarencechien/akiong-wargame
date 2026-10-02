/**
 * 頭版分享卡：1080×1920 直式 Canvas → PNG。
 * 標題公式 = 「我以為問題是{玩家最後改的假設或美軍}。問題是{failedGate 對應的三個名詞}。」
 * 內容：標題、假設、六個數字（各附一句說明）、戰局里程碑、終止日分佈、seed 與分享編碼。
 */
import type { Assumptions, Outcome, Run } from '../engine/types.js';
import { encodeShare } from '../engine/share.js';
import { P } from '../engine/params.js';
import { avgStrength } from '../engine/gateinfo.js';
import type { BatchStats } from './chapter.js';
import { shortDate, dateLabel } from './dates.js';

export const CARD_W = 1080;
export const CARD_H = 1920;

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

export function shareTitle(o: Outcome, lastChanged: keyof Assumptions | null, stats: BatchStats, month = 4): { kicker: string; title: string } {
  const x = lastChanged ? ASSUMPTION_LABEL[lastChanged] : '美軍';
  const when = `${shortDate(month, o.endedAt.day)}（D${o.endedAt.day >= 0 ? '+' : ''}${o.endedAt.day}）`;
  if (o.reason === 'objectiveReached') {
    return { kicker: `${when} 達成戰略目標`, title: `這一局過了。${stats.n} 局裡有 ${stats.objectiveN} 局過。` };
  }
  const nouns = NOUNS[o.failedBy ?? 'day30'] ?? NOUNS['day30']!;
  const kicker = o.failedBy === 'coastalMissilesIntact' ? `${when} 船團沒有出港` : o.reason === 'timeout' ? `登陸於 ${when} 停止` : `登陸於 ${when} 終止`;
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

/** 戰局里程碑：挑關鍵事件，配短標籤。 */
export function milestones(run: Run, max = 7): { day: number; label: string; end?: boolean }[] {
  const short: Record<string, string> = {
    detected: '船團被商用衛星辨識',
    requisition: '徵用民用滾裝船',
    twReserveActivated: '台灣發布後備召集令',
    strike: 'D 日，首波飛彈落下',
    fleetDeparture: '第一波船團出港',
    penghuTaken: '澎湖易手',
    typhoon: '颱風警報，渡海中止',
    windowClosed: '海況窗口關閉',
    usEngaged: '美軍開始打擊船團',
    landingStart: '灘頭戰開始',
    solidBeachhead: '灘頭堡穩固',
    moraleLow: '後方士氣跌破警戒線',
  };
  const out: { day: number; label: string; end?: boolean }[] = [];
  for (const e of run.events) {
    if (e.kind === 'phaseAdvance' && e.data?.['to'] === 'inland') out.push({ day: e.day, label: '灘頭堡撐過四十八小時' });
    else if (short[e.kind]) out.push({ day: e.day, label: short[e.kind]! });
  }
  const o = run.outcome;
  const endLabel = o.reason === 'objectiveReached' ? '達成戰略目標' : o.failedBy === 'coastalMissilesIntact' ? '船團沒有出港' : o.failedBy === 'moraleCollapse' ? '中央宣布停止' : o.reason === 'timeout' ? '第三十天，膠著' : '登陸終止';
  // 去重同一天同標籤；若太多，保留首尾並均勻抽
  const dedup = out.filter((m, i) => i === 0 || m.label !== out[i - 1]!.label);
  let picked = dedup;
  if (dedup.length > max - 1) {
    picked = [];
    for (let k = 0; k < max - 1; k++) picked.push(dedup[Math.round((k * (dedup.length - 1)) / (max - 2))]!);
    picked = picked.filter((m, i, arr) => i === 0 || m !== arr[i - 1]);
  }
  picked.push({ day: o.endedAt.day, label: endLabel, end: true });
  return picked;
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
  const W = CARD_W;
  const H = CARD_H;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { run, stats } = input;
  const o = run.outcome;
  const a = run.assumptions;
  const p = run.sampledParams;
  const last = run.snapshots[run.snapshots.length - 1];
  const serif = '"Noto Serif TC", "PingFang TC", serif';
  const sans = '"Noto Sans TC", "PingFang TC", sans-serif';
  const mono = '"IBM Plex Mono", Menlo, monospace';
  const PAD = 72;
  const INK = '#E8EEF5';
  const DIM = '#9DB4D0';
  const RED = '#E0533F';
  const LINE = '#1E2F47';

  ctx.fillStyle = '#0F1B2D';
  ctx.fillRect(0, 0, W, H);
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
  ctx.textBaseline = 'top';
  const text = (t: string, x: number, y: number, font: string, color: string, align: 'left' | 'right' = 'left') => {
    ctx.font = font;
    ctx.fillStyle = color;
    const w = ctx.measureText(t).width;
    ctx.fillText(t, align === 'right' ? x - w : x, y);
  };
  const rule = (y: number) => {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
  };

  // 報頭
  text(`戰情快報 · 2027.${String(a.month).padStart(2, '0')}`, PAD, PAD, `26px ${mono}`, DIM);
  text(`第 ${input.runIndex + 1}/${stats.n} 局 · seed ${run.seed}`, W - PAD, PAD, `26px ${mono}`, DIM, 'right');
  rule(PAD + 44);

  // 標題
  const { kicker, title } = shareTitle(o, input.lastChanged, stats, a.month);
  text(kicker, PAD, 150, `600 30px ${sans}`, RED);
  ctx.font = `700 70px ${serif}`;
  const lines = wrap(ctx, title, W - PAD * 2);
  let y = 198;
  for (const l of lines) {
    text(l, PAD, y, `700 70px ${serif}`, INK);
    y += 92;
  }
  ctx.font = `28px ${sans}`;
  for (const l of wrap(ctx, assumptionSummary(a), W - PAD * 2)) {
    text(l, PAD, y + 8, `28px ${sans}`, DIM);
    y += 40;
  }
  y += 36;
  rule(y);
  y += 28;

  // 六個數字 + 一句說明
  const required = P(p, 'beach.requiredTroops');
  const fleetLeft = last ? avgStrength(last) : 1 - o.fleetLoss;
  const stat: { v: string; k: string; note: string }[] = [
    { v: `${o.maxTroopsAshore.toLocaleString('zh-Hant-TW')} 人`, k: '最多上岸', note: `建立灘頭堡需約 ${Math.round(required / 1000)},000 人` },
    { v: `${Math.round(fleetLeft * 100)}%`, k: '船團剩餘', note: 'CSIS 基準兵推：兩週內約剩一成' },
    { v: `${Math.round((last?.military.twCoastalMissiles ?? 1) * 100)}%`, k: '守方岸置飛彈剩', note: '三天飛彈打不掉機動發射車' },
    { v: `${Math.round(o.coastalShutdown * 100)}%`, k: '沿海停工', note: '家前線：先落在自己人身上' },
    { v: `${last?.military.weatherWindowDays ?? 0} 天`, k: '好天剩餘', note: `${a.month} 月窗口約 ${Math.round(P(p, `weather.windowDays.m${a.month}`))} 天，用完就沒了` },
    { v: String(Math.round(last?.homefront.morale ?? 0)), k: '士氣終值', note: '低於 40 補給減半，25 停戰' },
  ];
  const colW = (W - PAD * 2 - 24 * 2) / 3;
  stat.forEach((st, i) => {
    const cx = PAD + (i % 3) * (colW + 24);
    const cy = y + Math.floor(i / 3) * 150;
    text(st.k, cx, cy, `24px ${sans}`, DIM);
    text(st.v, cx, cy + 32, `600 50px ${mono}`, INK);
    ctx.font = `21px ${sans}`;
    text(wrap(ctx, st.note, colW)[0] ?? '', cx, cy + 96, `21px ${sans}`, DIM);
  });
  y += 150 * 2 + 10;
  rule(y);
  y += 28;

  // 里程碑
  text('戰局里程碑', PAD, y, `24px ${sans}`, DIM);
  y += 40;
  const ms = milestones(run, 7);
  const lineX = PAD + 10;
  ctx.strokeStyle = '#5F7C9E';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lineX, y + 6);
  ctx.lineTo(lineX, y + 6 + (ms.length - 1) * 54);
  ctx.stroke();
  ms.forEach((m, i) => {
    const my = y + i * 54;
    ctx.fillStyle = m.end ? RED : '#0F1B2D';
    ctx.strokeStyle = m.end ? RED : '#9DB4D0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(lineX, my + 14, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(dateLabel(a.month, m.day), lineX + 30, my, `26px ${mono}`, m.end ? RED : DIM);
    text(m.label, lineX + 30 + 230, my, `${m.end ? 600 : 400} 28px ${sans}`, m.end ? RED : INK);
  });
  y += ms.length * 54 + 16;
  rule(y);
  y += 28;

  // 分佈
  text(`同組假設 ${stats.n} 局 · 終止日分佈（紅色是本局）`, PAD, y, `24px ${sans}`, DIM);
  y += 40;
  const hx = PAD;
  const hw = W - PAD * 2;
  const hh = 150;
  const maxC = Math.max(1, ...input.histogram.map((b) => b.count));
  const bw = hw / Math.max(1, input.histogram.length);
  input.histogram.forEach((b, i) => {
    const bh = (b.count / maxC) * hh;
    ctx.fillStyle = b.day === o.endedAt.day ? RED : '#5F7C9E';
    ctx.fillRect(hx + i * bw + 1, y + hh - bh, Math.max(2, bw - 3), bh);
  });
  ctx.strokeStyle = '#5F7C9E';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx, y + hh + 1);
  ctx.lineTo(hx + hw, y + hh + 1);
  ctx.stroke();
  const d0 = input.histogram[0]?.day ?? 0;
  const d1 = input.histogram[input.histogram.length - 1]?.day ?? 0;
  text(shortDate(a.month, d0), hx, y + hh + 10, `22px ${mono}`, DIM);
  text(shortDate(a.month, d1), hx + hw, y + hh + 10, `22px ${mono}`, DIM, 'right');
  const me = `${shortDate(a.month, o.endedAt.day)} 本局`;
  ctx.font = `22px ${mono}`;
  text(me, hx + hw / 2 - ctx.measureText(me).width / 2, y + hh + 10, `22px ${mono}`, RED);
  y += hh + 48;
  text(`登陸成功 ${stats.landedN} 局 · 穩固灘頭堡 ${stats.solidN} 局 · 達成目標 ${stats.objectiveN} 局 · 中位終止 ${shortDate(a.month, stats.medianDay)}`, PAD, y, `24px ${sans}`, INK);

  // 頁尾
  text(encodeShare(a, run.seed), W - PAD, H - 150, `22px ${mono}`, DIM, 'right');
  text(`引擎 ${run.engineVersion} · 決定性 seed · 同一編碼在任何人的瀏覽器重算得到同一局`, PAD, H - 150, `20px ${sans}`, DIM);
  text('如果你是阿共，你要怎麼打過來？ · 台海兵推教育版 · 本機模擬 · 所有參數附公開來源', PAD, H - 112, `20px ${sans}`, '#5F7C9E');
  text('教育用途的簡化模型，不代表任何官方評估。', PAD, H - 80, `20px ${sans}`, '#5F7C9E');
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
