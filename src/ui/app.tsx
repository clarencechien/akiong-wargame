import { Warroom } from './warroom/Warroom.tsx';
import { Situation } from './situation/Situation.tsx';
import { assumptions, batch, error, progress, runCount, runIndex, running, screen, type Screen } from './state.ts';
import { runBatch } from '../worker/pool.js';
import { ENGINE_VERSION } from '../engine/simulate.js';

async function order(): Promise<void> {
  if (running.value) return;
  running.value = true;
  error.value = null;
  const n = runCount.value;
  progress.value = { done: 0, total: n };
  const seeds = Array.from({ length: n }, (_, i) => 1 + i);
  try {
    const result = await runBatch(assumptions.value, seeds, (done, total) => {
      progress.value = { done, total };
    });
    batch.value = result;
    runIndex.value = 0;
    screen.value = 'situation';
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    running.value = false;
    progress.value = null;
  }
}

function NavLink({ to, label }: { to: Screen; label: string }) {
  return (
    <button type="button" class={screen.value === to ? 'on' : ''} onClick={() => (screen.value = to)}>
      {label}
    </button>
  );
}

export function App() {
  return (
    <div class="page">
      <header class={`hdr${screen.value === 'situation' ? ' compact' : ''}`}>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div class="lbl">台海兵推 · 教育版 · 第一版（單人 · 全本機運算 · 不上傳任何資料）</div>
          <h1>如果你是阿共，你要怎麼打過來？</h1>
        </div>
        <nav class="nav">
          <NavLink to="warroom" label="作戰室" />
          <NavLink to="situation" label="戰情室" />
          <NavLink to="chronicle" label="史書" />
          <NavLink to="sources" label="資料來源" />
        </nav>
      </header>
      {screen.value === 'warroom' && <Warroom onOrder={() => void order()} />}
      {screen.value === 'situation' && <Situation />}
      {screen.value === 'chronicle' && <div style="padding:22px 40px">史書在 M6。</div>}
      {screen.value === 'sources' && <div style="padding:22px 40px">資料來源頁在 M7；目前見 repo 的 docs/sources.md 與 docs/realism.md。</div>}
      <footer class="ftr">
        <span>所有參數附公開來源。超出公開資料上限的設定以紅色標示。本模擬為教育用途的簡化模型，不代表任何官方評估。</span>
        <span class="mono">引擎 {ENGINE_VERSION} · 決定性 seed</span>
      </footer>
    </div>
  );
}
