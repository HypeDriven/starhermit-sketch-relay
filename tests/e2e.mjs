/**
 * Sketch Relay — end-to-end QA playthrough (dev only, not shipped).
 *
 * Drives the real visible UI in headless Chrome via playwright-core:
 *   load → title → Play → guess every word (the on-screen prompt panel shows
 *   the word the artist is drawing; we read that visible text and type it
 *   into the visible guess box) → all 36 words solved → results screen →
 *   back to title. Also exercises pause/resume and pause → quit-to-title.
 *
 * The game is fully local/solo (deterministic rules engine + Three.js
 * presentation); no StarHermit backend is needed. server.js is a plain
 * static file server, but this test embeds its own ephemeral static server
 * so it is self-contained.
 *
 * Two passes: desktop 1280x800, then a fresh mobile context 390x844 w/ touch.
 * Any non-benign pageerror/console-error fails the run (exit 1).
 *
 * Run: npm run test:e2e
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = (stage, vp) => `/tmp/sketch-relay-e2e-${stage}-${vp}.png`;

// benign GPU/swiftshader noise (from tools/production_game_audit.mjs)
const browserNoise = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions/i;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = (req.url || '/').split('?')[0];
      if (p === '/') p = '/index.html';
      const file = path.join(ROOT, decodeURIComponent(p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const TOTAL_WORDS = 12 * 3; // ROSTER_SIZE * WORDS_PER_TURN

async function playthrough(page, vp, errors) {
  const step = async (name, fn) => {
    await fn();
    console.log(`ok - [${vp}] ${name}`);
  };

  await step('load + title visible', async () => {
    await page.goto(page._baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('#screen-loading', { state: 'hidden', timeout: 10000 });
    await page.waitForSelector('#screen-title:not([hidden])', { timeout: 10000 });
    await page.screenshot({ path: SHOT('title', vp) });
  });

  await step('settings → Graphics: presets, override, persistence', async () => {
    const attr = () => page.evaluate(() => ({ preset: document.body.dataset.gfxPreset, auto: document.body.dataset.gfxAuto, canvas: document.querySelector('#scene-canvas').dataset.gfxPreset }));
    let a = await attr();
    if (a.preset !== 'low' || a.auto !== '1') throw new Error('software GPU should resolve Auto to low: ' + JSON.stringify(a));
    if (vp === 'mobile') await page.tap('#btn-settings'); else await page.click('#btn-settings');
    await page.waitForSelector('#screen-settings:not([hidden])');
    const autoLabel = await page.textContent('#gfx-preset-auto');
    if (!/Low/.test(autoLabel)) throw new Error('auto label: ' + autoLabel);
    // panel fits the viewport and never scrolls sideways
    const fit = await page.evaluate(() => {
      const p = document.querySelector('.settings-panel'), r = p.getBoundingClientRect();
      return { r: [r.left, r.top, r.right, r.bottom], vw: innerWidth, vh: innerHeight, sx: p.scrollWidth - p.clientWidth };
    });
    if (fit.r[0] < 0 || fit.r[1] < 0 || fit.r[2] > fit.vw || fit.r[3] > fit.vh || fit.sx > 0) throw new Error('settings panel does not fit: ' + JSON.stringify(fit));
    await page.selectOption('#gfx-preset', 'low');
    a = await attr();
    if (a.preset !== 'low' || a.auto !== '0' || a.canvas !== 'low') throw new Error('low not applied: ' + JSON.stringify(a));
    await page.selectOption('#gfx-preset', 'ultra');
    await page.waitForTimeout(600);
    await page.selectOption('#gfx-preset', 'high');
    await page.waitForTimeout(400);
    a = await attr();
    if (a.preset !== 'high') throw new Error('high not applied: ' + JSON.stringify(a));
    let summary = await page.textContent('#gfx-summary');
    if (!/Shadows 2048²/.test(summary) || !/SMAA/.test(summary)) throw new Error('high summary: ' + summary);
    await page.selectOption('#gfx-shadows', 'off');
    summary = await page.textContent('#gfx-summary');
    if (/Shadows/.test(summary)) throw new Error('shadow override not applied: ' + summary);
    await page.screenshot({ path: SHOT('settings', vp) });
    if (vp === 'desktop') await page.keyboard.press('Escape'); else await page.tap('#btn-settings-close');
    await page.waitForSelector('#screen-settings', { state: 'hidden' });
    // survives reload
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#screen-title:not([hidden])');
    a = await attr();
    if (a.preset !== 'high' || a.auto !== '0') throw new Error('preset lost on reload: ' + JSON.stringify(a));
    await page.click('#btn-settings');
    if ((await page.inputValue('#gfx-shadows')) !== 'off') throw new Error('override lost on reload');
    if ((await page.inputValue('#gfx-preset')) !== 'high') throw new Error('preset select lost on reload');
    // choosing a preset clears overrides; back to Auto keeps the rest of the run fast
    await page.selectOption('#gfx-preset', 'auto');
    if ((await page.inputValue('#gfx-shadows')) !== 'preset') throw new Error('preset did not clear overrides');
    a = await attr();
    if (a.preset !== 'low' || a.auto !== '1') throw new Error('auto not restored: ' + JSON.stringify(a));
    await page.click('#btn-settings-close');
    await page.waitForSelector('#screen-settings', { state: 'hidden' });
  });

  await step('start game via Play button', async () => {
    await page.click('#btn-play');
    await page.waitForSelector('#screen-game:not([hidden])');
    await page.waitForSelector('#prompt-panel:not([hidden])');
    await page.waitForSelector('#guess-panel:not([hidden])');
    const word = (await page.textContent('#prompt-word')).trim();
    if (!word) throw new Error('prompt word is empty after start');
    const hud = await page.textContent('#hud-round');
    if (!/Artist:/.test(hud)) throw new Error('HUD missing artist: ' + hud);
    await page.screenshot({ path: SHOT('game', vp) });
  });

  await step('pause → resume', async () => {
    await page.click('#btn-pause');
    await page.waitForSelector('#screen-pause:not([hidden])');
    await page.screenshot({ path: SHOT('pause', vp) });
    await page.click('#btn-pause-settings');
    await page.waitForSelector('#screen-settings:not([hidden])');
    await page.click('#btn-settings-close');
    await page.waitForSelector('#screen-settings', { state: 'hidden' });
    if (await page.locator('#screen-pause').isHidden()) throw new Error('pause overlay lost after settings');
    await page.click('#btn-resume');
    await page.waitForSelector('#screen-pause', { state: 'hidden' });
    if (await page.locator('#screen-game').isHidden()) throw new Error('game screen lost after resume');
  });

  await step('solve first words via the guess box', async () => {
    // read the visible prompt word and type it back through the real input
    let last = (await page.textContent('#prompt-word')).trim();
    for (let i = 0; i < 2; i++) {
      await page.fill('#guess-input', last);
      if (i === 0) await page.press('#guess-input', 'Enter');
      else await page.click('#btn-guess-submit');
      await page.waitForFunction(
        (prev) => {
          const results = document.querySelector('#screen-results');
          if (results && !results.hidden) return true;
          return document.querySelector('#prompt-word').textContent.trim() !== prev;
        },
        last,
        { timeout: 5000 },
      );
      last = (await page.textContent('#prompt-word')).trim();
      if (i === 0) await page.screenshot({ path: SHOT('guessing', vp) });
    }
  });

  await step('solve all remaining words → results', async () => {
    for (let i = 2; i < TOTAL_WORDS; i++) {
      const word = (await page.textContent('#prompt-word')).trim();
      await page.fill('#guess-input', word);
      await page.press('#guess-input', 'Enter');
      await page.waitForFunction(
        (prev) => {
          const results = document.querySelector('#screen-results');
          if (results && !results.hidden) return true;
          const pw = document.querySelector('#prompt-word');
          return pw && pw.textContent.trim() !== prev;
        },
        word,
        { timeout: 5000 },
      );
    }
    await page.waitForSelector('#screen-results:not([hidden])', { timeout: 5000 });
    const headline = await page.textContent('#results-headline');
    if (!/All words completed/.test(headline)) throw new Error('unexpected headline: ' + headline);
    const body = await page.textContent('#results-body');
    if (!/Words solved: 36 of 36/.test(body)) throw new Error('unexpected results body: ' + body);
    console.log(`  [${vp}] results: ${body.trim()}`);
    await page.screenshot({ path: SHOT('results', vp) });
  });

  await step('back to title', async () => {
    await page.click('#btn-back-to-title');
    await page.waitForSelector('#screen-title:not([hidden])');
    await page.screenshot({ path: SHOT('back-to-title', vp) });
  });

  await step('second game: pause → quit to title', async () => {
    await page.click('#btn-play');
    await page.waitForSelector('#screen-game:not([hidden])');
    await page.click('#btn-pause');
    await page.waitForSelector('#screen-pause:not([hidden])');
    await page.click('#btn-quit-to-title');
    await page.waitForSelector('#screen-title:not([hidden])');
    if (await page.locator('#screen-pause').isVisible()) throw new Error('pause overlay stuck after quit');
  });

  const bad = errors.filter((e) => !browserNoise.test(e));
  if (bad.length) throw new Error(`[${vp}] page errors:\n` + bad.join('\n'));
}

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/`;
let browser = null;
try {
  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const allErrors = [];

  // pass 1: desktop
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page._baseUrl = base;
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console ${m.type()}: ${m.text()}`); });
    try {
      await playthrough(page, 'desktop', errors);
    } finally {
      allErrors.push(...errors);
      await ctx.close();
    }
  }

  // pass 2: mobile, fresh context with touch
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    page._baseUrl = base;
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console ${m.type()}: ${m.text()}`); });
    try {
      await playthrough(page, 'mobile', errors);
    } finally {
      allErrors.push(...errors);
      await ctx.close();
    }
  }

  const bad = allErrors.filter((e) => !browserNoise.test(e));
  if (bad.length) {
    console.log('PAGE ERRORS:\n' + bad.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nE2E PASS — sketch-relay: full playthrough (desktop + mobile), no page errors');
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
