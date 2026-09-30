// node edition.js [seconds=600] [workers=12] [minScore=36]
// Print an edition: mine many small puzzles in parallel, dedupe, keep the best,
// and write them to edition.json, which build.js ships inside the game as
// the daily apocryphon.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { rng, generateTiny, evaluateTiny } from './press.js';

if (isMainThread) {
  const [seconds = 600, n = 12, minScore = 36] = process.argv.slice(2).map(Number);
  const out = 'edition.json';
  const found = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
  const norm = m => m.map(r => r.trimEnd()).join('\n');
  const seen = new Set(found.map(f => norm(f.map)));
  let tried = 0;
  const workers = Array.from({ length: n }, (_, i) =>
    new Worker(new URL(import.meta.url), { workerData: { seed: (Date.now() ^ Math.imul(i + 1, 2654435761)) >>> 0, minScore } }));
  for (const w of workers) w.on('message', m => {
    tried += m.tried;
    for (const f of m.found) { const k = norm(f.map); if (!seen.has(k)) { seen.add(k); found.push(f); } }
  });
  const report = () => {
    found.sort((a, b) => b.score - a.score);
    writeFileSync(out, JSON.stringify(found));
    const pars = found.map(f => f.par);
    console.log(`${tried} tried · ${found.length} in the edition · score ${found.at(-1)?.score}..${found[0]?.score} · par ${Math.min(...pars)}..${Math.max(...pars)}`);
  };
  const tick = setInterval(report, 60_000);
  setTimeout(() => { clearInterval(tick); workers.forEach(w => w.terminate()); report(); }, seconds * 1000);
} else {
  const rand = rng(workerData.seed);
  for (;;) {
    const batch = { tried: 0, found: [] };
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const lines = generateTiny(rand);
      batch.tried++;
      if (!lines) continue;
      const r = evaluateTiny(lines);
      if (r && r.score >= workerData.minScore) batch.found.push({ map: lines.map(l => l.trimEnd()), par: r.par, sets: r.sets, score: r.score });
    }
    parentPort.postMessage(batch);
  }
}
