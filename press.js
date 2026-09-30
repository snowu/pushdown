// The press: prints small, machine-set, solver-verified puzzles from a seed.
// The same seed always prints the same puzzle, so a puzzle can be shared as
// a number, and there's a new one for every day.
import { parse, step, solve, toGrid, toLines } from './engine.js';

export function rng(seed) { // mulberry32
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// A handful of pieces in a small box. Sentences are placed with a gap on
// both sides so nothing is glued at birth.
export function generateTiny(rand) {
  const pick = a => a[Math.floor(rand() * a.length)];
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

// How many *different* sets of laws does the shortest solution pass through?
// (Breaking a sentence and re-forming the same one isn't a new idea.)
export function lawSets(lines, moves) {
  const laws = g => parse(g).statements.map(s => s.key + '=' + s.value).sort().join(' ');
  let g = toGrid(lines);
  const seen = new Set([laws(g)]);
  for (const m of moves) { g = step(g, m).grid; seen.add(laws(g)); }
  return seen.size;
}

export function evaluateTiny(lines, maxStates = 20_000) {
  const res = solve(lines, { maxStates });
  if (!res.solved || res.moves.length < 7) return null;
  const sets = lawSets(lines, res.moves);
  if (sets < 3) return null;
  const pieces = lines.join('').replace(/ /g, '').length;
  const score = res.moves.length * 2 + sets * 6 - pieces * 1.5;
  return { map: lines, par: res.moves.length, sets, explored: res.explored, score: +score.toFixed(2) };
}

// Run the press from a seed until a board scores at least `minScore`.
export function print(seed, { minScore = 40, maxTries = 20_000, onProgress } = {}) {
  const rand = rng(seed);
  for (let tries = 1; tries <= maxTries; tries++) {
    const lines = generateTiny(rand);
    if (tries % 25 === 0) onProgress?.(tries);
    if (!lines) continue;
    const r = evaluateTiny(lines);
    if (r && r.score >= minScore) return { ...r, seed, tries };
  }
  return null;
}
