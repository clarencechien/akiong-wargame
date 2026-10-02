# 上線（1.0）

靜態檔案，沒有後端。`npm run build` 輸出 `dist/`，直接上 Cloudflare Pages 或任何靜態空間。

## Cloudflare Pages（Git 整合）

1. Cloudflare 儀表板 → Workers & Pages → Create → Pages → Connect to Git，選這個 repo。
2. 設定：Framework preset `None`；Build command `npm run build`；Build output directory `dist`；Node 版本環境變數 `NODE_VERSION=22`。
3. 不需要任何環境變數或密鑰。執行期不呼叫任何 API。
4. `public/_headers` 會隨 build 進 `dist/`，Pages 會套用：CSP 只允許自己與 Google Fonts，worker 允許 `blob:`，`/assets/*` 長快取（檔名帶 hash）。

每次 push 到 main 自動部署；PR 會有預覽網址。

## Cloudflare Workers（Workers Builds，`npx wrangler deploy`）

如果在 Cloudflare 建的是 Workers 專案而不是 Pages，部署指令會是 `npx wrangler deploy`。repo 裡的 `wrangler.jsonc` 已設成靜態資產模式：沒有 Worker 程式碼，只把 `dist/` 當靜態站台服務，`_headers` 一樣生效。

- Build command `npm run build`；Deploy command `npx wrangler deploy`；不需要環境變數。
- 沒有 `wrangler.jsonc` 時 wrangler 會嘗試依 Vite 自動設定，那條路要求 Vite ≥ 6，會失敗（錯誤：The version of Vite used in the project cannot be automatically configured）。有設定檔就不走那條路。
- 本機驗證：`npm run build && npx wrangler deploy --dry-run`。

Pages 與 Workers 擇一即可；兩邊都不需要密鑰，執行期不呼叫任何 API。

## 其他靜態空間

GitHub Pages、Netlify、S3 + CloudFront 都可以。`vite.config.ts` 的 `base: './'`，放在子路徑也能跑。只有 `_headers` 是 Cloudflare 格式，其他平台要用各自的方式設標頭（可不設，功能不受影響）。

## 字型

頁面從 Google Fonts 載入 Noto Serif TC、Noto Sans TC、IBM Plex Mono，載不到時退回系統字型，功能不受影響。要徹底「不打網路」可自架字型子集放進 `public/fonts/` 並改 `index.html`；CJK 子集化後約數百 KB 到數 MB。

## CI

`.github/workflows/ci.yml`：typecheck、參數庫檢查、測試、build、Playwright smoke（含 100 場計時與三個畫面），截圖上傳為 artifact。

## 上線前檢查

- `npm run check:params` 通過（每筆有 source 與 range）。
- `data/voice-templates.json` 有人工核准的句子（1.0：90 句，2026-10-02 核准）。
- `docs/realism.md` 是目前版本（來源頁直接載入這份檔）。
- `npm run build && npm run smoke` 通過。
