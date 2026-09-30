// Par for a level: the solver's proven optimum when it can find one, else the
// length of the level's hand-written solution (verified by replay), unproven.
import { solve, replay } from './engine.js';

export function par(lvl, maxStates = 4_000_000) {
  // A level with a hand-written solution is one we already know is deep; don't
  // spend minutes failing to prove its par.
  const res = solve(lvl.map, { maxStates: lvl.solution ? Math.min(maxStates, 600_000) : maxStates });
  if (res.solved) return { par: res.moves.length, proven: true, moves: res.moves, explored: res.explored };
  if (lvl.solution) {
    const r = replay(lvl.map, lvl.solution);
    if (r.won) return { par: r.at, proven: false, explored: res.explored };
    throw new Error(`"${lvl.title}": the hand-written solution does not win`);
  }
  return { par: null, proven: false, explored: res.explored, exhausted: res.exhausted };
}
