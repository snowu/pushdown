// node e2e.js — play every level in headless Chrome using the solver's moves,
// through real key presses, and check that the proof sheet says "solved".
// Needs puppeteer-core (PUPPETEER_DIR) and a chromium binary (CHROME).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { solve } from './engine.js';
import { LEVELS } from './levels.js';

const require = createRequire(process.env.PUPPETEER_DIR ? process.env.PUPPETEER_DIR + '/' : import.meta.url);
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const url = pathToFileURL(new URL('./pushdown.html', import.meta.url).pathname).href;
const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
let failed = 0;
for (let i = 0; i < LEVELS.length; i++) {
  await page.goto(url);
  await page.evaluate(i => { localStorage.clear(); localStorage.setItem('pushdown:level', i); localStorage.setItem('pushdown:sound', 'false'); }, i);
  await page.reload({ waitUntil: 'load' });
  const { moves } = solve(LEVELS[i].map);
  for (const m of moves) await page.keyboard.press(keys[m]);
  await page.waitForFunction(() => document.getElementById('sheet').classList.contains('show'), { timeout: 3000 }).catch(() => {});
  const title = await page.$eval('#sheetTitle', el => el.textContent);
  const ok = /solved|the end/.test(title);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(i + 1).padStart(2)} ${LEVELS[i].title.padEnd(20)} ${moves.length} moves → "${title}"`);
}
// The editor: type a level, ask the solver, then play it.
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.click('.drawer button.wide');
await page.$eval('#src', el => (el.value = ''));
await page.type('#src', '  @   $\n\nyou=@ win=$');
await page.click('#solveBtn');
await page.waitForFunction(() => /solvable|impossible|gave up/.test(document.getElementById('out').textContent), { timeout: 5000 });
const verdict = await page.$eval('#out', el => el.textContent);
await page.click('#play');
for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight']) await page.keyboard.press(k);
await page.waitForFunction(() => document.getElementById('sheet').classList.contains('show'), { timeout: 3000 }).catch(() => {});
const edTitle = await page.$eval('#sheetTitle', el => el.textContent);
const edOk = verdict.startsWith('solvable in 4') && edTitle === 'solved';
if (!edOk) failed++;
console.log(`${edOk ? 'ok  ' : 'FAIL'}    editor               "${verdict.slice(0, 40)}…" then played → "${edTitle}"`);

await browser.close();
if (errors.length) console.log('page errors:', errors);
process.exit(failed || errors.length ? 1 : 0);
