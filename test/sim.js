// Bot-only games at full speed: checks nothing gets stuck and no marbles are lost or doubled up.
const K = require('../public/core.js');
function play(n, jumpStart) {
  return new Promise((resolve, reject) => {
    const room = new K.Room('TEST', { send() {}, all(ev, e) { if (ev === 'fx') check(e); } }, { speed: 0 });
    let moves = 0, bumps = 0;
    function check(e) {
      if (e.k !== 'move' && e.k !== 'win') return;
      moves++; if (e.bump) bumps++;
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
      if (e.k === 'win') { clearTimeout(guard); resolve({ turns: room.turnNo, moves, bumps, shortcuts: room.players.reduce((a, p) => a + p.stats.shortcuts, 0) }); room.close(); }
    }
    for (let i = 0; i < n; i++) room.addBot();
    room.settings.jumpStart = jumpStart;
    room.state = 'lobby';
    const guard = setTimeout(() => reject(new Error('game stuck: ' + JSON.stringify(room.view(null)).slice(0, 400))), 20000);
    if (!room.start()) reject(new Error('could not start'));
  });
}
(async () => {
  for (const js of [true, false]) {
    for (let n = 2; n <= 6; n++) {
      const N = +process.env.GAMES || 8; let t = 0, b = 0, s = 0;
      for (let g = 0; g < N; g++) { const r = await play(n, js); t += r.turns; b += r.bumps; s += r.shortcuts; }
      console.log(`${js ? 'jump-start' : 'classic   '} ${n} players: ${N} games ok, avg ${Math.round(t / N)} turns, ${(b / N).toFixed(1)} bumps, ${(s / N).toFixed(1)} shortcut runs`);
    }
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
