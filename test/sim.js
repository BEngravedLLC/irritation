// Bot-only games at full speed: checks nothing gets stuck and no marbles are lost or doubled up.
const K = require('../public/core.js');
function play(n, jumpStart, teams) {
  return new Promise((resolve, reject) => {
    const room = new K.Room('TEST', { send() {}, all(ev, e) { if (ev === 'fx') check(e); } }, { speed: 0 });
    let moves = 0, bumps = 0, helps = 0;
    function check(e) {
      if (e.k !== 'move' && e.k !== 'win') return;
      if (e.k === 'move') { moves++; if (e.bump) bumps++; if (e.oid !== e.pid) helps++; }
      const seen = new Set();
      for (const p of room.players) {
        if (p.marbles.length !== 4) return reject(new Error('marble count'));
        for (const x of p.marbles) {
          if (x === K.BASE) continue;
          const key = x >= K.HOME0 ? p.id + ':' + x : 't' + x;
          if (seen.has(key)) return reject(new Error('two marbles on ' + key));
          if (!(x >= 0 && x <= K.CENTER) && !(x >= K.HOME0 && x <= K.HOME0 + 3)) return reject(new Error('bad pos ' + x));
          seen.add(key);
        }
      }
      if (e.k === 'win') {
        clearTimeout(guard);
        const win = room.players.filter((p) => room.winners.includes(p.id));
        if (!win.length || !win.every(K.isDone)) return reject(new Error('winner without everything home'));
        if (teams && !room.players.filter((p) => p.team === room.winTeam).every((p) => room.winners.includes(p.id))) return reject(new Error('team winner list wrong'));
        resolve({ turns: room.turnNo, moves, bumps, helps }); room.close();
      }
    }
    for (let i = 0; i < n; i++) room.addBot();
    room.settings.jumpStart = jumpStart; room.settings.teams = !!teams;
    if (teams) room.players.forEach((p, i) => { p.team = (i % teams) + 1; });
    const guard = setTimeout(() => reject(new Error('game stuck: ' + JSON.stringify(room.view(null)).slice(0, 600))), 30000);
    const why = room.start(); if (why) reject(new Error('could not start: ' + why));
  });
}
(async () => {
  const N = +process.env.GAMES || 6;
  const plans = [[2, true, 0], [3, true, 0], [4, true, 0], [6, true, 0], [2, false, 0], [4, false, 0], [4, true, 2], [6, true, 2], [6, true, 3], [5, true, 2], [4, false, 2], [3, true, 3]];
  for (const [n, js, teams] of plans) {
    let t = 0, b = 0, h = 0;
    for (let g = 0; g < N; g++) { const r = await play(n, js, teams); t += r.turns; b += r.bumps; h += r.helps; }
    console.log(`${js ? 'jump-start' : 'classic   '} ${n} players${teams ? `, ${teams} teams` : ''}: ${N} games ok, avg ${Math.round(t / N)} turns, ${(b / N).toFixed(1)} bumps${teams ? `, ${(h / N).toFixed(1)} helping moves` : ''}`);
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
