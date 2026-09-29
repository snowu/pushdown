import { solve } from '../engine.js';
const variants = {
  a: ['#########','#       #','#       #','# wni =##','#   @   #','#########','','you=@ stop=#'],
  b: ['########','#      #','#      #','#wni =##','#  @   #','########','','you=@ stop=#'],
  c: ['#########','#       #','# wni =##','#   @   #','#       #','#########','','you=@ stop=#'],
};
for (const [k, v] of Object.entries(variants)) {
  const t = performance.now(); const r = solve(v, { maxStates: 1_500_000 });
  console.log(k, r.solved ? 'par ' + r.moves.length : (r.exhausted ? 'UNSOLVABLE' : 'gave up'), r.explored, ((performance.now() - t) / 1000).toFixed(1) + 's');
}
