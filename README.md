# 如果你是阿共，你要怎麼打過來？

台海兵推教育版。玩家扮演攻方總指揮，設定八個開局假設，在瀏覽器本機跑決定性模擬，最後讀一章未來的教科書。

目標不是聲光，是讓人親身撞到「中國要打台灣有多困難」這堵牆。

- 規格：[`docs/HANDOFF.md`](docs/HANDOFF.md)
- 產品需求：[`docs/PRD.md`](docs/PRD.md)
- 模型說明與校準紀錄：[`docs/model.md`](docs/model.md)
- 理論基礎與資料來源：[`docs/sources.md`](docs/sources.md)（原始研究筆記在 [`docs/research/`](docs/research/)）
- 畫面參考：[`docs/mockup/`](docs/mockup/)

## 跑起來

```bash
npm install
npm run sim -- --n 1000            # 基準假設 1,000 場，印分佈與 §5.2 驗收
npm run sim -- --n 1000 --month 12 # 改假設：--month --scale --us --japan --reserve --econ --axis --aux
npm run sim -- --events --seed 7   # 印一局的事件流
npm test                           # 決定性、分佈、效能、參數庫格式、分享編碼、情報評估
npm run check:params               # 參數庫每筆 source／range 檢查
npm run dev                        # 作戰室（Vite 開發伺服器）
npm run build && npm run smoke     # 建置後用 Playwright 跑一遍：八假設、情報評估、東岸標紅、100 場 < 60 s
```

畫面截圖（smoke 產生）：[`docs/screenshots/`](docs/screenshots/)。

致敬《阿共打來怎麼辦》《再談阿共打來怎麼辦》兩位作者與軍事科普的目標。

狀態：M1 引擎、M2 參數庫、M3 作戰室 + worker pool、M4 戰情室完成（§5.2 依 ADR-0001 修訂後通過；100 場約 0.3 秒；可播完一局）。下一步 M5 聲音系統。
