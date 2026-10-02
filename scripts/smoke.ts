/**
 * 手測自動化（M3 完成定義：100 場 < 60 s）：用 Playwright 開 vite preview，選 100 場、按下令，量時間並確認進戰情室。
 *   npm run build && npm run smoke
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4173;
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  await sleep(1500);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 資源載入失敗（字型被代理擋、favicon）不算頁面錯誤
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.getByRole('heading', { name: '如果你是阿共，你要怎麼打過來？' }).waitFor();
  // 八個假設都在
  for (const t of ['發動月份', '動員規模', '美國介入', '日本態度', '台灣後備動員率', '經濟自損容忍', '主攻軸', '輔助作戰']) {
    await page.getByRole('radiogroup', { name: t }).waitFor();
  }
  // 改月份 → 情報評估文案改變
  const intelBefore = await page.locator('.intel').first().innerText();
  await page.getByRole('radiogroup', { name: '發動月份' }).getByRole('radio', { name: '8', exact: true }).click();
  const intelAfter = await page.locator('.intel').first().innerText();
  if (intelBefore === intelAfter) throw new Error('改月份後情報評估文案沒有改變');
  await page.getByRole('radiogroup', { name: '發動月份' }).getByRole('radio', { name: '4', exact: true }).click();
  // 東岸標紅
  await page.getByRole('radiogroup', { name: '主攻軸' }).getByRole('radio', { name: /東岸/ }).click();
  const warn = await page.locator('.intel.warn').count();
  if (warn < 1) throw new Error('東岸主攻沒有標紅');
  await page.getByRole('radiogroup', { name: '主攻軸' }).getByRole('radio', { name: /北部/ }).click();
  // 100 場
  await page.getByRole('radiogroup', { name: '模擬場數' }).getByRole('radio', { name: '100', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/01-warroom.png' });
  const t0 = Date.now();
  await page.getByTestId('order').click();
  await page.locator('.situation-stub').waitFor({ timeout: 60_000 });
  const ms = Date.now() - t0;
  const eventsCount = await page.locator('.events .e').count();
  await page.screenshot({ path: 'docs/screenshots/02-situation-stub.png' });
  await browser.close();
  console.log(`100 場 ${(ms / 1000).toFixed(1)} s（驗收 < 60 s）；第 1 局事件 ${eventsCount} 則；頁面錯誤 ${errors.length} 個`);
  for (const e of errors) console.log('  ' + e);
  if (ms >= 60_000 || eventsCount < 5 || errors.length > 0) process.exitCode = 1;
} finally {
  preview.kill();
}
