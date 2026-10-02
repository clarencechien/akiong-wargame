/**
 * 02 戰情室：紙本 chrome + 暗色面板。五階段進度條、四層儀表、下一道門檻、地圖、事件流（M5 加聲音）、時間軸。
 * 一切從 currentRun 的快照讀；玩家只能看，不能下指令。
 */
import { useEffect, useRef } from 'preact/hooks';
import type { Event, Phase } from '../../engine/types.js';
import { P } from '../../engine/params.js';
import { encodeShare } from '../../engine/share.js';
import { gateInfo, avgStrength, PHASE_NAME, PHASE_ORDER } from '../../engine/gateinfo.js';
import { batch, runIndex, screen } from '../state.ts';
import { atEnd, banner, currentRun, currentState, cycleSpeed, jumpToEnd, playing, snapIndex, speed, visibleEvents } from './playback.ts';
import { verdict } from '../../narrative/verdict.js';
import { dateLabel, annotateDates, shortDate } from '../../narrative/dates.js';
import { useState } from 'preact/hooks';
import { Map } from './Map.tsx';

const dl = (d: number) => (d < 0 ? `D${d}` : `D+${d}`);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString('zh-Hant-TW');

function Gauge({ label, value, text, color }: { label: string; value: number; text: string; color?: string | undefined }) {
  return (
    <div class="g">
      <div class="gh">
        <span>{label}</span>
        <span class="mono" style={color ? { color } : undefined}>
          {text}
        </span>
      </div>
      <div class="gbar">
        <i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color ?? '#9DB4D0' }} />
      </div>
    </div>
  );
}

export function Situation() {
  const b = batch.value;
  const r = currentRun.value;
  const s = currentState.value;
  const feedRef = useRef<HTMLDivElement>(null);
  const events = visibleEvents.value;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0 });
  }, [events.length]);
  useEffect(() => {
    setDismissed(false);
  }, [runIndex.value, batch.value]);

  if (!b || !r || !s) {
    return (
      <div style="padding:22px 40px">
        還沒有任何一局。
        <button type="button" class="pill" onClick={() => (screen.value = 'warroom')}>
          回作戰室
        </button>
      </div>
    );
  }

  const a = r.assumptions;
  const n = b.results.length;
  const idx = runIndex.value;
  const o = r.outcome;
  const p = r.sampledParams;
  const gate = gateInfo(r, s);
  const detectedEv = r.events.find((e) => e.kind === 'detected');
  const startDay = r.snapshots[0]?.day ?? 0;
  const usEntry = s.regional.usEntryDay;
  const nowIdx = PHASE_ORDER.indexOf(s.phase);
  const ended = atEnd.value;
  const required = P(p, 'beach.requiredTroops');
  // 同組假設 N 局中，走到這裡還過得了這道門檻的
  const survivors = b.results.filter((x) => {
    const endIdx = PHASE_ORDER.indexOf(x.outcome.endedAt.phase);
    return endIdx > nowIdx || (endIdx === nowIdx && x.outcome.reason === 'objectiveReached');
  }).length;

  const phaseSub = (ph: Phase): string => {
    switch (ph) {
      case 'mobilize':
        return `${shortDate(a.month, startDay)} → ${shortDate(a.month, -1)}${detectedEv ? ` · ${shortDate(a.month, detectedEv.day)} 被發現` : ''}`;
      case 'strike':
        return `${shortDate(a.month, 0)} D 日 → ${shortDate(a.month, 3)}`;
      case 'crossing':
        return `${shortDate(a.month, 4)} → ${PHASE_ORDER.indexOf(o.endedAt.phase) > 2 ? '…' : nowIdx >= 2 ? '進行中' : ''}`;
      case 'landing':
        return `門檻 ≥ ${fmt(required * 0.7)} 人上岸 · 撐 48 小時`;
      case 'inland':
        return `門檻 補給線 ≥ ${P(p, 'inland.supplyDaysRequired')} 天`;
    }
  };
  const phaseState = (ph: Phase): 'done' | 'now' | 'fail' | '' => {
    const i = PHASE_ORDER.indexOf(ph);
    if (ended && o.endedAt.phase === ph && o.reason !== 'objectiveReached') return 'fail';
    if (i < nowIdx) return 'done';
    if (i === nowIdx) return 'now';
    return '';
  };
  const v = verdict(r);
  
  return (
    <div class="situation">
      <div class="sit-meta mono">
        案號 TW-2027-{String(a.month).padStart(2, '0')} · seed {r.seed} · {encodeShare(a, r.seed)} · 第 {idx + 1} / {n} 局
        <span class="sit-meta-actions">
          <button type="button" class="pill" disabled={idx === 0} onClick={() => (runIndex.value = idx - 1)}>
            上一局
          </button>
          <button type="button" class="pill" disabled={idx >= n - 1} onClick={() => (runIndex.value = idx + 1)}>
            看另一局
          </button>
          <button type="button" class="pill" onClick={() => (screen.value = 'warroom')}>
            回作戰室
          </button>
        </span>
      </div>

      <div class="steps">
        {PHASE_ORDER.map((ph, i) => {
          const st = phaseState(ph);
          return (
            <div key={ph} class={`step ${st}`}>
              <span class="lbl">階段 {i + 1}</span>
              <span style={{ fontSize: '13px', fontWeight: st === 'now' || st === 'fail' ? 700 : 400 }}>
                {PHASE_NAME[ph]}
                {ph === 'crossing' ? `（主攻${{ north: '北部', central: '中部', south: '南部', east: '東岸' }[a.mainAxis]}${a.auxiliary !== 'none' ? ` · 輔助${{ penghu: '先取澎湖', eastFeint: '東岸佯攻', blockadeFirst: '封鎖為主', none: '' }[a.auxiliary]}` : ''}）` : ''}
              </span>
              <span class={`mono${st === 'now' || st === 'fail' ? ' red' : ' muted'}`} style="font-size:11px">
                {st === 'fail' ? `${dateLabel(a.month, o.endedAt.day)} · ${o.reason === 'timeout' ? '停止' : '門檻未過'}` : phaseSub(ph)}
              </span>
            </div>
          );
        })}
      </div>

      <div class="panel">
        <div class="pcol left">
          <div class="lbl" style="color:#9DB4D0">
            態勢 · {dateLabel(a.month, s.day)} {String(s.hour).padStart(2, '0')}:00
          </div>
          <Gauge label="軍事 · 船團存活" value={avgStrength(s)} text={pct(avgStrength(s))} />
          <Gauge label="軍事 · 海峽制空" value={s.military.airControl} text={s.military.airControl === 0 ? '未開戰' : s.military.airControl > 0.5 ? `局部 ${pct(s.military.airControl)}` : `爭奪中 ${pct(s.military.airControl)}`} />
          <Gauge label="守方 · 岸置飛彈剩餘" value={s.military.twCoastalMissiles} text={pct(s.military.twCoastalMissiles)} color="#4C8DD8" />
          <Gauge label="軍事 · 上岸兵力" value={s.military.troopsAshore / (required * 1.5)} text={`${fmt(s.military.troopsAshore)} 人`} />
          <div class="phr" />
          <Gauge
            label="區域 · 美軍介入"
            value={usEntry === null ? 0 : s.regional.usEngaged ? 1 : Math.max(0, Math.min(1, (s.day - startDay) / (usEntry - startDay)))}
            text={usEntry === null ? '不介入' : s.regional.usEngaged ? '打擊中' : `D+${usEntry} · 剩 ${Math.max(0, usEntry - s.day)} 天`}
            color="#E0533F"
          />
          <Gauge label="區域 · 日本基地" value={s.regional.japanBases ? 1 : 0.2} text={s.regional.japanBases ? (s.regional.ryukyuClosed ? '開放 · 琉球封閉' : '開放') : '中立'} color="#4C8DD8" />
          <Gauge label="世界 · 晶片產能" value={s.world.chipOutput} text={pct(s.world.chipOutput)} color="#D9A441" />
          <Gauge label="世界 · 市場" value={1 + s.world.marketShock} text={s.world.marketShock === 0 ? '持平' : `${Math.round(s.world.marketShock * 100)}%`} color="#D9A441" />
          <Gauge label="家前線 · 沿海就業" value={1 - s.homefront.coastalShutdown} text={`停工 ${pct(s.homefront.coastalShutdown)}`} color="#D9A441" />
          <Gauge label="家前線 · 士氣" value={s.homefront.morale / 100} text={String(Math.round(s.homefront.morale))} color={s.homefront.morale < 40 ? '#E0533F' : undefined} />
          <div class="phr" />
          <div class="gatebox">
            <div class="lbl" style="color:#E0533F">{ended ? '結局' : '下一道門檻'}</div>
            {ended ? (
              <div style="font-size:12px;line-height:18px">
                <b>{annotateDates(v.headline, a.month)}</b> {annotateDates(v.detail, a.month)}
              </div>
            ) : (
              <>
                <div style="font-size:12px;line-height:18px">{gate.text}</div>
                <div class="gbar">
                  <i style={{ width: `${gate.progress * 100}%`, background: '#E0533F' }} />
                </div>
                {gate.secondary && (
                  <div class="gh" style="font-size:11px">
                    <span class="muted">{gate.secondary.label}</span>
                    <span class="mono">{pct(gate.secondary.progress)}</span>
                  </div>
                )}
              </>
            )}
          </div>
          <div style="margin-top:auto;font-size:11px;line-height:17px;color:#9DB4D0">
            同組假設 {n} 局中，走到這裡還過得了門檻的：{survivors} 局。
          </div>
        </div>

        <div class="pmap">
          <Map run={r} s={s} />
          {banner.value && banner.value.kind === 'phase' && (
            <div class="banner" key={banner.value.title}>
              <div class="banner-t serif">{banner.value.title}</div>
              <div class="banner-s">{banner.value.sub}</div>
            </div>
          )}
          {ended && !dismissed && (
            <div class="endcard" data-testid="endcard">
              <div class="lbl" style="color:#E0533F">結局 · {dateLabel(a.month, o.endedAt.day)}</div>
              <div class="serif endcard-h">{annotateDates(v.headline, a.month)}</div>
              <div class="endcard-d">{annotateDates(v.detail, a.month)}</div>
              <div class="endcard-l">{v.lesson}</div>
              <div class="pills">
                <button type="button" class="tbtn solid" style="height:38px" onClick={() => (screen.value = 'chronicle')} data-testid="endcard-chronicle">
                  讀史書
                </button>
                <button type="button" class="tbtn" style="height:38px;color:#E8EEF5;border-color:#5F7C9E" onClick={() => setDismissed(true)}>
                  留在戰情室
                </button>
                <button type="button" class="tbtn" style="height:38px;color:#E8EEF5;border-color:#5F7C9E" disabled={idx >= n - 1} onClick={() => (runIndex.value = idx + 1)}>
                  看另一局
                </button>
              </div>
            </div>
          )}
        </div>

        <div class="pcol right">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div class="lbl" style="color:#9DB4D0">聲音與事件 · 這一天有人在說</div>
            <div class="mono" style="font-size:10px;color:#5F7C9E">{dateLabel(a.month, s.day)}</div>
          </div>
          <div class="feed" ref={feedRef}>
            {[...events].reverse().map((e, i) => (
              <EventCard key={e.id} e={e} latest={i === 0} month={a.month} />
            ))}
          </div>
          <div style="margin-top:auto;font-size:10px;color:#5F7C9E;line-height:15px" class="mono">
            {events.some((e) => e.layer === 'voice')
              ? '聲音由四層事件觸發，角色與語氣從人物庫以 seed 抽取；同一 seed 永遠得到同一句。'
              : '正式聲音模板尚未核准（data/voice-templates.json 為空）。審過 data/_candidates/ 的候選後執行 npm run voices:promote。'}
          </div>
        </div>
      </div>

      <div class="timeline">
        <button type="button" class="tbtn solid" onClick={() => (playing.value = !playing.value)} disabled={ended} data-testid="play">
          {playing.value ? '⏸ 暫停' : '▶ 播放'}
        </button>
        <button type="button" class="tbtn" onClick={cycleSpeed} data-testid="speed">
          ×{speed.value}
        </button>
        <div style="flex-grow:1;display:flex;flex-direction:column;gap:4px;min-width:0">
          <label for="tl" class="sr-only">
            時間軸
          </label>
          <input
            id="tl"
            type="range"
            min="0"
            max={r.snapshots.length - 1}
            value={Math.min(snapIndex.value, r.snapshots.length - 1)}
            onInput={(ev) => {
              playing.value = false;
              snapIndex.value = Number((ev.currentTarget as HTMLInputElement).value);
            }}
            style="width:100%;accent-color:#1F1D1A"
          />
          <div class="tlabels mono">
            <span>{shortDate(a.month, startDay)} 集結</span>
            {detectedEv && <span>{shortDate(a.month, detectedEv.day)} 被發現</span>}
            <span>{shortDate(a.month, 0)} D 日</span>
            <span class="red">
              {dateLabel(a.month, s.day)} {ended ? '結局' : '現在'}
            </span>
            {usEntry !== null && <span>{shortDate(a.month, usEntry)} 美軍</span>}
            <span>{shortDate(a.month, o.endedAt.day)} 結束</span>
          </div>
        </div>
        <button type="button" class="tbtn outline" onClick={jumpToEnd} disabled={ended} data-testid="jump-end">
          跳到結局
        </button>
        <button type="button" class="tbtn outline" onClick={() => (screen.value = 'chronicle')} data-testid="to-chronicle">
          讀史書
        </button>
      </div>
    </div>
  );
}

function EventCard({ e, latest, month }: { e: Event; latest: boolean; month: number }) {
  if (e.layer === 'voice') {
    const stratum = String(e.data?.['stratum'] ?? '');
    const kind = stratum === 'frontline' || stratum === 'rearFamily' ? 'red' : stratum === 'homefrontLabor' || stratum === 'twBusiness' || stratum === 'party' ? 'amber' : '';
    return (
      <div class={`vc voice ${kind}${latest ? ' latest' : ''}`}>
        <span class="who">
          {String(e.data?.['personaName'] ?? e.personaId)} · {dateLabel(month, e.day)}
        </span>
        <span class="say serif">「{annotateDates(e.text, month)}」</span>
      </div>
    );
  }
  const kind =
    e.kind === 'gateFailed' || e.kind === 'timeout' || e.kind === 'stopped'
      ? 'red'
      : e.layer === 'homefront' || e.layer === 'world'
        ? 'amber'
        : e.kind === 'objectiveReached' || e.kind === 'phaseAdvance'
          ? 'ok'
          : '';
  const headline = ['phaseAdvance', 'gateFailed', 'objectiveReached', 'timeout', 'stopped', 'usEngaged', 'fleetDeparture', 'fleetArrived', 'landingStart', 'strike', 'detected', 'windowClosed', 'typhoon'].includes(e.kind);
  const layerName = { military: '軍事', regional: '區域', world: '世界', homefront: '家前線', voice: '聲音' }[e.layer];
  return (
    <div class={`vc ${kind}${latest ? ' latest' : ''}${headline ? ' headline' : ''}`}>
      <span class="who">
        {layerName} · {dateLabel(month, e.day)} {String(e.hour).padStart(2, '0')}:00
      </span>
      <span class="say">{annotateDates(e.text, month)}</span>
    </div>
  );
}
