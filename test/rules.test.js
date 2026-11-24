const assert = require('assert');
const K = require('../public/core.js');
const { BASE, CENTER, HOME0 } = K;
const mk = (arms, teams) => arms.map((arm, i) => ({ arm, team: teams ? teams[i] : 1, marbles: [BASE, BASE, BASE, BASE], fresh: [false, false, false, false] }));
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
// classic start: comes out on the middle spot, pad is 7 away
ps = mk([0, 3]); assert.strictEqual(K.legalMoves(ps, 0, 6, C)[0].to, 0);
ps[0].marbles[0] = 0; ps[0].fresh[0] = true; assert.ok(!K.legalMoves(ps, 0, 6, C).some((m) => K.isStar(m.to)));
assert.strictEqual(K.legalMoves(ps, 0, 3, C).find((m) => m.m === 0).to, 3, 'a marble fresh out on the middle spot heads off on its lap');
// other arms
ps = mk([2, 5]); assert.strictEqual(K.legalMoves(ps, 0, 1, J)[0].to, 30); assert.strictEqual(K.legalMoves(ps, 1, 1, C)[0].to, 70);

// 2. Home entry: step onto your own middle spot, then turn up into Home, by exact count
ps = mk([0, 3]); ps[0].marbles[0] = 82;
assert.strictEqual(K.legalMoves(ps, 0, 1, J).find((m) => m.m === 0).to, 83);
mv = K.legalMoves(ps, 0, 2, J).find((m) => m.m === 0);
assert.strictEqual(mv.to, 0, 'the marble lands on the bottom middle spot'); assert.strictEqual(mv.kind, 'track');
assert.strictEqual(K.legalMoves(ps, 0, 3, J).find((m) => m.m === 0).to, HOME0, 'one more step turns up into Home');
assert.deepStrictEqual(K.legalMoves(ps, 0, 3, J).find((m) => m.m === 0).path, [83, 0, HOME0]);
assert.strictEqual(K.legalMoves(ps, 0, 6, J).find((m) => m.m === 0).to, HOME0 + 3);
ps[0].marbles[0] = 83; assert.ok(!K.legalMoves(ps, 0, 6, J).some((m) => m.m === 0), 'overshoot is not allowed');
// sitting on the middle spot after a lap: next stop is Home, never the left side again
ps[0].marbles[0] = 0;
assert.strictEqual(dests(K.legalMoves(ps, 0, 1, J).filter((m) => m.m === 0)), `home:${HOME0}`);
assert.strictEqual(K.legalMoves(ps, 0, 4, J).find((m) => m.m === 0).to, HOME0 + 3);
assert.ok(!K.legalMoves(ps, 0, 5, J).some((m) => m.m === 0));
// classic start laps all the way back onto the middle spot too
ps = mk([0, 3]); ps[0].marbles[0] = 83; assert.strictEqual(K.legalMoves(ps, 0, 2, C).find((m) => m.m === 0).to, HOME0);
// an opponent on my middle spot gets bumped by my homecoming marble, and passes straight through otherwise
ps = mk([0, 3]); ps[0].marbles[0] = 82; ps[1].marbles[1] = 0;
assert.deepStrictEqual(K.legalMoves(ps, 0, 2, J).find((m) => m.m === 0).bump, { p: 1, m: 1 });
ps[1].marbles[0] = 82; ps[0].marbles[0] = BASE; ps[1].marbles[1] = BASE;
assert.strictEqual(K.legalMoves(ps, 1, 4, J).find((m) => m.m === 0).to, 2);
// own marble in home blocks jumping
ps = mk([0, 3]); ps[0].marbles[0] = HOME0 + 1; ps[0].marbles[1] = 0;
assert.strictEqual(dests(K.legalMoves(ps, 0, 1, J).filter((m) => m.m === 1)), `home:${HOME0}`);
assert.strictEqual(K.legalMoves(ps, 0, 2, J).filter((m) => m.m === 1).length, 0);
assert.strictEqual(K.legalMoves(ps, 0, 2, J).find((m) => m.m === 0).to, HOME0 + 3);

// 3. Shortcut ring
ps = mk([0, 3]); ps[0].marbles[0] = 7;
mv = K.legalMoves(ps, 0, 5, J).filter((m) => m.m === 0);
assert.ok(mv.some((m) => m.kind === 'ring' && m.to === 77), 'five pad hops reach the home-side pad');
assert.ok(mv.some((m) => m.kind === 'track' && m.to === 12));
assert.ok(K.legalMoves(ps, 0, 6, J).some((m) => m.kind === 'ring' && m.to === 78));
assert.strictEqual(K.homeStar(0), 77);
// from the home-side pad: 7 to the middle spot, 8 to the first home hole
ps[0].marbles[0] = 78; assert.strictEqual(K.legalMoves(ps, 0, 6, J).find((m) => m.kind === 'track').to, 0);
ps[0].marbles[0] = 79; assert.strictEqual(K.legalMoves(ps, 0, 6, J).find((m) => m.kind === 'home').to, HOME0);
ps[0].marbles[0] = 5; assert.ok(!K.legalMoves(ps, 0, 4, J).some((m) => m.kind === 'ring'), 'passing over a pad does not open the ring');
// center: in by exact count, out only with a 1, onto any pad
ps[0].marbles[0] = 5; assert.ok(K.legalMoves(ps, 0, 3, J).some((m) => m.kind === 'center' && m.to === CENTER));
ps[0].marbles[0] = 7; assert.ok(K.legalMoves(ps, 0, 1, J).some((m) => m.kind === 'center'));
assert.ok(!K.legalMoves(ps, 0, 2, J).some((m) => m.kind === 'center'), 'from a pad only a 1 enters the center');
ps[0].marbles[0] = CENTER;
assert.strictEqual(K.legalMoves(ps, 0, 1, J).filter((m) => m.kind === 'exit').length, 6);
assert.strictEqual(K.legalMoves(ps, 0, 4, J).filter((m) => m.m === 0).length, 0);

// 4. Bumping + blocking
ps = mk([0, 3]); ps[0].marbles[0] = 10; ps[1].marbles[2] = 13;
assert.deepStrictEqual(K.legalMoves(ps, 0, 3, J).find((m) => m.m === 0).bump, { p: 1, m: 2 });
assert.strictEqual(K.legalMoves(ps, 0, 4, J).find((m) => m.m === 0).bump, null, 'jumping over an opponent is fine');
ps[0].marbles[1] = 12; assert.ok(!K.legalMoves(ps, 0, 3, J).some((m) => m.m === 0), 'cannot jump own marble');
ps = mk([0, 3]); ps[1].marbles[0] = 2; assert.deepStrictEqual(K.legalMoves(ps, 0, 6, J)[0].bump, { p: 1, m: 0 }, 'coming out bumps a squatter');
ps = mk([0, 3]); ps[0].marbles[0] = 2; assert.strictEqual(K.legalMoves(ps, 0, 6, J).filter((m) => m.kind === 'out').length, 0, 'entry blocked by own marble');

// 5. Teams: players 0 and 2 are Team 1, players 1 and 3 are Team 2
const T = { jumpStart: true, teams: true };
ps = mk([0, 1, 3, 4], [1, 2, 1, 2]);
const allHome = [HOME0, HOME0 + 1, HOME0 + 2, HOME0 + 3];
// while you still have marbles to bring home you only move your own
ps[0].marbles = [10, BASE, BASE, BASE]; ps[2].marbles = [50, BASE, BASE, BASE];
assert.ok(K.legalMoves(ps, 0, 3, T).every((m) => m.o === 0));
// teammates still bump each other when a move lands on them
ps[2].marbles[0] = 13; assert.deepStrictEqual(K.legalMoves(ps, 0, 3, T).find((m) => m.m === 0).bump, { p: 2, m: 0 });
// all four home: your roll moves a teammate's marble that is already out...
ps[0].marbles = allHome.slice(); ps[2].marbles = [50, BASE, BASE, BASE];
mv = K.legalMoves(ps, 0, 4, T);
assert.strictEqual(mv.length, 1); assert.strictEqual(mv[0].o, 2); assert.strictEqual(mv[0].to, 54);
// ...but never brings one out of their base, even with a 1 or 6
assert.ok(!K.legalMoves(ps, 0, 6, T).some((m) => m.kind === 'out'));
assert.ok(!K.legalMoves(ps, 0, 1, T).some((m) => m.kind === 'out'));
// the helped marble follows its owner's path home (arm 3's middle spot is 42)
ps[2].marbles = [41, BASE, BASE, BASE];
assert.strictEqual(K.legalMoves(ps, 0, 2, T)[0].to, HOME0);
// no teammate marble out of base = no turn; a teammate marble out = a turn; never helps the other team
ps[2].marbles = [BASE, BASE, BASE, BASE]; ps[1].marbles = [20, BASE, BASE, BASE];
assert.strictEqual(K.canHelp(ps, 0, T), false); assert.strictEqual(K.legalMoves(ps, 0, 3, T).length, 0);
ps[2].marbles = [30, BASE, BASE, BASE]; assert.strictEqual(K.canHelp(ps, 0, T), true);
// without teams, finishing ends the game instead, so nobody ever helps
assert.ok(K.legalMoves(ps, 0, 3, J).every((m) => m.o === 0));
console.log('rules ok');
