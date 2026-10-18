// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset in Settings → Graphics,
// presses Play and keeps the relay moving by reading the visible prompt word and typing it into the
// guess box every couple of seconds — the artist ring hops seats, artists lift, the timer bar runs,
// lamps sway and dust drifts in the studio. A finished game goes back to the title and plays again.
export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

export async function setPreset(page, preset) {
  await page.waitForSelector('#btn-settings', { state: 'visible', timeout: 30000 });
  await page.click('#btn-settings');
  await page.waitForSelector('#screen-settings:not([hidden])');
  await page.selectOption('#gfx-preset', preset);
  await page.waitForFunction((p) => document.body.dataset.gfxPreset === p, preset);
  await page.click('#btn-settings-close');
  await page.waitForSelector('#screen-settings', { state: 'hidden' });
}

async function play(page) {
  await page.click('#btn-play');
  await page.waitForSelector('#guess-panel:not([hidden])', { timeout: 15000 });
}

async function step(page) {
  if (await page.locator('#screen-results:not([hidden])').count()) {
    await page.click('#btn-back-to-title', { timeout: 3000 });
    await play(page);
    return;
  }
  const word = ((await page.textContent('#prompt-word')) || '').trim();
  if (!word) return;
  await page.fill('#guess-input', word);
  await page.press('#guess-input', 'Enter');
}

export async function start(page) {
  await play(page);
  let open = true;
  page.once('close', () => { open = false; });
  (async () => {
    while (open) {
      try { await step(page); } catch (e) { if (!open) return; if (process.env.BENCH_DEBUG) console.error(e.message); }
      await page.waitForTimeout(2200).catch(() => {});
    }
  })();
  await page.waitForTimeout(1500);
}
