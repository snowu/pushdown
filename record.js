// node record.js <level index> [out.gif]  — let the solver play a level in
// headless Chrome and record it as a GIF (needs puppeteer-core via
// PUPPETEER_DIR, chromium, and ffmpeg).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { LEVELS } from './levels.js';
import { par } from './par.js';

const [i = 4, out = 'docs/demo.gif'] = process.argv.slice(2);
const require = createRequire(process.env.PUPPETEER_DIR ? process.env.PUPPETEER_DIR + '/' : import.meta.url);
const puppeteer = require('puppeteer-core');
const dir = mkdtempSync(join(tmpdir(), 'pushdown-rec-'));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 720, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(new URL('./pushdown.html', import.meta.url).pathname).href);
await page.evaluate(i => { localStorage.clear(); localStorage.setItem('pushdown:level', i); localStorage.setItem('pushdown:sound', 'false'); }, Number(i));
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 900));

const clip = { x: 0, y: 0, width: 1100, height: 720 }; // the whole page, every frame, so sizes match
let n = 0;
const shot = async (times = 1) => { for (let k = 0; k < times; k++) await page.screenshot({ path: join(dir, `f${String(n++).padStart(4, '0')}.png`), clip }); };
const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

await shot(6);                                   // hold on the opening position
const { moves } = par(LEVELS[i]);
for (const m of moves) {
  await page.keyboard.press(keys[m]);
  await new Promise(r => setTimeout(r, 190));    // let blocks slide and ink
  await shot(1);
}
await new Promise(r => setTimeout(r, 700));      // the proof sheet drops
await shot(14);
await browser.close();

// scale down, then palette-optimize
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '4', '-i', join(dir, 'f%04d.png'),
  '-vf', `scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, out]);
rmSync(dir, { recursive: true });
console.log(`recorded ${moves.length} moves → ${out}`);
