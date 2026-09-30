// node build.js — verify every level with the solver, then inline everything
// into a single self-contained pushdown.html you can just double-click.
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS } from './levels.js';
import { par } from './par.js';

const pars = LEVELS.map((lvl, i) => {
  const res = par(lvl);
  if (!res.par) throw new Error(`level ${i} "${lvl.title}" is not solvable`);
  return res.proven ? res.par : -res.par; // negative: an unproven upper bound
});

const fonts = JSON.parse(readFileSync('fonts/fonts.json', 'utf8')).map(([family, style, weight, file]) =>
  `@font-face { font-family: '${family}'; font-style: ${style}; font-weight: ${weight}; font-display: swap;
  src: url(data:font/woff2;base64,${readFileSync('fonts/' + file).toString('base64')}) format('woff2'); }`).join('\n');

const strip = src => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const html = readFileSync('src/game.html', 'utf8')
  .replace('/*__FONTS__*/', () => fonts)
  .replace('/*__ENGINE__*/', () => strip(readFileSync('engine.js', 'utf8')))
  .replace('/*__LEVELS__*/', () => strip(readFileSync('levels.js', 'utf8')))
  .replace('/*__PARS__*/[]', JSON.stringify(pars));
writeFileSync('pushdown.html', html);
console.log(`built pushdown.html — ${LEVELS.length} levels, pars ${pars.map(p => (p < 0 ? '≤' + -p : p)).join(' ')}`);
