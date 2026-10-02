/**
 * 日期：D 日定在發動月份的 10 日（2027 年）。顯示格式「5/1（D+22）」；史書正文用「五月一日」。
 * 引擎內部一律用 D±n，只有顯示層換算。
 */
const ZH = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const D_DAY_OF_MONTH = 10;
export const WAR_YEAR = 2027;

export function calendar(month: number, day: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(WAR_YEAR, month - 1, D_DAY_OF_MONTH + day));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export const dLabel = (day: number): string => (day < 0 ? `D${day}` : `D+${day}`);

/** 「5/1（D+22）」 */
export function dateLabel(month: number, day: number): string {
  const c = calendar(month, day);
  return `${c.m}/${c.d}（${dLabel(day)}）`;
}

/** 「5/1」 */
export function shortDate(month: number, day: number): string {
  const c = calendar(month, day);
  return `${c.m}/${c.d}`;
}

function zhNum(n: number): string {
  if (n < 10) return ZH[n]!;
  if (n < 20) return n === 10 ? '十' : `十${ZH[n % 10]}`;
  return `${ZH[Math.floor(n / 10)]}十${n % 10 ? ZH[n % 10] : ''}`;
}

/** 「五月一日」 */
export function zhDate(month: number, day: number): string {
  const c = calendar(month, day);
  return `${zhNum(c.m)}月${zhNum(c.d)}日`;
}

/** 把文字裡的 D±n 換成「5/1（D+22）」；已經帶日期的不重複換。 */
export function annotateDates(text: string, month: number): string {
  return text.replace(/(^|[^/\d（(])D([+-]\d{1,2})(?![）\d])/g, (_m, pre: string, n: string) => `${pre}${dateLabel(month, Number(n))}`);
}
