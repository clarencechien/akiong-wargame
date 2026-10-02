# 模型說明 — M1 引擎骨架（engine v0.1.0）

> 對照 `docs/HANDOFF.md` §6。這裡寫公式、與 HANDOFF 的差異、校準紀錄，以及 §5.2 驗收的解讀。數字來源見 `docs/sources.md` 與 `data/params.json` 每筆的 `source`。

## 0. 一局怎麼跑

```
run(assumptions, seed):
  rng    = mulberry32(mix32(fnv1a(pack(assumptions)), seed))
  params = 每筆在 range 內三角分佈抽一次（眾數 = value）
  k      = derive(assumptions, params)      // 集結天數、被辨識日、本月好天預算、颱風日、美軍介入日、運量…
  state  = initialState(…)                  // D-集結天數 00:00 起
  每小時：
    日界 → 海況（馬可夫）、好天預算、岸置飛彈消耗、家前線
    區域層、世界層
    當前階段 tick（船團循環、灘頭戰、縱深）
    士氣 < 25 → 直接結算（timeout / moraleCollapse）
    門檻判定 → 進下一階段，或結束
    D+30 23:00 → timeout
```

快照每 6 小時一張（CLI 跑分佈時關掉）。單場約 0.6 ms，1,000 場不到 1 秒。

## 1. 五階段與門檻（實作版）

| 階段 | 推進 | 通過 | 失敗原因碼 |
| --- | --- | --- | --- |
| mobilize | `detectedDay = −leadDays(scale)`；被辨識後 2 天徵用民船、`lag` 天後台灣後備啟動；市場先跌 30% 的最大跌幅 | D-1 23:00：本月好天預算 ≥ 3 天 | `windowClosed` |
| strike（D+0–3） | D+0：固定岸置陣地損失 → `twCoastalMissiles = fixedShare × fixedSurvival + (1 − fixedShare)`；之後每日只有機動部分 × (1 − dailyAttrition × 飛彈強度)；紅方制空設為 `redAirControl`；世界層全部觸發 | D+3 23:00：`twCoastalMissiles < gate.strike.coastalMissilesMax`（0.7） | `coastalMissilesIntact` |
| crossing（D+4 起） | 船團循環 staging → enroute → arrived（卸載）→ returning；每小時損耗 = `lossPerTransit / transitHours`；卸載受灘頭吞吐量限制；壞海況時在航船團打散、錨泊船團起錨中止卸載 | 任一小時 `troopsArrived ≥ requiredTroops × 0.7` | `windowClosed`（好天預算用罄）、`fleetBroken`（船團平均戰力 < 30%）、`tooSlow`（超過 `cross.maxDays`） |
| landing | 進入時守方戰力 = 灘頭守備旅 + 軍團其餘旅（`reinforcementHours` 內線性到位）+ 後備旅 × 動員率 × 動員進度，全乘工事倍數；每小時 Lanchester 線性律交換；卸載兵力過灘岸火網損失 `surfZoneLoss` | 存活 48 小時後：`troopsAshore ≥ required × 0.5` 且灘頭建立後再卸載 ≥ `required × 0.3` | `beachheadCrushed`、`secondWaveFailed`、`windowClosed`、`fleetBroken` |
| inland | 每日 06:00：補給線被切機率 = `supplyHitProbPerDay × (0.5 + twCoastalMissiles) × 區域倍數`；沒被切 `supplyDays += 1`（士氣 < 40 時 +0.5）；被切 −2；壞海況 −1；東岸永遠 0；守方縱深反擊每日 `counterattackPerDay × (0.5 + twReserve)` | `supplyDays ≥ 7` 且士氣 > 40 → objectiveReached | `fleetBroken`（船團 < 25% 且補給未達標）、`forcesDepleted`（上岸兵力 < required × 0.3） |

### 1.1 渡海損耗（每趟）

```
taiwan = coastalLossPerTransit × twCoastalMissiles + subLossPerTransit + airLossPerTransit × (1 − airControl)
us     = usEngaged ? usSubLossPerTransit × japanSortieCoef : 0
loss   = min(0.95, taiwan × (usEngaged ? usMultiplier : 1) + us)
```

靠岸卸載中按 0.5 倍、返航按 0.3 倍計。校準點：

- 台灣單獨作戰：CSIS 2023 p.97，前 10 天擊沉約 16% 兩棲艦 → 每趟約 2–4%。
- 美軍介入（日本開放基地）：CSIS 2023 p.85–88，基準情境 10–14 天擊沉 ≥ 90% → 每趟約 25–30%。
- 日本中立：出擊架次係數 0.4（CSIS Ragnarok：船團仍被削到三分之一）。

### 1.2 海況（取代 HANDOFF 的「窗口倒數」）

HANDOFF 把窗口寫成「剩餘可用海況天數」倒數。實作改成兩態馬可夫鏈：

- 穩態好天比例 `p = windowDays(month) / 30`；壞天平均持續 `badSpellMeanDays`（2.5 天）；D 日選在好天。
- 好天用掉一天好天預算；預算歸零 = 季風確立，`windowClosed`。
- 颱風：依月機率抽一次，`typhoonDay ∈ [D+0, D+20]`，中斷 `typhoonHaltDays`。
- 壞海況：在航船團打散（損失 `scatterLoss`），錨泊卸載中的船團起錨避風（損失一半、本趟作廢），不出港，補給線存活天數 −1。

這樣 4 月（p ≈ 0.57）與 12 月（p ≈ 0.17）的差別來自壞天打斷卸載與補給，而不是硬切。4 月登陸成功約 60%，8 月約 4%，12 月約 2%。

### 1.3 四層耦合

- 軍事 → 世界：strike 當日晶片停工、航運改道三日內到上限、能源與市場五日內到上限。
- 時間 + econTolerance → 家前線：停工每日 +`shutdownRatePerDay`（高容忍 × 1.3）；台商薪資隨被辨識與開戰下滑。
- 家前線 → 軍事：士氣 < 40 補給累積減半；士氣 < 25 直接結算。士氣每日 −基礎衰減（低容忍 × 1.6）− 當日船團損失 × 10 × `moraleLossPerFleetLoss` − 停工 × 2。
- 區域 → 軍事：見 §1.1；美軍介入當天紅方制空 −`usAirShare × sortieCoef`。

## 1.4 聲音系統（M5）

聲音是事件流的一部分，執行期不打任何 API。實作為模擬結束後的「事後抽樣」：主迴圈每 6 小時留下一筆扁平指標（`flattenMetrics`），結束後用同一個 rng 接著抽，保證決定性，也能把每局聲音數控制在 12–20 則：

1. 觸發點 = 所有非聲音事件 + 每日 06:00（讓安靜的日子也有人說話）。
2. 先保證每個有觸發點的階段至少一則（取該階段中間的真實事件），再等距補到 N = rng.int(12, 20)，優先真實事件。集結期（phase 0）佔整條時間軸六成以上，但能說話的人少，所以最多只分到三成的名額，其餘留給開戰之後（1.1 起；之前集結期吃掉一半以上的聲音，造成同幾個人每局都出現）。
3. 每個觸發點：人物要 triggers 成立（any）、出場未滿 3 次、下一個 stage 有 requires 成立的模板、且 listens 含觸發事件的層（找不到時放寬）；加權抽人（出場少 ×、階層還沒出現過 ×1.4、再除以「這局有幾個觸發點輪得到他」的平方根，讓整局都成立的寬條件人物不會每局搶到話筒），再抽句、填槽。不足 N 則時從沒選到的點補位，補位只讓「還沒出場」或「上次出場更早」的人物上，stage 不會時間倒置。
4. 聲音排在觸發事件後 1–6 小時，合併後重新編號，`data.triggerEventId` 指向新 id。

與 HANDOFF §6 偽碼的差別：偽碼把 `maybeVoice` 放在每個 tick 裡；事後抽樣的可觀察結果相同（同 seed 同句、同一條事件流），但能保證數量與階段覆蓋。

正式模板檔 `data/voice-templates.json` 只收人工審過的句子；LLM 候選在 `data/_candidates/*.candidates.json`，流程見 `scripts/gen-templates/README.md`。寫手批次用 `scripts/merge-voice-batches.ts` 合併（人物直接進 `personas.json`，句子進候選檔）。 2026-10-02 批次 900 句：分層隨機抽 10%（90 句）逐句審，89 句過、1 句修字、0 句退回，審過的標 `approved: true`；其餘 810 句（90%）未審。全檔機械檢查：兩岸用語混用 0、簡體字 0、超長 0。比例寫在候選檔的 `note`。

重複度用 `npm run voices:stats`（1,000 個隨機 seed、8 組假設）量：「連玩第 k 局時，看過的句子比例」。1.0（30 人 90 句）：第 2 局 60%、第 10 局 94%；1.1（150 人 990 句 + 名額與權重調整）：第 2 局 7%、第 10 局 46%。寫手當時把 `seaClosed` 當「海區封鎖」用（引擎裡它是「本月好天用罄」），合併時改成 `phaseIndex ≥ 1`；`priceIndex` 全程最高只到 1.2 左右，門檻 1.15／1.2 改成 1.05／1.08；`supplyDays ≤ n` 在登陸前恆成立，補上 `troopsAshore ≥ 1`。

## 1.5 史書（M6）

章節由 `data/chapter-templates.json` 拼裝：四節（看得見的戰爭／海峽／第 N 天／世界），段落依條件（終止階段、結束原因、假設、本局有無某事件）選、依 seed 抽變體；`{ref:kind}` 換成指向該事件的 `[n]`；每節從該階段的聲音裡抽一則引文（沒有就借用其他階段）。章節用自己的 PRNG（`mix32(seed, 0xc4a9)`），不碰模擬的隨機流。字數 1,500–3,000 以測試守住（目前各種結局落在 1,500–2,200）。

變異：段落變體裡可寫行內替換 `{{甲|乙|丙}}`（依 seed 抽一個，可巢狀），段落可帶 `prob`（場景段，依 seed 丟骰決定這局出不出現），`lessons` 可以是陣列。這三樣讓同一組假設的幾局在結構與措辭上都不同，但同 seed 永遠同一章。

### 1.6 第三十一天之後（外推，不是模擬）

模型在 D+30 23:00 停筆（HANDOFF §5.2 以三十天為限；CSIS 2023 的推演也多在三到四週內收束）。撐到第三十天的局，灘頭上通常還有幾萬人，玩家會問「他們呢？」。`src/narrative/outlook.ts` 用本局的抽樣參數與最後一張快照做一段外推，寫進結局卡、戰情室結局與史書的結尾：

- 每日消耗 = `inland.counterattackPerDay × (0.5 + 後備動員率)`；灘頭守不住的規模 = `beach.requiredTroops × 0.3`（與縱深門檻 `forcesDepleted` 同一條線）；由此算「再幾天降到守不住」。
- 本月好天用罄 → 下一個窗口是下個月的 `weather.windowDays`；在那之前補給只剩空投與夜間小艇。
- 船團剩餘 < 40% → 「剩下的船不夠把他們接回來」。

這段明寫「史料到第三十天為止，後面是外推」，不計入 §5.2 的任何統計。

分享卡標題公式 `「我以為問題是{玩家最後改的假設或美軍}。問題是{三個名詞}。」`，三個名詞依結束原因碼查表（`src/narrative/sharecard.ts`）。事件簿每行帶當時的狀態量（從快照取），標紅假設的結算事件高亮。

## 2. 與 HANDOFF 的差異（PR 說明要列）

| HANDOFF | 實作 | 為什麼 |
| --- | --- | --- |
| §6.2 美軍介入後渡海損耗 ×1.6 | 改為加法項 `usSubLossPerTransit`（每趟 +25%），倍數降為 1.2 | CSIS 數據顯示美軍自身火力（潛艦、LRASM）才是主因，乘上台灣的小損耗得不到 90% |
| §4 `weatherWindowDays` 倒數 | 馬可夫逐日海況 + 好天預算 | 見 §1.2；連續窗口會讓 12 月也能偷一波 |
| §4 `Run` 型別 | 多了 `sampledParams`、`flagged`、`outcome.solidBeachhead`、`outcome.failedBy` | 事件簿與史書需要；不影響既有欄位 |
| §6.1 landing「第二波可卸載」 | 具體化為灘頭建立後再卸載 ≥ required × 0.3 | 需要可判定的數字 |
| §6.1 inland 只有 objective 與 timeout | 加 `fleetBroken`、`forcesDepleted` 兩個失敗 | CSIS 基準局的結束機制就是船團沒了 |
| §5.1 岸置飛彈單一存活率 | 拆固定／機動 | 《阿共打來怎麼辦》與波灣、烏克蘭經驗：機動發射車打不掉 |
| §5.3 東岸 3 處 | 蘭陽平原（Easton 的 4 處）+ 花蓮 + 台東 | Easton 的 14 處沒有花蓮台東；HANDOFF 的東岸教訓保留 |

## 3. 驗收解讀（§5.2）

基準假設（4 月、中型、延遲介入、開放基地、55%、高、北部、先取澎湖）1,000 場，engine v0.1.0：

| 指標 | HANDOFF §5.2 | 量測 |
| --- | --- | --- |
| 建立灘頭堡比例 | 10–30% | 登陸成功（landing 門檻）**59.5%**；穩固灘頭堡（補給 ≥ 3 天且兵力 ≥ 所需）**8.7%** |
| 30 天內達成戰略目標 | < 10% | **0.1%** ✓ |
| 中位終止日 | D+5 到 D+12 | **D+13**（P10 D+10、P90 D+16） |

結束原因：船團被擊沉 48.5%、渡海太慢 19.2%、渡海中船團崩潰 6.5%、士氣崩潰 5.6%、縱深兵力耗盡 5.3%、灘頭第二波失敗 4.3%、灘頭船團崩潰 4.6%、打擊未壓制岸置飛彈 3.1%。

**為什麼不調係數去湊。** CSIS 24 局解放軍每一局都上得了岸（基準局 37 個營、約 3 萬人），輸在船團 10–14 天內被擊沉、灘頭斷補給。以 CSIS、Easton、DoD、中央氣象署的數字建模，「上岸」本來就不是最難的門檻；最難的是「上岸後活下來」。HANDOFF §5.2 的「建立灘頭堡 10–30%」若指 landing 門檻，與公開兵推不一致；若指 CSIS 的「solid beachhead」（24 局中 3–7 局，約 14–30%），量測的 8.7% 在延遲介入下略低、不介入下 31%、立即介入下 0.7%，量級對得上。中位終止日 D+13 對應 CSIS 基準局「約 10 天後船團被擊沉、14 天結束」加上延遲介入的 7 天，差一天。

**決策（2026-10-02，ADR-0001）：** 採第一種。§5.2 改為「穩固灘頭堡 5–30%、登陸成功 ≥ 40% 且高於穩固灘頭堡、目標 < 10%、中位終止日 D+8 到 D+14」，UI 同時顯示兩個數字。第二種若日後要做，必須以玩家可見、標紅的參數呈現。全文見 `docs/adr/0001-beachhead-acceptance.md`。

`tests/engine.distribution.test.ts` 依新 §5.2 驗收，另設回歸護欄。

## 4. 校準紀錄

| 版本 | 改動 | 基準局：登陸／穩固／中位 |
| --- | --- | --- |
| 初版 | 單一岸置飛彈池 12%/日；灘頭只算 2 個守備旅；美軍 ×1.6 | 86.7%／—／D+13，86% 以士氣崩潰結束 |
| 修 1 | 岸置飛彈拆固定／機動；軍團其餘旅 48 小時內到位 | 80.8%／—／D+11 |
| 修 2 | 加 inland `fleetBroken`（CSIS 機制） | 80.8%／—／D+10 |
| 修 3 | 台灣單獨損耗校準到 CSIS 16%/10 天；美軍改加法 25%/趟；士氣衰減校準到「無軍事崩潰時約 D+35 跌破停止線」 | 96.3%／—／D+13 |
| 修 4 | 加灘岸火網損失 10%；定義穩固灘頭堡 | 96.1%／28.4%／D+13 |
| 修 5 | 修 bug：船團卸到一半就返航（`loadHours × 2` 上限） | 96.7%／43.7%／D+13 |
| 修 6 | 海況改馬可夫逐日 | 81.6%／13.1%／D+14 |
| 修 7 | 壞海況時錨泊船團中止卸載 | **59.5%／8.7%／D+13** |

每一步都是補資料裡有、模型裡沒有的機制，或修 bug；沒有一步是為了往區間裡推而改係數。

## 5. 刻意的簡化（來源頁「現實面的考量」初稿素材）

- 空戰只有一個「紅方制空」數字；電戰、防空壓制沒有分層。
- 飛彈打擊三天一次結算，沒有逐枚配置；機場、雷達只影響制空與損耗係數。
- 灘頭戰用 Lanchester 線性律，守方火砲只以灘岸損失與交換係數出現；沒有單位、沒有地形格。
- 守方不決策：後備動員率、增援時程都是假設給定的曲線。
- 船團用 3／5／8 個「群」代表，群內均質；登陸艇數量（CSIS：305 艘）沒有獨立建模，只透過吞吐量與灘岸損失出現。
- 家前線層只有四個狀態量，停工曲線是線性的。
- 美軍自身損失、中美升級、核選項不在模型內（HANDOFF §13）。
- 月份只決定海況與颱風機率；潮汐、月相、能見度沒有建模。
