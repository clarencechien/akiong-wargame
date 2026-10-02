# 聲音模板的生成與審稿

1. `npm run voices:gen`（需 `ANTHROPIC_API_KEY`）：用 Claude 替每個人物三個 stage 各產幾句候選，寫到 `data/_candidates/voice-templates.<日期>.candidates.json`。腳本不會碰正式檔。
2. 人工審稿：打開候選檔，逐句把 `approved` 改成 `true`（或刪掉）。檢查：不寫具名真實人物、不寫血腥細節、台灣正體中文、≤ 60 字、像人說的話。
3. `npm run voices:promote -- --in <候選檔>`：只搬 `approved: true` 的進 `data/voice-templates.json`，搬前再驗一次格式。整份看過可用 `--all`。
4. `npm test`：`voices.test.ts` 會檢查每局 12–20 則、同人物 ≤ 3 次、無重複 stage、每則都指回觸發事件。

`data/_candidates/` 預設不進版控，只有 `*.candidates.json` 例外，方便在 PR 裡審。
