// node check.js [n]  — solve every level (or just level n) and report par.
import { solve, step, toGrid, toLines } from './engine.js';
import { LEVELS } from './levels.js';

const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const only = nums.length ? nums[0] : null;
const verbose = process.argv.includes('-v');
let bad = 0;
LEVELS.forEach((lvl, i) => {
  if (only != null && i !== only) return;
  const t = performance.now();
  const res = solve(lvl.map);
  const ms = (performance.now() - t).toFixed(0);
  const status = res.solved ? `par ${String(res.moves.length).padStart(3)}` : (res.exhausted ? 'UNSOLVABLE' : 'GAVE UP  ');
  if (!res.solved) bad++;
  console.log(`${String(i).padStart(2)} ${lvl.title.padEnd(22)} ${status}  ${String(res.explored).padStart(8)} states ${ms}ms`);
  if (res.solved && verbose) {
    console.log('   ' + res.moves.map(m => ({ up: '↑', down: '↓', left: '←', right: '→' })[m]).join(''));
    let g = toGrid(lvl.map);
    for (const m of res.moves) g = step(g, m).grid;
    console.log(toLines(g).map(l => '   |' + l).join('\n'));
  }
});
process.exit(bad ? 1 : 0);
