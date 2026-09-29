// pushdown engine — the level is the program.
//
// The world is a grid of characters. Read left to right, any `key=value`
// with a known key is a live sentence, and its characters become inert
// *text*: pushable, but with no other properties. Every other character is
// an *object*, and gets its properties from the sentences: `you=@` means
// every loose @ is controlled by the player.
//
// A sentence starts at its key and its value runs until the next space or
// the next `key=`, so junk before a key is ignored, sentences can be chained
// (`you=@win=$`), and anything touching the end of a value joins it.
//
// Sentences are re-read after every move, so pushing letters rewrites physics.

export const KEYS = ['you', 'win', 'stop', 'kill'];
const KEYWORD = new RegExp(`(${KEYS.join('|')})=`, 'g');
export const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

export function toGrid(lines) {
  const w = Math.max(...lines.map(l => l.length));
  return lines.map(l => l.padEnd(w, ' ').split(''));
}
export const toLines = grid => grid.map(r => r.join(''));
export const key = grid => grid.map(r => r.join('')).join('\n');

// Find every sentence. Returns the rule sets plus a map of which cells are text.
export function parse(grid) {
  const rules = Object.fromEntries(KEYS.map(k => [k, new Set()]));
  const text = grid.map(r => new Array(r.length).fill(null)); // null | key name
  const statements = [];
  grid.forEach((row, r) => {
    if (!row.includes('=')) return; // no sentence without an equals sign
    const line = row.join('');
    for (const run of line.matchAll(/\S+/g)) {
      const keys = [...run[0].matchAll(KEYWORD)];
      keys.forEach((m, i) => {
        const from = m.index + m[0].length;
        const to = i + 1 < keys.length ? keys[i + 1].index : run[0].length;
        if (to <= from) return; // `key=` with nothing after it says nothing
        const value = run[0].slice(from, to), c = run.index + m.index;
        for (const ch of value) rules[m[1]].add(ch);
        for (let i = c; i < run.index + to; i++) text[r][i] = m[1];
        statements.push({ r, c, len: run.index + to - c, key: m[1], value });
      });
    }
  });
  return { rules, text, statements };
}

export function youCells(grid, parsed = parse(grid)) {
  const out = [];
  grid.forEach((row, r) => row.forEach((ch, c) => {
    if (ch !== ' ' && !parsed.text[r][c] && parsed.rules.you.has(ch)) out.push([r, c]);
  }));
  return out;
}
// The yous that can actually move: solid things stay put, even if they're you.
const movers = (grid, parsed) => youCells(grid, parsed).filter(([r, c]) => !parsed.rules.stop.has(grid[r][c]));

// Advance one move. Returns { grid, won, moved, events }.
// Pass `ids` (a grid of per-cell identities) to get them back rearranged as
// `res.ids`, so a renderer can animate each block to its new home.
export function step(grid, dir, ids = null, parsed = parse(grid)) {
  const [dr, dc] = DIRS[dir];
  const H = grid.length, W = grid[0].length;
  const { rules } = parsed;
  // Three parallel layers that travel together: the character, whether it
  // was text when the move began, and (optionally) its identity.
  const ch = grid.map(row => row.slice());
  const isText = parsed.text.map(row => row.map(t => !!t));
  const id = ids && ids.map(row => row.slice());
  const inside = (r, c) => r >= 0 && c >= 0 && r < H && c < W;
  const obj = (r, c, k) => ch[r][c] !== ' ' && !isText[r][c] && rules[k].has(ch[r][c]);
  const pushable = (r, c) => isText[r][c] || !(rules.stop.has(ch[r][c]) || rules.win.has(ch[r][c]) || rules.kill.has(ch[r][c]));

  // Leading yous move first so a line of them travels together. A you only
  // ever pushes cells ahead of it, which have already moved, so each you is
  // still where it started when its turn comes.
  const yous = movers(grid, parsed).sort((a, b) => (b[0] - a[0]) * dr + (b[1] - a[1]) * dc);

  let won = false, moved = false;
  const events = [];
  for (const [r, c] of yous) {
    const tr = r + dr, tc = c + dc;
    if (!inside(tr, tc)) continue;
    if (obj(tr, tc, 'win')) { won = true; continue; }
    if (obj(tr, tc, 'kill')) {
      ch[r][c] = ' '; isText[r][c] = false; if (id) id[r][c] = null;
      moved = true; events.push('died'); continue;
    }
    // Walk the push chain to the first empty cell.
    let er = tr, ec = tc, ok = true;
    while (inside(er, ec) && ch[er][ec] !== ' ') {
      if (!pushable(er, ec)) { ok = false; break; }
      er += dr; ec += dc;
    }
    if (!ok || !inside(er, ec)) continue;
    if (er !== tr || ec !== tc) events.push('push');
    while (er !== r || ec !== c) {
      const pr = er - dr, pc = ec - dc;
      ch[er][ec] = ch[pr][pc]; isText[er][ec] = isText[pr][pc]; if (id) id[er][ec] = id[pr][pc];
      er = pr; ec = pc;
    }
    ch[r][c] = ' '; isText[r][c] = false; if (id) id[r][c] = null;
    moved = true;
  }

  // Being both you and win at once is also victory.
  const after = parse(ch);
  for (const [r, c] of youCells(ch, after)) if (after.rules.win.has(ch[r][c])) won = true;
  return { grid: ch, won, moved, events, ids: id, parsed: after };
}

// Breadth-first solver, used to verify levels and find par.
export function solve(lines, { maxStates = 400_000 } = {}) {
  const startKey = key(toGrid(lines));
  const seen = new Map([[startKey, null]]);
  const parses = new Map();
  let frontier = [startKey];
  while (frontier.length && seen.size < maxStates) {
    const nextFrontier = [];
    for (const k of frontier) {
      const g = k.split('\n').map(r => r.split(''));
      const parsed = parses.get(k) ?? parse(g);
      parses.delete(k);
      for (const d of Object.keys(DIRS)) {
        const res = step(g, d, null, parsed);
        if (res.won) {
          const path = [d];
          for (let p = k; seen.get(p); p = seen.get(p).from) path.unshift(seen.get(p).dir);
          return { solved: true, moves: path, explored: seen.size };
        }
        if (!res.moved) continue;
        const nk = key(res.grid);
        if (seen.has(nk)) continue;
        seen.set(nk, { from: k, dir: d });
        parses.set(nk, res.parsed);
        nextFrontier.push(nk);
      }
    }
    frontier = nextFrontier;
  }
  return { solved: false, explored: seen.size, exhausted: frontier.length === 0 };
}
