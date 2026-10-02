import { useMemo } from 'preact/hooks';
import type { Assumptions } from '../../engine/types.js';
import { preview, intelSlots, fillSlots } from '../../engine/preview.js';
import { ENGINE_VERSION } from '../../engine/simulate.js';
import { hashAssumptions } from '../../engine/assumptions.js';
import intelNotes from '../../../data/intel-notes.json';
import { Minimap } from './Minimap.tsx';
import { assumptions, runCount, running, progress, error, setAssumption, isMobile, recent, loadRecent, lastChanged } from '../state.ts';
import { clearBatches } from '../../store/db.js';
import { assumptionSummary } from '../../narrative/sharecard.js';

type Notes = Record<string, Record<string, string>>;
const NOTES = intelNotes as unknown as Notes;

interface Option<V> {
  value: V;
  label: string;
  warn?: boolean;
}

function Row<K extends keyof Assumptions>(props: {
  no: string;
  title: string;
  hint?: string;
  k: K;
  options: Option<NonNullable<Assumptions[K]>>[];
  slots: Record<string, string>;
  last?: boolean;
}) {
  const a = assumptions.value;
  const cur = a[props.k];
  const note = NOTES[props.k]?.[String(cur)] ?? '';
  const warn = props.options.find((o) => o.value === cur)?.warn ?? false;
  return (
    <div class={`row${props.last ? ' last' : ''}`}>
      <div class="h">
        <span>
          {props.no} {props.title}
        </span>
        {props.hint && <span class="mono muted" style="font-size:11px">{props.hint}</span>}
      </div>
      <div class="pills" role="radiogroup" aria-label={props.title}>
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === cur}
            class={`pill${o.value === cur ? ' on' : ''}${o.warn ? ' warn' : ''}`}
            disabled={running.value}
            onClick={() => setAssumption(props.k, o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div class={`intel${warn ? ' warn' : ''}`}>{fillSlots(note, props.slots)}</div>
    </div>
  );
}

export function Warroom({ onOrder }: { onOrder: () => void }) {
  const a = assumptions.value;
  const pv = useMemo(() => preview(a), [a]);
  const slots = useMemo(() => intelSlots(a), [a]);
  const mobile = isMobile();
  const code = hashAssumptions(a).toString(16).padStart(8, '0').slice(0, 6).toUpperCase();
  const months = Array.from({ length: 12 }, (_, i) => ({ value: (i + 1) as Assumptions['month'], label: String(i + 1) }));
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const wan = (n: number) => (n >= 10000 ? `約 ${(n / 10000).toFixed(1).replace(/\.0$/, '')} 萬人` : `約 ${n.toLocaleString('zh-Hant-TW')} 人`);

  return (
    <div class="warroom">
      <div class="col left">
        <div class="card">
          <div class="lbl">你的身分</div>
          <div class="serif" style="font-size:18px;font-weight:600;line-height:26px">中央軍委聯合作戰指揮中心 總指揮</div>
          <div class="mono muted" style="font-size:12px">案號 TW-2027-{String(a.month).padStart(2, '0')} · 絕密</div>
          <div style="font-size:13px;line-height:20px;margin-top:4px">上級要求一年內完成統一。你決定何時、從哪裡、用多大規模、賭多少。</div>
        </div>
        <div class="col" style="gap:8px">
          <div class="lbl">你選的攻擊軸</div>
          <Minimap a={a} />
          <div class="muted" style="font-size:12px;line-height:18px">地圖隨 ⑦⑧ 的選擇改變。灰色虛線是你沒選、但模型知道的路線。</div>
        </div>
        {(recent.value?.length ?? 0) > 0 && (
          <div class="col" style="gap:6px">
            <div style="display:flex;justify-content:space-between;align-items:baseline">
              <div class="lbl">這台裝置跑過的局</div>
              <button type="button" class="muted" style="font-size:11px;text-decoration:underline" onClick={() => void clearBatches().then(loadRecent)}>
                清除
              </button>
            </div>
            <div class="recent">
              {recent.value!.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  class="recent-row"
                  disabled={running.value}
                  onClick={() => {
                    assumptions.value = { ...b.assumptions };
                    lastChanged.value = null;
                  }}
                  title="載回這組假設"
                >
                  <span style="font-size:12px;line-height:16px">{assumptionSummary(b.assumptions)}</span>
                  <span class="mono muted" style="font-size:10px">
                    {b.summary.n} 局 · 登陸 {b.summary.landed} · 穩固 {b.summary.solid} · 目標 {b.summary.objective} · 中位 D+{b.summary.medianDay}
                  </span>
                </button>
              ))}
            </div>
            <div class="muted" style="font-size:11px">只存假設、seed 與摘要在這台裝置的瀏覽器裡，不上傳。</div>
          </div>
        )}
        <div class="col" style="gap:6px;margin-top:auto">
          <div class="lbl">理論依據</div>
          <div class="muted" style="font-size:12px;line-height:18px">
            CSIS《The First Battle of the Next War》(2023) · 《阿共打來怎麼辦》《再談阿共打來怎麼辦》· Easton《The Chinese Invasion Threat》· DoD《中國軍力報告》
          </div>
        </div>
      </div>

      <div class="col" style="gap:0">
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:4px;gap:8px;flex-wrap:wrap">
          <div class="serif" style="font-size:19px;font-weight:600">八個假設</div>
          <div class="mono muted" style="font-size:11px">本機組合 #{code} · 第一版不上傳、不比較他人</div>
        </div>
        <div class="rows">
          <div>
            <Row no="①" title="發動月份" hint="天候窗口" k="month" options={months} slots={slots} />
            <Row
              no="②"
              title="動員規模"
              k="scale"
              options={[
                { value: 'raid', label: '偷襲型' },
                { value: 'medium', label: '中型' },
                { value: 'full', label: '全面＋徵用民船' },
              ]}
              slots={slots}
            />
            <Row
              no="③"
              title="美國介入"
              k="us"
              options={[
                { value: 'none', label: '不介入' },
                { value: 'delayed', label: '延遲 · D+7' },
                { value: 'immediate', label: '立即' },
              ]}
              slots={slots}
            />
            <Row
              no="④"
              title="日本態度"
              k="japan"
              options={[
                { value: 'neutral', label: '中立' },
                { value: 'bases', label: '開放基地' },
                { value: 'belligerent', label: '參戰' },
              ]}
              slots={slots}
              last
            />
          </div>
          <div>
            <Row
              no="⑤"
              title="台灣後備動員率"
              k="twReserve"
              options={[
                { value: 0.3, label: '30%' },
                { value: 0.55, label: '55%' },
                { value: 0.8, label: '80%' },
              ]}
              slots={slots}
            />
            <Row
              no="⑥"
              title="經濟自損容忍"
              k="econTolerance"
              options={[
                { value: 'low', label: '低 · 30 天內收尾' },
                { value: 'high', label: '高 · 不計代價' },
              ]}
              slots={slots}
            />
            <Row
              no="⑦"
              title="主攻軸"
              hint={`西岸 ${pv.beachesWest} 處灘頭`}
              k="mainAxis"
              options={[
                { value: 'north', label: '北部 · 林口/海湖' },
                { value: 'central', label: '中部 · 布袋/台中港' },
                { value: 'south', label: '南部 · 台南/林園' },
                { value: 'east', label: '東岸 · 蘭陽/花蓮', warn: true },
              ]}
              slots={slots}
            />
            <Row
              no="⑧"
              title="輔助作戰"
              k="auxiliary"
              options={[
                { value: 'none', label: '無' },
                { value: 'penghu', label: '先取澎湖' },
                { value: 'eastFeint', label: '東岸佯攻' },
                { value: 'blockadeFirst', label: '封鎖為主、登陸為輔', warn: true },
              ]}
              slots={slots}
              last
            />
          </div>
        </div>
      </div>

      <div class="col" style="gap:14px">
        <div class="order-block">
        <div class="col" style="gap:6px">
          <span class="lbl">模擬場數</span>
          <div class="pills" role="radiogroup" aria-label="模擬場數">
            {([1, 10, 100] as const)
              .filter((n) => !(mobile && n === 100))
              .map((n) => (
                <button key={n} type="button" role="radio" aria-checked={runCount.value === n} class={`pill${runCount.value === n ? ' on' : ''}`} disabled={running.value} onClick={() => (runCount.value = n)}>
                  {n}
                </button>
              ))}
          </div>
          <div class="muted" style="font-size:11px">100 場通常不到一分鐘，結果只存在這台裝置。</div>
        </div>
        <button type="button" class="order" disabled={running.value} onClick={onOrder} data-testid="order">
          {running.value && progress.value ? (
            <span class="mono">
              {progress.value.done} / {progress.value.total}
            </span>
          ) : (
            '下令'
          )}
        </button>
        {running.value && progress.value && (
          <div class="progress" aria-hidden="true">
            <div style={{ width: `${(100 * progress.value.done) / progress.value.total}%` }} />
          </div>
        )}
        {error.value && <div class="red" style="font-size:12px">{error.value}</div>}
        <div class="muted" style="font-size:12px;text-align:center">按下後不能回頭。歷史也是。</div>
        <div class="mono muted" style="font-size:11px;text-align:center">引擎 {ENGINE_VERSION} · 決定性 seed</div>
      </div>
        </div>
        <div class="card soft" style="gap:12px">
          <div class="lbl">開局前評估（依目前假設）</div>
          <div class="kv">
            <div>
              <span>被提前發現</span>
              <span class="mono red">D{pv.detectedDay}</span>
            </div>
            <div>
              <span>可用灘頭</span>
              <span class="mono">西 {pv.beachesWest} · 東 {pv.beachesEast}</span>
            </div>
            <div>
              <span>可用天候</span>
              <span class={`mono${pv.windowDays < 10 ? ' red' : ''}`}>約 {pv.windowDays} 天</span>
            </div>
            <div>
              <span>颱風機率</span>
              <span class={`mono${pv.typhoonProb >= 0.3 ? ' red' : ''}`}>{pct(pv.typhoonProb)}</span>
            </div>
            <div>
              <span>第一波運量</span>
              <span class="mono">{wan(pv.liftCapacityRaw)}</span>
            </div>
            <div>
              <span>扣除輔助作戰</span>
              <span class={`mono${pv.auxLiftCost > 0 ? ' red' : ''}`}>{pv.auxLiftCost > 0 ? `-${pct(pv.auxLiftCost)}` : '—'}</span>
            </div>
            <div>
              <span>主攻區守方</span>
              <span class="mono">常備 {pv.regularBrigades + pv.regionalBrigades} 旅 · 後備 {pv.reserveBrigades} 旅</span>
            </div>
            <div>
              <span>美軍介入</span>
              <span class="mono">{pv.usEntryDay === null ? '不介入' : `D+${pv.usEntryDay}`}</span>
            </div>
            <div>
              <span>家前線壓力</span>
              <span class="mono red">{pv.homefrontPressureDay < 0 ? `D${pv.homefrontPressureDay}` : `D+${pv.homefrontPressureDay}`} 浮現</span>
            </div>
            {!pv.supplyable && (
              <div>
                <span class="red">補給線</span>
                <span class="mono red">不可連通西部</span>
              </div>
            )}
          </div>
          <div class="hr" />
          <div class="muted" style="font-size:12px;line-height:18px">按下令後會先在你的電腦上跑完所選場數，再播放其中一局。</div>
        </div>
    </div>
  );
}
