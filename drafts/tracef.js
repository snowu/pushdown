// node trace.js n  — print every frame of the solver's solution, side by side.
import { solve, step, toGrid, toLines } from '../engine.js';
import { LEVELS } from './finale.js';
const lvl = LEVELS[Number(process.argv[2])];
const res = solve(lvl.map, { maxStates: 4_000_000 });
if (!res.solved) { console.log('no solution'); process.exit(1); }
let g = toGrid(lvl.map);
const frames = [['start', toLines(g)]];
for (const m of res.moves) { g = step(g, m).grid; frames.push([m, toLines(g)]); }
const per = Math.max(1, Math.floor(160 / (g[0].length + 3)));
for (let i = 0; i < frames.length; i += per) {
  const chunk = frames.slice(i, i + per);
  console.log(chunk.map(([m]) => m.padEnd(g[0].length + 3)).join(''));
  for (let r = 0; r < g.length; r++) console.log(chunk.map(([, f]) => f[r] + ' | ').join(''));
  console.log();
}
