// pushdown engine — the level is the program.
//
// The world is a grid of characters. Any horizontal run of non-space
// characters shaped like `key=value` (with a known key) is a live rule, and
// its characters become inert *text*: pushable, but with no other properties.
// A sentence starts at its keyword and its value runs to the end of the run,
// so junk before `you=` is ignored but anything touching the end joins in.
// Every other character is an *object*, and gets its properties from the
// rules: `you=@` means every loose @ is controlled by the player.
//
// Rules are re-read after every move, so pushing letters rewrites physics.

export const KEYS = ['you', 'win', 'stop', 'kill'];
const STATEMENT = new RegExp(`(${KEYS.join('|')})=(\\S+)$`);
export const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

export function toGrid(lines) {
  const w = Math.max(...lines.map(l => l.length));
  return lines.map(l => l.padEnd(w, ' ').split(''));
}
export const toLines = grid => grid.map(r => r.join(''));
export const key = grid => grid.map(r => r.join('')).join('\n');

// Find every statement. Returns the rule sets plus a map of which cells are text.
export function parse(grid) {
  const rules = Object.fromEntries(KEYS.map(k => [k, new Set()]));
  const text = grid.map(r => r.map(() => null)); // null | key name
  const statements = [];
  grid.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (row[c] === ' ') { c++; continue; }
      const start = c;
      while (c < row.length && row[c] !== ' ') c++;
      const run = row.slice(start, c).join('');
      const m = run.match(STATEMENT);
      if (m) {
        const from = start + m.index;
        for (const ch of m[2]) rules[m[1]].add(ch);
        for (let i = from; i < c; i++) text[r][i] = m[1];
        statements.push({ r, c: from, len: c - from, key: m[1], value: m[2] });
      }
    }
  });
  return { rules, text, statements };
}

// What an object cell *is* under the current rules.
function props(ch, isText, rules) {
  if (ch === ' ' || isText) return {};
  return {
    you: rules.you.has(ch), win: rules.win.has(ch),
    stop: rules.stop.has(ch), kill: rules.kill.has(ch),
  };
}

export function youCells(grid, parsed = parse(grid)) {
  const out = [];
  grid.forEach((row, r) => row.forEach((ch, c) => {
    if (props(ch, parsed.text[r][c], parsed.rules).you) out.push([r, c]);
  }));
  return out;
}

// Advance one move. Returns { grid, won, moved, events }.
// Pass `ids` (a grid of per-cell identities) to get them back rearranged as
// `res.ids`, so a renderer can animate each block to its new home.
export function step(grid, dir, ids = null) {
  const [dr, dc] = DIRS[dir];
  const H = grid.length, W = grid[0].length;
  const parsed = parse(grid);
  // Cells carry their properties with them for the duration of this move.
  const cells = grid.map((row, r) => row.map((ch, c) =>
    ch === ' ' ? null : { ch, id: ids?.[r][c], ...props(ch, parsed.text[r][c], parsed.rules), text: !!parsed.text[r][c] }));
  const inside = (r, c) => r >= 0 && c >= 0 && r < H && c < W;
  const pushable = o => o.text || !(o.stop || o.win || o.kill);

  // Leading cells move first so a line of yous travels together.
  const yous = youCells(grid, parsed)
    .sort((a, b) => (b[0] - a[0]) * dr + (b[1] - a[1]) * dc)
    .map(([r, c]) => cells[r][c]);

  let won = false, moved = false;
  const events = [];
  const find = o => { for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (cells[r][c] === o) return [r, c]; };

  for (const me of yous) {
    const pos = find(me);
    if (!pos) continue;
    const [r, c] = pos, tr = r + dr, tc = c + dc;
    if (!inside(tr, tc)) continue;
    const t = cells[tr][tc];
    if (t && !t.text && t.win) { won = true; continue; }
    if (t && !t.text && t.kill) { cells[r][c] = null; moved = true; events.push('died'); continue; }
    // Walk the push chain.
    let er = tr, ec = tc, ok = true;
    while (inside(er, ec) && cells[er][ec]) {
      if (!pushable(cells[er][ec])) { ok = false; break; }
      er += dr; ec += dc;
    }
    if (!ok || !inside(er, ec)) continue;
    while (er !== r || ec !== c) {
      cells[er][ec] = cells[er - dr][ec - dc];
      er -= dr; ec -= dc;
    }
    cells[r][c] = null;
    moved = true;
  }

  const next = cells.map(row => row.map(o => (o ? o.ch : ' ')));
  // Being both you and win at once is also victory.
  const after = parse(next);
  for (const [r, c] of youCells(next, after)) if (after.rules.win.has(next[r][c])) won = true;
  return { grid: next, won, moved, events, ids: ids && cells.map(row => row.map(o => (o ? o.id : null))) };
}

// Breadth-first solver, used to verify levels and find par.
export function solve(lines, { maxStates = 400_000 } = {}) {
  const startKey = key(toGrid(lines));
  const seen = new Map([[startKey, null]]);
  let frontier = [startKey];
  while (frontier.length && seen.size < maxStates) {
    const nextFrontier = [];
    for (const k of frontier) {
      const g = k.split('\n').map(r => r.split(''));
      for (const d of Object.keys(DIRS)) {
        const res = step(g, d);
        if (res.won) {
          const path = [d];
          for (let p = k; seen.get(p); p = seen.get(p).from) path.unshift(seen.get(p).dir);
          return { solved: true, moves: path, explored: seen.size };
        }
        if (!res.moved) continue;
        const nk = key(res.grid);
        if (seen.has(nk)) continue;
        seen.set(nk, { from: k, dir: d });
        nextFrontier.push(nk);
      }
    }
    frontier = nextFrontier;
  }
  return { solved: false, explored: seen.size, exhausted: frontier.length === 0 };
}
