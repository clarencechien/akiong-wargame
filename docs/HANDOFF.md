# HANDOFF — 如果你是阿共，你要怎麼打過來（台海兵推 · 教育版）

> 給 Claude Code 的開工文件。PRD 在 Claude Docs；本檔只寫「怎麼做」。
> 版本：1.0 MVP（單人、全本機、不上傳）。Run 2 封鎖在 1.1，見 §12。

---

## 0. 一句話

玩家扮演解放軍聯合作戰指揮中心總指揮，設定八個開局假設，瀏覽器在本機跑 1–100 場決定性模擬，播放其中一局，最後生成一章教科書、一張頭版分享卡、一份事件簿。目標是教育：讓人撞到「中國打台灣有多困難」這堵牆。

## 1. 不可妥協的原則

1. **全本機**：沒有後端、沒有帳號、不上傳任何資料。部署是靜態檔案。
2. **決定性**：`hash(assumptions) + seed` → 同一局永遠相同。所有隨機來自一個可重現的 PRNG，不准用 `Math.random()`。
3. **每個數字有出處**：參數庫每一筆都帶 `source` 與 `range`；超出 range 的設定標紅並在史書／事件簿高亮。
4. **執行期不打任何 API**：聲音、章節全靠靜態模板 + seed 抽樣。LLM 只在開發期生模板。
5. **效能預算**：單場 < 1 s（M1 等級筆電），100 場 < 60 s，在 Web Worker 跑，UI 不卡。
6. **守方不可操作**：守方只在聲音與數據裡出現。

## 2. 技術棧

| 層 | 選擇 | 備註 |
| --- | --- | --- |
| 語言 | TypeScript, strict | 引擎純函式、零 DOM 依賴，方便日後轉 WASM |
| 建置 | Vite | 單頁，輸出到 `dist/` 直接上 Cloudflare Pages |
| UI | Preact 或 Svelte（擇一，優先 Preact + signals） | 不用重框架 |
| 引擎執行 | Web Worker pool（`navigator.hardwareConcurrency`） | 主執行緒只做播放 |
| 儲存 | IndexedDB（`idb` 套件） | 已跑過的局：assumptions + seed + summary |
| 地圖 | 手寫 SVG | 台灣輪廓、福建海岸、澎湖、琉球、呂宋北端，見 mockup |
| 分享卡 | `<canvas>` 2D → PNG | 1080×1350 |
| 短影音 | 1.1 才做，HTML motion + MediaRecorder | 1.0 不做 |
| 測試 | Vitest | 引擎必須有決定性測試與分佈回歸測試 |
| PRNG | `mulberry32` 或 `xoshiro128**` | 自己實作，30 行 |

## 3. Repo 結構

```
/
├─ data/                      # 靜態 JSON，建置時打包
│  ├─ params.json             # 參數庫（§5）
│  ├─ geography.json          # 灘頭、港口、距離（§5.3）
│  ├─ personas.json           # 人物庫（§8）
│  ├─ voice-templates.json    # 聲音模板（§8）
│  ├─ chapter-templates.json  # 章節模板（§9）
│  └─ booknames.json          # 史書風書名庫
├─ src/
│  ├─ engine/                 # 純函式，無 DOM
│  │  ├─ rng.ts
│  │  ├─ types.ts             # §4
│  │  ├─ assumptions.ts       # 假設 → 初始狀態
│  │  ├─ phases/              # 五階段各一檔 + gates.ts
│  │  ├─ layers/              # military / regional / world / homefront
│  │  ├─ events.ts            # 事件流
│  │  ├─ voices.ts            # 聲音觸發與抽樣
│  │  └─ simulate.ts          # run(assumptions, seed) → Run
│  ├─ worker/                 # Worker 包裝與 pool
│  ├─ ui/
│  │  ├─ warroom/             # 01 作戰室
│  │  ├─ situation/           # 02 戰情室
│  │  ├─ chronicle/           # 03 史書
│  │  └─ sources/             # 資料來源頁 + 現實面的考量
│  ├─ narrative/              # 章節拼裝、分享卡繪製
│  └─ store/                  # IndexedDB
├─ scripts/
│  └─ gen-templates/          # 開發期 LLM 生模板的腳本（輸出進 data/，需人工審）
└─ tests/
```

## 4. 核心型別（`src/engine/types.ts`）

```ts
export type Month = 1|2|3|4|5|6|7|8|9|10|11|12;

export interface Assumptions {
  month: Month;                                  // ①
  scale: 'raid' | 'medium' | 'full';             // ② 偷襲型/中型/全面
  us: 'none' | 'delayed' | 'immediate';          // ③
  japan: 'neutral' | 'bases' | 'belligerent';    // ④
  twReserve: 0.3 | 0.55 | 0.8;                   // ⑤
  econTolerance: 'low' | 'high';                 // ⑥
  mainAxis: 'north' | 'central' | 'south' | 'east'; // ⑦ east 標紅
  auxiliary: 'none' | 'penghu' | 'eastFeint' | 'blockadeFirst'; // ⑧ blockadeFirst 1.0 僅影響時間軸與世界層
  greyZone?: 'low' | 'mid' | 'high';             // ⑨ 1.x 才開放，影響初始狀態
}

export type Phase = 'mobilize' | 'strike' | 'crossing' | 'landing' | 'inland';

export interface MilitaryState {
  fleetGroups: { id: number; strength: number; position: [number, number]; status: 'staging'|'enroute'|'arrived'|'scattered' }[];
  airControl: number;        // 0..1 紅方海峽制空
  twCoastalMissiles: number; // 0..1 守方岸置飛彈剩餘
  troopsAshore: number;      // 人
  supplyDays: number;        // 補給線存活天數（累計）
  beachhead: boolean;
  weatherWindowDays: number; // 剩餘可用海況天數
}
export interface RegionalState {
  usEntryDay: number | null; // D+n，null = 不介入
  usEngaged: boolean;
  japanBases: boolean;
  ryukyuClosed: boolean;
}
export interface WorldState {
  chipOutput: number;        // 0..1 台灣晶片產能
  shippingReroute: number;   // 0..1 航線改道比例
  energyPrice: number;       // 相對基準 1.0
  marketShock: number;       // 相對基準 0 = 無
  twEnergyDays: number;      // 台灣能源庫存天數（1.1 封鎖用）
}
export interface HomefrontState {
  coastalShutdown: number;   // 0..1 沿海停工比例
  twBusinessPayroll: number; // 0..1 台商薪資發放能力
  morale: number;            // 0..100
  priceIndex: number;        // 相對基準 1.0
}

export interface State {
  day: number;               // D 日為 0，集結期為負
  hour: number;              // 0..23
  phase: Phase;
  military: MilitaryState;
  regional: RegionalState;
  world: WorldState;
  homefront: HomefrontState;
  flags: Set<string>;        // 'detected', 'penghuTaken', ...
}

export type EventLayer = 'military' | 'regional' | 'world' | 'homefront' | 'voice';

export interface Event {
  id: number;                // 流水號，章節註釋用
  day: number; hour: number;
  layer: EventLayer;
  kind: string;              // 'detected' | 'strike' | 'fleetScattered' | 'gateFailed' | 'voice' ...
  text: string;              // 已填模板的中文
  data?: Record<string, number | string>;
  personaId?: string;        // voice 專用
  flaggedParams?: string[];  // 觸發時有標紅參數則列出
}

export interface Run {
  engineVersion: string;     // 'v0.1.0' 進分享編碼
  assumptions: Assumptions;
  seed: number;
  events: Event[];
  snapshots: State[];        // 每 6 小時一張，給時間軸拖拉
  outcome: {
    endedAt: { day: number; phase: Phase };
    reason: 'gateFailed' | 'objectiveReached' | 'timeout';
    failedGate?: string;
    gateShortfall?: number;  // 差多少，章節用
    maxTroopsAshore: number;
    fleetLoss: number;
    coastalShutdown: number;
    marketShockMax: number;
  };
}
```

## 5. 參數庫（`data/params.json`）

每筆格式：

```json
{
  "id": "fleet.rollOnRollOff.count",
  "label": "可徵用滾裝船數",
  "value": 142,
  "range": [100, 200],
  "unit": "艘",
  "source": "DoD China Military Power Report 2024, p.XX",
  "note": "含民用徵用；模型假設可用率 70%",
  "assumption": false
}
```

- `assumption: true` 表示來源不足、是模型假設，UI 顯示「模型假設」標籤。
- 模擬時在 `range` 內抽樣（三角分佈，眾數 = `value`），不是用點估計。
- 第一版先把範圍標出來；玩家調參超出 range 的功能 1.x 再開。

### 5.1 必須有的參數群（第一版）

| 群 | 關鍵參數 |
| --- | --- |
| 天候 | 各月可用海況天數、颱風機率、東北季風浪高 |
| 運量 | 滾裝船數、登陸艦數、每船載員、第一波總運量、每波往返天數 |
| 偵測 | 商用衛星辨識門檻（船團規模 → 被發現日）、集結週數（依 scale） |
| 火力 | 首波飛彈數、各目標存活率（機場、雷達、機動岸置飛彈） |
| 渡海損耗 | 岸置飛彈每日命中率、潛艦、空襲；美軍介入後的加成 |
| 灘頭 | 各灘頭守備旅數、建立灘頭堡所需人數（14,000 為模型假設）、後備動員率對縱深天數的係數 |
| 區域 | 美軍介入日（依 us）、日本基地對出擊架次係數（0.4 / 1.0 / 1.2）、關島距離 |
| 世界 | 晶片停工觸發日、海運改道比例曲線、能源價格衝擊、市場衝擊 |
| 家前線 | 在陸台商雇工數、薪資依存度、停工比例隨天數曲線、士氣衰減、物價 |

### 5.2 分佈校準（驗收條件）

同組「基準假設」（4 月、中型、延遲介入、開放基地、55%、高、北部、先取澎湖）跑 1,000 場：

- 穩固灘頭堡比例落在 5–30%（穩固灘頭堡 = 進入縱深階段後，曾同時達到補給線存活 ≥ 3 天且上岸兵力 ≥ 所需；對應 CSIS 2023 的「solid beachhead」）
- 登陸成功比例（landing 門檻：存活 48 小時且第二波卸載）高於穩固灘頭堡比例，且不低於 40%
- 30 天內達成戰略目標比例 < 10%
- 中位終止日落在 D+8 到 D+14

不在範圍 → 參數庫或公式錯，不准調「遊戲平衡」係數硬湊。

> 原版寫「建立灘頭堡 10–30%、中位 D+5 到 D+12」。2026-10-02 依 CSIS 數據改為上列，理由與量測見 `docs/adr/0001-beachhead-acceptance.md`。UI 要同時顯示「登陸成功」與「穩固灘頭堡」兩個數字。

### 5.3 地理（`data/geography.json`）

```json
{
  "beaches": [
    { "id": "linkou", "name": "林口", "coast": "west", "region": "north", "lonlat": [121.35, 25.20], "defBrigades": 2, "supplyable": true },
    { "id": "hualien", "name": "花蓮", "coast": "east", "region": "east", "lonlat": [121.62, 24.00], "defBrigades": 1, "supplyable": false, "note": "背靠中央山脈，不可連通西部" }
  ],
  "ports": [{ "id": "xiamen", "name": "廈門", "lonlat": [118.1, 24.4] }],
  "penghu": { "lonlat": [119.55, 23.55], "defBrigades": 1, "liftCost": 0.18, "defenderWarningDays": 2 },
  "eastFeint": { "liftCost": 0.12, "pinsBrigades": 1 },
  "map": { "lon": [117, 126], "lat": [20.5, 27] }
}
```

西岸 14 處、東岸 3 處。第一版灘頭可以只放每區代表 1–2 處，但 `geography.json` 要留齊。

## 6. 引擎（`src/engine/simulate.ts`）

```
run(assumptions, seed):
  rng = PRNG(seed)
  params = sampleParams(rng)              // 每局在 range 內抽一次
  state = initialState(assumptions, params)
  events = []
  while not ended:
    tick(state, 1h)                        // 四層同步推進
    events.push(...emit(state))
    voices.push(...maybeVoice(state, rng)) // 見 §8
    if gate(state.phase) decided:
      pass → advancePhase / fail → end(gateFailed)
    if day > 30 and phase == 'inland' → end(timeout or objective)
  return Run
```

### 6.1 階段與門檻（簡化公式，可改，但要寫進 `docs/model.md`）

| 階段 | 推進 | 門檻（通過條件） |
| --- | --- | --- |
| mobilize（D-60 → D-1） | 船團集結；`detectedDay = f(scale)`；台灣後備啟動；家前線第一波 | 船團就位 **且** 進入月份窗口 |
| strike（D+0 → D+3） | 飛彈數 × 存活率 → 機場／雷達／岸置飛彈剩餘；世界層觸發 | `twCoastalMissiles < 0.7`（模型假設） |
| crossing（D+4 →） | 每船團每 tick 損耗 = 岸置 × 潛艦 × 空襲 × 美軍加成；輔助作戰先扣運量；天候窗口倒數 | 抵岸兵力 ≥ `beachheadRequired × 0.7` 且窗口未歸零 |
| landing | 上岸兵力 vs 守備旅 × 後備動員率 × 重裝備上岸比；美軍介入在此影響最大 | 灘頭堡存活 48 h 且第二波可卸載 |
| inland | 補給線存活天數累計；家前線壓力壓低持久上限 | 補給 ≥ 7 天且 `morale > 40` → objectiveReached |

### 6.2 四層的耦合

- 軍事 → 世界：`strike` 觸發晶片停工、航運改道。
- 時間 + econTolerance → 家前線：`coastalShutdown(t)` 曲線，`high` 容忍時曲線更陡但不終止。
- 家前線 → 軍事：`morale < 40` 時 `supplyDays` 累積減速；`morale < 25` 直接進結算（reason: timeout，章節寫成「停止」）。
- 區域 → 軍事：`usEngaged` 後渡海損耗 ×1.6（模型假設），`japanBases=false` 時 ×1.25。

## 7. PRNG 與分享編碼

- `seed` 32-bit 無號整數。
- 分享編碼（1.0 只用於本機存檔與 PNG 角落）：`base64url(engineVersion + packed(assumptions) + seed)`，`packed(assumptions)` 固定 4 bytes。
- 任何引擎變更改公式或參數 → bump `engineVersion`；舊編碼要能辨識版本並提示「舊版引擎，無法重現」。

## 8. 聲音系統

### 8.1 人物庫（`data/personas.json`，第一版 30 人，1.1 擴到 120）

```json
{
  "id": "dongguan-lineleader-henan",
  "stratum": "homefrontLabor",
  "name": "東莞 · 台資廠線長 · 河南籍",
  "side": "prc",
  "location": "東莞",
  "maxAppearances": 3,
  "triggers": [
    { "layer": "homefront", "metric": "coastalShutdown", "gte": 0.1 },
    { "layer": "homefront", "metric": "twBusinessPayroll", "lte": 0.6 }
  ],
  "tone": ["算帳", "問那我怎麼辦", "麻木"]
}
```

八個階層固定：`frontline / homefrontLabor / twBusiness / party / rearFamily / regional / world / taiwan`。

### 8.2 模板（`data/voice-templates.json`）

```json
{
  "personaId": "dongguan-lineleader-henan",
  "stage": 1,
  "tone": "算帳",
  "text": "老闆跑了沒我不知道，但這個月薪水是真的沒了。老家問我要不要回去，回去幹嘛？",
  "slots": {},
  "requires": { "coastalShutdown": [0.1, 0.5] }
}
```

- `stage` 1→3 對應同一人物三次出場的語氣變化（先算帳、後麻木）。
- `slots` 可用：`{day}`, `{unit}`, `{amount}`, `{place}`, `{ships}`。
- 抽樣：觸發時 `rng` 從符合 `requires` 的模板裡抽；同一人物不重複同一 `stage`。
- 每局聲音總數目標 12–20 則，軍事事件與聲音在同一條事件流交錯。
- 每則 voice event 的 `data.triggerEventId` 指向觸發它的事件，章節註釋用。

### 8.3 開發期生成（`scripts/gen-templates/`）

- 輸入 persona + stage + tone + 狀態區間 → LLM 產 5–10 句候選 → 寫到 `data/_candidates/`。
- **人工審過才搬進 `data/voice-templates.json`**。腳本不准直接寫正式檔。
- 規則：不寫具名真實人物、不寫血腥細節、台灣正體中文、每句 ≤ 60 字。

## 9. 章節生成（`src/narrative/`）

- 結構固定三到四節：`看得見的戰爭（mobilize/strike）` → `海峽（crossing/landing）` → `第 N 天（結局）` → 可選 `世界` 節。
- 每節由模板段落拼裝：模板依 `(phase, outcome.reason, failedGate)` 選，段落內嵌 `[n]` 註釋指向 `events[id]`。
- 每節至少引用一則該階段的 voice event，格式：引文 + 「—— 地點，人物，D+n」。
- 書名與章號：從 `booknames.json` 抽書名，章號 = `hash(seed) % 20 + 8`，年代跟 `month` 與假設走（固定 2027，章節標題寫中文數字）。
- 章節字數 1,500–3,000。
- 來源註釋尾段固定列：本局 seed、引擎版本、標紅參數清單。

## 10. UI 畫面（對照 Design 畫布 v2）

### 01 作戰室
- 八個假設 + 即時「情報評估」文案（純查表，`assumptions → text`，放 `data/intel-notes.json`）。
- 攻擊軸小地圖隨 ⑦⑧ 改變。
- 開局前評估：由 `initialState` 直接算，不跑模擬。
- 模擬場數 1 / 10 / 100；手機預設 10 並隱藏 100。
- 「下令」→ 進度條（worker pool）→ 自動進戰情室播第 1 局。

### 02 戰情室
- 紙本 chrome + 暗色面板。地圖 SVG 用 `geography.json` 的 lonlat 投影，簡單線性投影即可。
- 五階段進度條、四層儀表、下一道門檻（顯示差多少）、聲音流（右欄）、時間軸（拖拉 snapshots）。
- 播放速度 ×1 / ×4 / ×16；「跳到結局」。
- 守方偵測圈、衛星過境帶、未選路線灰色虛線，都是裝飾，但要從 state 讀，不是寫死。

### 03 史書
- 分頁：教科書章節 / 頭版分享卡 / 事件簿（1.0）；短影音分頁放「1.1 推出」占位。
- 本局在 N 場中的位置：終止日直方圖，本局紅色。
- 「如果重來」：五顆按鈕，每顆只改一個假設回作戰室；「看另一局」切 run index。
- 分享卡：Canvas 繪製，標題公式 = `「我以為問題是{玩家最後改的假設或美軍}。問題是{failedGate 對應的三個名詞}。」`，下載 PNG；角落印分享編碼。

### 資料來源頁
- 參數表（可搜尋、可看 range 與 source）。
- 「現實面的考量」：先由 AI 生初稿，人工改。段落：刻意的簡化、資料不足之處、未來可能怎麼做。
- 致謝：《阿共打來怎麼辦》《再談阿共打來怎麼辦》作者與軍事科普目標；CSIS；Easton。

## 11. 測試與驗收

- `engine.determinism.test.ts`：同 assumptions+seed 跑兩次，`events` 深度相等。
- `engine.distribution.test.ts`：§5.2 的三個區間，1,000 場，CI 跑（允許 30 s）。
- `engine.perf.test.ts`：單場 < 1 s（CI 機器放寬到 2 s）。
- `voices.test.ts`：每局 12–20 則、同人物 ≤ 3 次、無重複 stage。
- `narrative.test.ts`：章節字數區間、每節至少一則引文、所有 `[n]` 都能解析到事件。
- 手測：東岸主攻必標紅；先取澎湖後第一波運量下降 18%；月份改 8 月時窗口天數明顯變短且情報評估文案改變。

## 12. 里程碑

| 里程碑 | 內容 | 完成定義 |
| --- | --- | --- |
| M1 引擎骨架 | types、rng、五階段、門檻、四層最小耦合、CLI 跑 1,000 場印分佈 | §5.2 區間過（2026-10-02 完成，見 `docs/model.md`） |
| M2 參數庫 | `params.json` 全部帶 source/range；`geography.json` | 無 `assumption:true` 以外的空 source（2026-10-02 完成，`npm run check:params`） |
| M3 作戰室 + worker pool | 八假設、情報評估、下令、進度 | 100 場 < 60 s（2026-10-02 完成，`npm run smoke` 量測約 0.3 s） |
| M4 戰情室 | 地圖、儀表、時間軸、事件流（先無聲音） | 可播完一局（2026-10-02 完成，`npm run smoke` 播放、跳到結局、拖時間軸） |
| M5 聲音 | 30 人、模板、觸發、交錯 | voices.test 過（2026-10-02 引擎與測試完成；正式模板待人工審 `data/_candidates/voice-templates.candidates.json` 後 `npm run voices:promote`） |
| M6 史書 | 章節、分享卡、事件簿、直方圖、如果重來 | narrative.test 過（2026-10-02 完成；章節引文需正式聲音模板核准後才會在 UI 出現） |
| M7 來源頁 + 上線 | 參數表、現實面的考量初稿、致謝；Cloudflare Pages | 1.0（2026-10-02 程式完成；上線步驟見 `docs/deploy.md`，待人工審聲音模板與 realism.md 後發布） |
| 1.1 | Run 2 封鎖（第二條階段梯 + 世界層狀態量 + 航運人物）、人物庫 120、短影音 template/素材包、Suno 配樂、⑨ 灰色作戰假設 | 另開 handoff |

## 13. 明確不做（1.0）

即時指令、多人、帳號、任何上傳、空戰分層、單一武器參數調校、精細地圖、守方操作、執行期 LLM、中美升級／核選項、美軍自身損失。

## 14. 開工順序建議

M1 先用 CLI 跑到分佈對了再碰 UI。UI 動工前先把 Design 畫布三張 v2 讀一遍，色票與字型照畫布：紙 `#F3EFE6`、墨 `#1F1D1A`、紅方 `#B3362E`（紙面）/ `#E0533F`（暗面板）、守方 `#2C4E7A` / `#4C8DD8`、暗面板 `#0F1B2D`；字型 Noto Serif TC（標題、史書）、Noto Sans TC（UI）、IBM Plex Mono（數字）。
