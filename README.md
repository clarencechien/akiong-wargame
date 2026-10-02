# 如果你是阿共，你要怎麼打過來？

台海兵推教育版。玩家扮演攻方總指揮，設定八個開局假設，在瀏覽器本機跑決定性模擬，最後讀一章未來的教科書。

目標不是聲光，是讓人親身撞到「中國要打台灣有多困難」這堵牆。

- 規格：[`docs/HANDOFF.md`](docs/HANDOFF.md)
- 產品需求：[`docs/PRD.md`](docs/PRD.md)
- 模型說明與校準紀錄：[`docs/model.md`](docs/model.md)
- 理論基礎與資料來源：[`docs/sources.md`](docs/sources.md)（原始研究筆記在 [`docs/research/`](docs/research/)）
- 上線：[`docs/deploy.md`](docs/deploy.md)
- 畫面參考：[`docs/mockup/`](docs/mockup/)

## 跑起來

```bash
npm install
npm run sim -- --n 1000            # 基準假設 1,000 場，印分佈與 §5.2 驗收
npm run sim -- --n 1000 --month 12 # 改假設：--month --scale --us --japan --reserve --econ --axis --aux
npm run sim -- --events --seed 7   # 印一局的事件流
npm test                           # 決定性、分佈、效能、參數庫格式、分享編碼、情報評估
npm run check:params               # 參數庫每筆 source／range 檢查
npm run sim -- --events --seed 7 --candidates   # 用候選模板預覽聲音（審稿用）
npm run voices:promote -- --all    # 審過候選檔後搬進正式檔（見 scripts/gen-templates/README.md）
npm run voices:stats               # 1,000 個隨機 seed 量聲音重複度（連玩第 k 局看過的句子比例）
npx tsx scripts/merge-voice-batches.ts --tag <日期> <寫手批次.json>…   # 合併多批人物與句子並驗格式
npm run dev                        # 作戰室（Vite 開發伺服器）
npm run build && npm run smoke     # 建置後用 Playwright 跑一遍：八假設、情報評估、東岸標紅、100 場 < 60 s
```

畫面截圖（smoke 產生）：[`docs/screenshots/`](docs/screenshots/)。

致敬《阿共打來怎麼辦》《再談阿共打來怎麼辦》兩位作者與軍事科普的目標。

狀態：1.0 程式完成（M1 到 M7），之後的修整見 [`docs/CHANGELOG.md`](docs/CHANGELOG.md)。人物庫 150 人、990 句（900 句新句抽審 10%、問題率約 1%，整批先上線，其餘待補審）。`docs/realism.md` 為第一版。上線步驟見 [`docs/deploy.md`](docs/deploy.md)。
