/**
 * 資料來源頁：四根柱子、參數表（可搜尋、看 range 與 source）、現實面的考量（docs/realism.md）、驗收與 ADR、致謝。
 * 這一頁是教材的一部分，不是免責聲明。
 */
import { useMemo, useState } from 'preact/hooks';
import { PARAM_DEFS } from '../../engine/params.js';
import { ENGINE_VERSION } from '../../engine/simulate.js';
import { renderMarkdown } from '../markdown.ts';
import realism from '../../../docs/realism.md?raw';

const GROUP_NAME: Record<string, string> = {
  weather: '天候',
  lift: '運量',
  detect: '偵測',
  fire: '火力',
  gate: '門檻',
  cross: '渡海損耗',
  beach: '灘頭',
  regional: '區域',
  world: '世界',
  home: '家前線',
  inland: '縱深',
  aux: '輔助作戰',
};

const PILLARS = [
  { src: 'CSIS《The First Battle of the Next War》(2023)', layer: '軍事層骨架與校準', what: '24 局結果分佈、2026 年兩棲船團 96 艘、D 日約 8,000 人上岸、基準局 10–14 天船團 ≥ 90% 被擊沉、台灣單獨作戰前 10 天岸置飛彈擊沉約 16%' },
  { src: '《阿共打來怎麼辦》《再談阿共打來怎麼辦》', layer: '常識層約束', what: '飛彈洗地打不掉機動發射車、準備不能超過三個月、灘頭只有數百公尺寬、民船載重與防護有限、後勤是決定因素' },
  { src: 'Easton《The Chinese Invasion Threat》(2017)、《Hostile Harbors》(2021)', layer: '地理層', what: '14 處可登陸灘頭、4 月與 10 月兩個窗口、90／60／30 天徵候階段、台中港唯一 High 的奪港目標、花蓮 Low' },
  { src: 'DoD《中國軍力報告》2023／2024、各國公開數據', layer: '數字層', what: '兩棲艦 58 + 3 艘、火箭軍短程 300／900、至少 63 艘適合軍用的民用滾裝船、台灣聯兵旅 7 個、中央氣象署 1911–2024 侵台颱風月分佈' },
];

export function Sources() {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [onlyAssumed, setOnlyAssumed] = useState(false);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return PARAM_DEFS.filter((p) => {
      if (group !== 'all' && p.id.split('.')[0] !== group) return false;
      if (onlyAssumed && !p.assumption) return false;
      if (!needle) return true;
      return [p.id, p.label, p.source, p.note ?? '', p.unit].some((s) => s.toLowerCase().includes(needle));
    });
  }, [q, group, onlyAssumed]);
  const assumed = PARAM_DEFS.filter((p) => p.assumption).length;
  const groups = [...new Set(PARAM_DEFS.map((p) => p.id.split('.')[0]!))];
  const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('zh-Hant-TW') : String(Math.round(n * 1000) / 1000));

  return (
    <div class="sources">
      <section class="src-intro">
        <div class="lbl">理論基礎與資料來源</div>
        <h1 class="serif">每個數字有出處；沒有出處的，寫明是假設。</h1>
        <p>
          模型站在四根柱子上，每根各管一層。參數庫共 {PARAM_DEFS.length} 筆，{PARAM_DEFS.length - assumed} 筆有直接出處、{assumed} 筆標為「模型假設」。模擬時每筆在公開範圍內抽樣，不用點估計；超出範圍的設定一律標紅。引擎 {ENGINE_VERSION}。
        </p>
        <table class="pillars">
          <thead>
            <tr>
              <th>來源</th>
              <th>管哪一層</th>
              <th>拿什麼</th>
            </tr>
          </thead>
          <tbody>
            {PILLARS.map((p) => (
              <tr key={p.src}>
                <td>{p.src}</td>
                <td>{p.layer}</td>
                <td>{p.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
          <h2 class="serif" style="margin:0;font-size:19px">參數表</h2>
          <div class="muted" style="font-size:12px">value 是眾數；每局在 range 內以三角分佈抽一次。</div>
        </div>
        <div class="src-controls">
          <input type="search" placeholder="搜尋 id、名稱、來源…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} aria-label="搜尋參數" data-testid="param-search" />
          <select value={group} onChange={(e) => setGroup((e.currentTarget as HTMLSelectElement).value)} aria-label="參數群">
            <option value="all">全部參數群</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {GROUP_NAME[g] ?? g}
              </option>
            ))}
          </select>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px">
            <input type="checkbox" checked={onlyAssumed} onChange={(e) => setOnlyAssumed((e.currentTarget as HTMLInputElement).checked)} />
            只看模型假設
          </label>
          <span class="mono muted" style="font-size:12px" data-testid="param-count">
            {rows.length} / {PARAM_DEFS.length}
          </span>
        </div>
        <div class="book-wrap" style="max-height:60vh">
          <table class="book params">
            <thead>
              <tr>
                <th>參數</th>
                <th>值</th>
                <th>範圍</th>
                <th>單位</th>
                <th>來源</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} class={p.assumption ? 'assumed' : ''}>
                  <td>
                    <div>{p.label}</div>
                    <div class="mono muted" style="font-size:10px">{p.id}</div>
                    {p.assumption && <span class="badge">模型假設</span>}
                  </td>
                  <td class="mono">{fmt(p.value)}</td>
                  <td class="mono">
                    {fmt(p.range[0])}–{fmt(p.range[1])}
                  </td>
                  <td>{p.unit}</td>
                  <td>
                    <div>{p.source}</div>
                    {p.note && <div class="muted" style="font-size:11px">{p.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="src-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(realism) }} />

      <section class="src-prose">
        <h2>驗收與取捨</h2>
        <p>
          驗收標準本身改過一次：HANDOFF 原寫「建立灘頭堡 10–30%」，與 CSIS「每局都上得了岸、輸在之後」不一致。差距主要在名詞定義、其次在兩套世界觀、最後是「首波衝灘被打回海裡的機率」沒有任何公開數字。2026 年 10 月決定改以「穩固灘頭堡」為準並同時顯示兩個數字，理由與量測寫在 ADR-0001，不藏在係數裡。
        </p>
        <p>模型從第一版到現在的每一次改動都記在校準紀錄裡：改了什麼、為什麼、分佈怎麼變。沒有一次是為了讓數字好看而調係數。</p>
      </section>

      <section class="src-prose">
        <h2>致謝</h2>
        <p>
          《阿共打來怎麼辦》《再談阿共打來怎麼辦》的作者與軍事科普的目標；CSIS 國際安全計畫；Ian Easton 與 Project 2049；中央氣象署、國防部與立法院預算中心的公開資料；CMSI、TrendForce、Bloomberg、Rhodium Group 的公開研究。
        </p>
        <p>這份教材在「海峽是牆」與「第一趟過得去、死在後面幾趟」之間做了取捨，取捨的過程公開。你不必相信我們；你可以去看。</p>
        <p class="muted" style="font-size:12px">本模擬為教育用途的簡化模型，不代表任何官方評估。所有運算在你的瀏覽器，不上傳任何資料。</p>
      </section>
    </div>
  );
}
