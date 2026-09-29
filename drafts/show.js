// node drafts/show.js [rank...] — show mined levels with the frames where laws change.
import { readFileSync } from 'node:fs';
import { parse, step, solve, toGrid, toLines } from '../engine.js';
const mined = JSON.parse(readFileSync(new URL(process.env.FILE || './mined.json', import.meta.url)));
const ranks = process.argv.slice(2).map(Number);
for (const i of ranks.length ? ranks : [0, 1, 2]) {
  const m = mined[i];
  const { moves } = solve(m.map, { maxStates: 100_000 });
  const laws = g => parse(g).statements.map(s => s.key + '=' + s.value).sort().join(' ');
  let g = toGrid(m.map), prev = laws(g);
  const frames = [['start', toLines(g), prev]];
  moves.forEach((d, n) => { g = step(g, d).grid; const now = laws(g); if (now !== prev || n === moves.length - 1) frames.push([`#${n + 1} ${d}`, toLines(g), now]); prev = now; });
  console.log(`=== rank ${i}: score ${m.score}, ${m.changes} law changes, par ${m.par}, ${m.explored} states`);
  const w = m.map[0].length + 3;
  console.log(frames.map(f => f[0].padEnd(w)).join(''));
  for (let r = 0; r < m.map.length; r++) console.log(frames.map(f => (f[1][r] + ' |').padEnd(w)).join(''));
  console.log(frames.map(f => f[2]).join('  →  ') + '\n');
}
