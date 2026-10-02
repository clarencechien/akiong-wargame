// M5 才實作：聲音觸發與抽樣。M1 先留介面，避免 simulate 依賴改動。
import type { Ctx } from './context.js';
import type { Event } from './types.js';

export function maybeVoice(_ctx: Ctx): Event[] {
  return [];
}
