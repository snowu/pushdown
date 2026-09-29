// node miner.js [seconds=120] [workers=10]
// Generate random boards from puzzle-shaped templates, solve them, and keep the
// ones whose shortest solution changes the laws the most times. Writes the best
// to drafts/mined.json (merged with previous runs).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { parse, step, solve, toGrid, toLines } from './engine.js';

// ---------- generation ----------
function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const TINY = process.env.MODE === 'tiny';

function generate(rand) {
  const pick = a => a[Math.floor(rand() * a.length)];
  if (TINY) return generateTiny(rand, pick);
  const W = 9 + Math.floor(rand() * 5), H = 6 + Math.floor(rand() * 3);
  const g = Array.from({ length: H }, () => Array(W).fill(' '));
  const free = (r, c, len = 1) => { for (let i = 0; i < len; i++) if (c + i >= W || g[r][c + i] !== ' ') return false; return true; };
  // leave a gap on both sides of a sentence so it isn't glued at birth
  const roomy = (r, c, len) => free(r, c, len) && (c === 0 || g[r][c - 1] === ' ') && (c + len >= W || g[r][c + len] === ' ');
  const put = (s, tries = 40) => {
    for (let t = 0; t < tries; t++) {
      const r = Math.floor(rand() * H), c = Math.floor(rand() * (W - s.length + 1));
      if (roomy(r, c, s.length)) { [...s].forEach((ch, i) => (g[r][c + i] = ch)); return [r, c]; }
    }
    return null;
  };

  // 1. a barrier around the goal: a cage of #, a ring of ~, or nothing
  const barrier = pick(['#', '~', '#', 'none']);
  const goal = '$';
  if (barrier !== 'none') {
    const r0 = Math.floor(rand() * (H - 2)), c0 = Math.floor(rand() * (W - 2));
    for (let r = r0; r < r0 + 3; r++) for (let c = c0; c < c0 + 3; c++) g[r][c] = barrier;
    g[r0 + 1][c0 + 1] = goal;
  } else put(goal);

  // 2. the laws: always a you; the rest are whole, partial, or missing
  const you = pick(['@', '@', '@x']);
  if (!put(`you=${you}`)) return null;
  const win = pick(['win=$', 'win=$', 'win=', 'win=', 'wni=$', 'win=x']);
  if (!put(win)) return null;
  if (barrier === '#' && !put(pick(['stop=#', 'stop=#', 'stop=#@', 'sotp=#']))) return null;
  if (barrier === '~' && !put(pick(['kill=~', 'kill=~', 'kill=~x']))) return null;
  if (rand() < .3) put(pick(['stop=#', 'kill=~', 'you=@', 'win=$']));

  // 3. bodies and loose type
  if (!put('@')) return null;
  if (you.includes('x') || rand() < .3) put('x');
  const loose = Math.floor(rand() * 3);
  for (let i = 0; i < loose; i++) put(pick(['$', '#', 'i', 'n', '=', 'x', 'o', '~', '@']));
  return toLines(g);
}

// Minimalist boards: a handful of pieces in a small box.
function generateTiny(rand, pick) {
  const W = 6 + Math.floor(rand() * 4), H = 4 + Math.floor(rand() * 3);
  const g = Array.from({ length: H }, () => Array(W).fill(' '));
  const put = s => {
    for (let t = 0; t < 40; t++) {
      const r = Math.floor(rand() * H), c = Math.floor(rand() * (W - s.length + 1));
      let ok = true;
      for (let i = -1; i <= s.length; i++) if (c + i >= 0 && c + i < W && g[r][c + i] !== ' ') ok = false;
      if (ok) { [...s].forEach((ch, i) => (g[r][c + i] = ch)); return true; }
    }
    return false;
  };
  const sentences = [pick(['you=@', 'you=@', 'you=@x', 'you=x@']), pick(['win=', 'win=$', 'win=', 'win=x', 'win=@'])];
  if (rand() < .5) sentences.push(pick(['stop=#', 'kill=~', 'stop=@', 'kill=x', 'you=@']));
  for (const s of sentences) if (!put(s)) return null;
  put('@');
  const extras = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < extras; i++) put(pick(['$', '#', 'x', '~', '@', '=', 'i', 'n', 'o']));
  return toLines(g);
}

// ---------- scoring ----------
// How many times do the laws change along the solution? A move that forms or
// breaks a sentence is where the insight lives.
function lawChanges(lines, moves) {
  const laws = g => parse(g).statements.map(s => s.key + '=' + s.value).sort().join(' ');
  let g = toGrid(lines), prev = laws(g), changes = 0;
  for (const m of moves) { g = step(g, m).grid; const now = laws(g); if (now !== prev) changes++; prev = now; }
  return changes;
}

function evaluate(lines) {
  const res = solve(lines, { maxStates: 60_000 });
  if (!res.solved || res.moves.length < 7) return null;
  const changes = lawChanges(lines, res.moves);
  if (changes < 2) return null;
  // Would the goal be reachable if nobody touched any type? If so it's a walk, not a puzzle.
  const pieces = lines.join('').replace(/ /g, '').length;
  const score = TINY
    ? res.moves.length * 2 + changes * 6 - pieces * 1.5
    : changes * 10 + Math.min(res.moves.length, 30) - res.explored / 20_000;
  return { map: lines, par: res.moves.length, changes, explored: res.explored, score: +score.toFixed(2) };
}

// ---------- plumbing ----------
if (isMainThread) {
  const seconds = Number(process.argv[2] ?? 120), n = Math.min(Number(process.argv[3] ?? 10), cpus().length);
  const out = TINY ? 'drafts/mined-tiny.json' : 'drafts/mined.json';
  const found = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
  const seen = new Set(found.map(f => f.map.join('\n')));
  let tried = 0;
  const workers = Array.from({ length: n }, (_, i) => new Worker(new URL(import.meta.url), { workerData: { seed: Date.now() + i * 7919 } }));
  for (const w of workers) w.on('message', m => {
    tried += m.tried;
    for (const f of m.found) { const k = f.map.join('\n'); if (!seen.has(k)) { seen.add(k); found.push(f); } }
  });
  const report = () => {
    found.sort((a, b) => b.score - a.score);
    writeFileSync(out, JSON.stringify(found.slice(0, 200), null, 1));
    console.log(`${tried} boards tried, ${found.length} kept. best: ${found.slice(0, 5).map(f => `${f.score} (${f.changes}×, par ${f.par})`).join(', ')}`);
  };
  const tick = setInterval(report, 20_000);
  setTimeout(() => { clearInterval(tick); workers.forEach(w => w.terminate()); report(); }, seconds * 1000);
} else {
  const rand = rng(workerData.seed);
  for (;;) {
    const batch = { tried: 0, found: [] };
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      const lines = generate(rand);
      batch.tried++;
      if (!lines) continue;
      const r = evaluate(lines);
      if (r) batch.found.push(r);
    }
    parentPort.postMessage(batch);
  }
}
