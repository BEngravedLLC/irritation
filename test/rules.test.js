const assert = require('assert');
const K = require('../public/core.js');
const { BASE, CENTER, HOME0 } = K;
const mk = (arms) => arms.map((arm) => ({ arm, marbles: [BASE, BASE, BASE, BASE] }));
const J = { jumpStart: true }, C = { jumpStart: false };
const dests = (mv) => mv.map((m) => `${m.kind}:${m.to}`).sort().join(' ');

// 1. Jump Start: come out two spaces ahead, then a 5 lands on the shortcut pad
let ps = mk([0, 3]);
let mv = K.legalMoves(ps, 0, 6, J);
assert.strictEqual(mv.length, 1); assert.strictEqual(mv[0].to, 2);
assert.strictEqual(K.legalMoves(ps, 0, 3, J).length, 0, 'only 1 or 6 gets out');
assert.strictEqual(K.legalMoves(ps, 0, 1, J)[0].to, 2);
ps[0].marbles[0] = 2;
mv = K.legalMoves(ps, 0, 5, J);
assert.ok(mv.some((m) => m.m === 0 && m.to === 7 && K.isStar(m.to)), 'roll 5 from jump start reaches the pad');
assert.ok(K.legalMoves(ps, 0, 6, J).some((m) => m.kind === 'center'), '6 from jump start can dive into the center');
// classic start: comes out on the middle hole, pad is 7 away
ps = mk([0, 3]); assert.strictEqual(K.legalMoves(ps, 0, 6, C)[0].to, 0);
ps[0].marbles[0] = 0; assert.ok(!K.legalMoves(ps, 0, 6, C).some((m) => K.isStar(m.to)));
// other arms
ps = mk([2, 5]); assert.strictEqual(K.legalMoves(ps, 0, 1, J)[0].to, 30); assert.strictEqual(K.legalMoves(ps, 1, 1, C)[0].to, 70);

// 2. Home entry: turn in from the space just before your own start, exact count
ps = mk([0, 3]); ps[0].marbles[0] = 82;
assert.strictEqual(K.legalMoves(ps, 0, 1, J).find((m) => m.m === 0).to, 83);
assert.strictEqual(K.legalMoves(ps, 0, 2, J).find((m) => m.m === 0).to, HOME0);
assert.strictEqual(K.legalMoves(ps, 0, 5, J).find((m) => m.m === 0).to, HOME0 + 3);
assert.ok(!K.legalMoves(ps, 0, 6, J).some((m) => m.m === 0), 'overshoot is not allowed');
// opponent passes straight through arm 0's home turn
ps[1].marbles[0] = 82; ps[0].marbles[0] = BASE;
assert.strictEqual(K.legalMoves(ps, 1, 4, J).find((m) => m.m === 0).to, 2);
// own marble in home blocks jumping
ps = mk([0, 3]); ps[0].marbles[0] = HOME0 + 1; ps[0].marbles[1] = 83;
assert.strictEqual(dests(K.legalMoves(ps, 0, 1, J).filter((m) => m.m === 1)), `home:${HOME0}`);
assert.strictEqual(K.legalMoves(ps, 0, 2, J).filter((m) => m.m === 1).length, 0);
assert.strictEqual(K.legalMoves(ps, 0, 2, J).find((m) => m.m === 0).to, HOME0 + 3);

// 3. Shortcut ring
ps = mk([0, 3]); ps[0].marbles[0] = 7;
mv = K.legalMoves(ps, 0, 5, J).filter((m) => m.m === 0);
assert.ok(mv.some((m) => m.kind === 'ring' && m.to === 77), 'five pad hops reach the home-side pad');
assert.ok(mv.some((m) => m.kind === 'track' && m.to === 12));
mv = K.legalMoves(ps, 0, 6, J).filter((m) => m.m === 0);
assert.ok(mv.some((m) => m.kind === 'ring' && m.to === 78));
assert.strictEqual(K.homeStar(0), 77);
// from the home-side pad it is 7 to the first home hole
ps[0].marbles[0] = 77; assert.ok(!K.legalMoves(ps, 0, 6, J).some((m) => m.to >= HOME0 && m.kind === 'track'));
ps[0].marbles[0] = 78; assert.strictEqual(K.legalMoves(ps, 0, 6, J).find((m) => m.kind === 'home').to, HOME0);
// a marble passing over a pad may not use the ring
ps[0].marbles[0] = 5; assert.ok(!K.legalMoves(ps, 0, 4, J).some((m) => m.kind === 'ring'));
// center: in by exact count, out only with a 1, onto any pad
ps[0].marbles[0] = 5; assert.ok(K.legalMoves(ps, 0, 3, J).some((m) => m.kind === 'center' && m.to === CENTER));
ps[0].marbles[0] = 7; assert.ok(K.legalMoves(ps, 0, 1, J).some((m) => m.kind === 'center'));
assert.ok(!K.legalMoves(ps, 0, 2, J).some((m) => m.kind === 'center'), 'from a pad only a 1 enters the center');
ps[0].marbles[0] = CENTER;
assert.strictEqual(K.legalMoves(ps, 0, 1, J).filter((m) => m.kind === 'exit').length, 6);
assert.strictEqual(K.legalMoves(ps, 0, 4, J).filter((m) => m.m === 0).length, 0);

// 4. Bumping + blocking
ps = mk([0, 3]); ps[0].marbles[0] = 10; ps[1].marbles[2] = 13;
mv = K.legalMoves(ps, 0, 3, J).find((m) => m.m === 0);
assert.deepStrictEqual(mv.bump, { p: 1, m: 2 });
assert.strictEqual(K.legalMoves(ps, 0, 4, J).find((m) => m.m === 0).bump, null, 'jumping over an opponent is fine');
ps[0].marbles[1] = 12; assert.ok(!K.legalMoves(ps, 0, 3, J).some((m) => m.m === 0), 'cannot jump own marble');
ps = mk([0, 3]); ps[1].marbles[0] = 2; assert.deepStrictEqual(K.legalMoves(ps, 0, 6, J)[0].bump, { p: 1, m: 0 }, 'coming out bumps a squatter');
ps = mk([0, 3]); ps[0].marbles[0] = 2; assert.strictEqual(K.legalMoves(ps, 0, 6, J).filter((m) => m.kind === 'out').length, 0, 'entry blocked by own marble');
console.log('rules ok');
