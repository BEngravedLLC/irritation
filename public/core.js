// Irritation shared game core: board model, rules, bots and the room/turn logic.
// The same file runs on the server (online rooms) and in the browser (practice / pass-and-play).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ board model
  // 84 track spaces, numbered clockwise. Each arm owns 14: for arm a, base index b = 14a
  //   b+0  middle of the end row (classic start)      b+1 left-mid      b+2 left corner (Jump Start)
  //   b+3..b+6 left column going in                   b+7 shortcut pad between arm a and a+1
  //   b+8..b+11 right column of arm a+1 going out     b+12 right corner  b+13 right-mid of arm a+1
  // After a lap a marble steps onto its own middle spot (b+0) and from there turns up into Home.
  const ARMS = 6, PER = 14, TRACK = ARMS * PER;
  const BASE = -1, CENTER = 84, HOME0 = 100;
  const STARS = [0, 1, 2, 3, 4, 5].map((k) => k * PER + 7);
  const isStar = (i) => i >= 0 && i < TRACK && i % PER === 7;
  const startHole = (arm) => arm * PER;
  const jumpHole = (arm) => arm * PER + 2;
  const entryHole = (arm, settings) => (settings && settings.jumpStart ? jumpHole(arm) : startHole(arm));
  const rel = (arm, i) => (((i - arm * PER) % TRACK) + TRACK) % TRACK;
  const homeStar = (arm) => ((arm + 5) % ARMS) * PER + 7; // shortcut pad on the home side of an arm
  const ARM_LAYOUT = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };

  const COLORS = [
    { id: 'red', name: 'Cherry', hex: '#ff3b4e' },
    { id: 'blue', name: 'Blueberry', hex: '#3d7bff' },
    { id: 'green', name: 'Lime', hex: '#35d65a' },
    { id: 'yellow', name: 'Lemon', hex: '#ffd21f' },
    { id: 'purple', name: 'Grape', hex: '#a259ff' },
    { id: 'orange', name: 'Tangerine', hex: '#ff8a1f' },
    { id: 'pink', name: 'Bubblegum', hex: '#ff5fb8' },
    { id: 'teal', name: 'Aqua', hex: '#18d3c5' },
    { id: 'white', name: 'Pearl', hex: '#f4f1e8' },
    { id: 'black', name: 'Onyx', hex: '#3a3d4d' },
  ];
  const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).hex;

  const PATTERNS = ['solid', 'camo', 'cheetah', 'zebra', 'tiger', 'cow', 'giraffe', 'flames', 'galaxy', 'tiedye', 'checker', 'glitter', 'lava', 'ocean'];
  const REACTIONS = ['😂', '😱', '🔥', '😭', '😈', '👀', '😤', '🙏'];

  // animation budget (ms) the server waits before a bot acts, so screens can keep up
  const T = { roll: 1700, step: 150, ringStep: 230, out: 650, bump: 1150, home: 700, center: 600, nomove: 1300, think: 550 };

  const isDone = (p) => p.marbles.every((x) => x >= HOME0);
  // `fresh` = a marble that just came out onto the middle spot (classic start) and still has its lap to run
  function nextStep(arm, pos, fresh) {
    if (pos >= HOME0) return pos + 1 <= HOME0 + 3 ? pos + 1 : null;
    if (rel(arm, pos) === 0 && !fresh) return HOME0;
    return (pos + 1) % TRACK;
  }
  function walk(arm, pos, n, fresh) {
    const path = [];
    let p = pos;
    for (let s = 0; s < n; s++) {
      p = nextStep(arm, p, fresh && s === 0);
      if (p == null) return null;
      path.push(p);
    }
    return path;
  }

  // Every move the marbles of player `oi` could make with this roll. players[i] = { arm, marbles: [pos x4], fresh?, team? }
  function movesFor(players, oi, roll, settings, allowOut) {
    const me = players[oi], arm = me.arm;
    const own = new Set(), occ = new Map();
    players.forEach((p, i) => p.marbles.forEach((pos, m) => {
      if (pos < 0) return;
      if (i === oi) own.add(pos);
      else if (pos <= CENTER) occ.set(pos, { p: i, m });
    }));
    const moves = [];
    const push = (m, path, kind, extra) => {
      for (const q of path) if (own.has(q)) return; // never land on or jump your own marble
      const to = path[path.length - 1];
      const hit = to <= CENTER ? occ.get(to) : null;
      moves.push(Object.assign({ id: 0, m, o: oi, from: me.marbles[m], to, path, kind, bump: hit ? { p: hit.p, m: hit.m } : null }, extra || {}));
    };
    let outDone = false;
    me.marbles.forEach((pos, m) => {
      const fresh = !!(me.fresh && me.fresh[m]);
      if (pos === BASE) {
        if (allowOut && !outDone && (roll === 1 || roll === 6)) { outDone = true; push(m, [entryHole(arm, settings)], 'out'); }
        return;
      }
      if (pos === CENTER) {
        if (roll === 1) for (const s of STARS) push(m, [s], 'exit');
        return;
      }
      const normal = walk(arm, pos, roll, fresh);
      if (normal) push(m, normal, pos >= HOME0 ? 'inhome' : normal[normal.length - 1] >= HOME0 ? 'home' : 'track');
      if (pos >= HOME0) return;
      // center: exact count, stepping in from a shortcut pad
      const pre = roll === 1 ? [] : walk(arm, pos, roll - 1, fresh);
      if (pre) {
        const last = pre.length ? pre[pre.length - 1] : pos;
        if (isStar(last)) push(m, pre.concat([CENTER]), 'center');
      }
      // shortcut ring: only for a marble that starts its move on a pad
      if (isStar(pos)) {
        for (let k = 1; k <= Math.min(roll, 5); k++) {
          const hops = [];
          for (let j = 1; j <= k; j++) hops.push((pos + PER * j) % TRACK);
          const rest = roll - k ? walk(arm, hops[k - 1], roll - k, false) : [];
          if (rest) push(m, hops.concat(rest), 'ring', { hops: k });
        }
      }
    });
    return moves;
  }
  const sameTeam = (players, a, b, settings) => !!(settings && settings.teams) && a !== b && players[a].team === players[b].team;
  // Teams: once your own four are home you may move a teammate's marbles that are already out (never out of their base).
  function canHelp(players, pi, settings) {
    return players.some((p, j) => sameTeam(players, pi, j, settings) && !isDone(p) &&
      p.marbles.some((x) => (x >= 0 && x <= CENTER) || (x >= HOME0 && x < HOME0 + 3 && !p.marbles.includes(x + 1))));
  }
  // Every legal move for the player whose turn it is. Each move names its owner in `o` (usually the roller).
  function legalMoves(players, pi, roll, settings) {
    let moves = [];
    if (settings && settings.teams && isDone(players[pi])) {
      players.forEach((p, j) => { if (sameTeam(players, pi, j, settings) && !isDone(p)) moves = moves.concat(movesFor(players, j, roll, settings, false)); });
    } else moves = movesFor(players, pi, roll, settings, true);
    moves.forEach((mv, i) => { mv.id = i; });
    return moves;
  }

  // ------------------------------------------------------------------ bots
  function distHome(arm, pos, fresh) {
    if (pos === BASE) return 100;
    if (pos >= HOME0) return 3 - (pos - HOME0);
    if (pos === CENTER) return 8 + 1 + 6 + 4;
    const r = rel(arm, pos);
    let d = r === 0 && !fresh ? 1 : TRACK - r + 1; // steps to the first Home hole, by way of the middle spot
    if (isStar(pos)) {
      const hops = ((((homeStar(arm) - pos) / PER) % ARMS) + ARMS) % ARMS;
      d = Math.min(d, hops + 8);
    }
    return d + 4;
  }
  function threat(players, oi, pos, settings) {
    if (pos < 0 || pos >= HOME0) return 0;
    let t = 0;
    players.forEach((p, i) => {
      if (i === oi || sameTeam(players, oi, i, settings)) return;
      const inBase = p.marbles.some((x) => x === BASE);
      if (inBase && pos === entryHole(p.arm, settings)) t += 0.7;
      p.marbles.forEach((q) => {
        if (q < 0 || q >= HOME0) return;
        if (pos === CENTER) { if (isStar(q)) t += 0.25; return; }
        if (q === CENTER) { if (isStar(pos)) t += 0.25; return; }
        const d = (pos - q + TRACK) % TRACK;
        if (d >= 1 && d <= 6) t += 1;
        else if (isStar(q) && isStar(pos)) t += 0.8;
      });
    });
    return t;
  }
  function botChoose(players, pi, moves, settings) {
    let best = moves[0], bestS = -1e9;
    for (const mv of moves) {
      const o = mv.o == null ? pi : mv.o, owner = players[o], arm = owner.arm;
      let s = distHome(arm, mv.from, !!(owner.fresh && owner.fresh[mv.m])) - distHome(arm, mv.to);
      if (mv.kind === 'out') s = 32;
      if (mv.bump) {
        const v = players[mv.bump.p];
        if (sameTeam(players, pi, mv.bump.p, settings) || sameTeam(players, o, mv.bump.p, settings)) s -= 90; // only bump a teammate when forced
        else s += 42 + (100 - distHome(v.arm, v.marbles[mv.bump.m])) * 0.4;
      }
      if (mv.to >= HOME0) s += 22;
      s -= threat(players, o, mv.to, settings) * 7;
      s += threat(players, o, mv.from, settings) * 5;
      if (isStar(mv.to)) s += 5;
      s += Math.random() * 3;
      if (s > bestS) { bestS = s; best = mv; }
    }
    return best;
  }

  // ------------------------------------------------------------------ room (lobby + turn flow)
  const BOT_NAMES = ['Sir Bumps-a-Lot', 'Marbelous Max', 'Rolly Polly', 'Lady Luck', 'Capt. Knockback', 'Dizzy Dot', 'Grumble', 'Shortcut Sue'];
  const BOT_EMOJI = ['🤖', '🦊', '🐸', '🐼', '🦉', '🐵', '🐯', '🐙'];
  const cleanName = (n) => String(n || '').replace(/[<>]/g, '').trim().slice(0, 16) || 'Player';
  const cleanImg = (a, max) => (typeof a === 'string' && a.startsWith('data:image/') && a.length < (max || 300000) ? a : null);
  const isHex = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  function cleanDie(d) {
    d = d || {};
    return {
      body: isHex(d.body) ? d.body : '#ffffff',
      pip: isHex(d.pip) ? d.pip : '#1d1d28',
      pattern: PATTERNS.includes(d.pattern) ? d.pattern : 'solid',
      decalMode: ['one', 'all'].includes(d.decalMode) ? d.decalMode : 'one',
    };
  }
  let uidN = 0;
  const defaultUid = () => 'p' + (++uidN) + Math.random().toString(36).slice(2, 8);

  class Room {
    // out: { send(pid, event, data), all(event, data) }
    constructor(code, out, opts) {
      opts = opts || {};
      this.code = code; this.out = out;
      this.speed = opts.speed == null ? 1 : opts.speed;
      this.local = !!opts.local;
      this.uid = opts.uid || defaultUid;
      this.rollDie = opts.rollDie || (() => 1 + Math.floor(Math.random() * 6));
      this.players = []; this.hostId = null; this.state = 'lobby';
      this.settings = { jumpStart: true, turnTimer: 0, teams: false };
      this.turn = 0; this.phase = 'roll'; this.roll = 0; this.moves = []; this.turnNo = 0;
      this.log = []; this.chat = []; this.fxSeq = 0; this.timer = null; this.deadline = null; this.animUntil = 0;
      this.winnerId = null; this.winners = []; this.winTeam = null; this.results = null; this.lastBumper = {}; this.lastActive = Date.now(); this.closed = false;
    }
    P(pid) { return this.players.find((p) => p.id === pid); }
    cur() { return this.players[this.turn]; }
    freeColor() { const used = new Set(this.players.map((p) => p.color)); return (COLORS.find((c) => !used.has(c.id)) || COLORS[0]).id; }

    addPlayer(d, flags) {
      d = d || {}; flags = flags || {};
      if (this.players.length >= 6) return null;
      const p = {
        id: this.uid(), token: this.uid() + this.uid(), name: cleanName(d.name), avatar: cleanImg(d.avatar), emoji: typeof d.emoji === 'string' ? d.emoji.slice(0, 4) : null,
        bot: !!flags.bot, connected: true, color: null, arm: 0, team: 1, marbles: [BASE, BASE, BASE, BASE], fresh: [false, false, false, false],
        die: cleanDie(d.die), decal: cleanImg(d.decal, 200000), stats: this.newStats(),
      };
      const want = COLORS.find((c) => c.id === d.color);
      p.color = want && !this.players.some((x) => x.color === want.id) ? want.id : this.freeColor();
      const n1 = this.players.filter((x) => x.team === 1).length, n2 = this.players.filter((x) => x.team === 2).length;
      p.team = n2 < n1 ? 2 : 1; // new arrivals even out Team 1 and Team 2
      this.players.push(p);
      if (!this.hostId && !p.bot) this.hostId = p.id;
      this.layout();
      return p;
    }
    addBot() {
      const used = new Set(this.players.map((p) => p.name));
      const i = this.players.length;
      const name = BOT_NAMES.find((n) => !used.has(n)) || 'Bot ' + (i + 1);
      const pats = ['camo', 'cheetah', 'zebra', 'galaxy', 'flames', 'tiedye', 'cow', 'lava'];
      const p = this.addPlayer({ name, emoji: BOT_EMOJI[BOT_NAMES.indexOf(name) % BOT_EMOJI.length] || '🤖' }, { bot: true });
      if (p) { p.die = cleanDie({ body: colorHex(p.color), pip: p.color === 'white' || p.color === 'yellow' ? '#1d1d28' : '#ffffff', pattern: pats[Math.floor(Math.random() * pats.length)] }); }
      return p;
    }
    removePlayer(pid) {
      const i = this.players.findIndex((p) => p.id === pid);
      if (i < 0) return null;
      const [gone] = this.players.splice(i, 1);
      this.layout();
      return gone;
    }
    newStats() { return { bumps: 0, bumped: 0, sixes: 0, rolls: 0, shortcuts: 0, revenge: 0 }; }
    layout() { if (this.state !== 'lobby') return; const arms = ARM_LAYOUT[Math.max(1, this.players.length)]; this.players.forEach((p, i) => { p.arm = arms[i]; }); }

    logMsg(text, kind) { this.log.push({ text, kind: kind || 'info', ts: Date.now() }); if (this.log.length > 60) this.log.shift(); }
    fx(e, ms) {
      e.seq = ++this.fxSeq;
      this.out.all('fx', e);
      if (ms) this.animUntil = Math.max(this.animUntil, Date.now()) + ms * this.speed;
    }
    view(me) {
      return {
        code: this.code, me: me ? me.id : null, hostId: this.hostId, state: this.state, settings: this.settings, local: this.local,
        players: this.players.map((p) => ({
          id: p.id, name: p.name, emoji: p.emoji, hasAvatar: !!p.avatar, hasDecal: !!p.decal, bot: p.bot, connected: p.connected,
          color: p.color, arm: p.arm, team: p.team, marbles: p.marbles.slice(), fresh: p.fresh.slice(), home: p.marbles.filter((x) => x >= HOME0).length, die: p.die, stats: p.stats,
        })),
        turnId: this.state === 'playing' ? this.cur().id : null, phase: this.phase, roll: this.roll, turnNo: this.turnNo,
        moves: this.state === 'playing' && this.phase === 'move' ? this.moves : [],
        deadline: this.deadline, now: Date.now(), log: this.log.slice(-30), winnerId: this.winnerId, winners: this.winners, winTeam: this.winTeam, results: this.results, fxSeq: this.fxSeq,
      };
    }
    broadcast() {
      if (this.closed) return;
      if (this.local) { this.out.all('state', this.view(this.players.find((p) => !p.bot) || null)); return; }
      for (const p of this.players) if (!p.bot && p.connected) this.out.send(p.id, 'state', this.view(p));
    }
    assets(target) {
      const a = { avatars: {}, decals: {} };
      for (const p of this.players) { a.avatars[p.id] = p.avatar || null; a.decals[p.id] = p.decal || null; }
      if (target) this.out.send(target, 'assets', a); else this.out.all('assets', a);
    }

    // ---- lobby actions
    setProfile(p, d) {
      d = d || {};
      if (d.name) p.name = cleanName(d.name);
      if (d.avatar !== undefined) p.avatar = cleanImg(d.avatar);
      if (d.emoji !== undefined) p.emoji = typeof d.emoji === 'string' ? d.emoji.slice(0, 4) : null;
      if (d.die) p.die = cleanDie(d.die);
      if (d.decal !== undefined) p.decal = cleanImg(d.decal, 200000);
      if (d.team !== undefined) this.setTeam(p, d.team, true);
      if (d.color && this.state === 'lobby' && COLORS.some((c) => c.id === d.color) && !this.players.some((x) => x !== p && x.color === d.color)) p.color = d.color;
      this.assets(); this.broadcast();
    }
    setTeam(p, team, quiet) {
      if (this.state !== 'lobby' || ![1, 2, 3].includes(+team)) return;
      p.team = +team;
      if (!quiet) this.broadcast();
    }
    setSettings(s) {
      if (this.state !== 'lobby' || !s) return;
      if (typeof s.jumpStart === 'boolean') this.settings.jumpStart = s.jumpStart;
      if (typeof s.teams === 'boolean') this.settings.teams = s.teams;
      if ([0, 20, 30, 45, 60].includes(+s.turnTimer)) this.settings.turnTimer = +s.turnTimer;
      this.broadcast();
    }
    // returns null when the game starts, or a short message saying why it can't
    start() {
      if (this.state !== 'lobby') return 'The game has already started.';
      if (this.players.length < 2) return 'Need at least 2 players — add a bot!';
      if (this.settings.teams) {
        const groups = [1, 2, 3].map((t) => this.players.filter((p) => p.team === t)).filter((g) => g.length);
        if (groups.length < 2) return 'Teams is on — put players on at least two different teams.';
        // seat the teams alternately, so partners sit across from each other and turns go team by team
        const order = [];
        for (let i = 0; order.length < this.players.length; i++) groups.forEach((g) => { if (g[i]) order.push(g[i]); });
        this.players = order;
      }
      this.layout();
      this.state = 'playing'; this.winnerId = null; this.winners = []; this.winTeam = null; this.results = null; this.lastBumper = {};
      for (const p of this.players) { p.marbles = [BASE, BASE, BASE, BASE]; p.fresh = [false, false, false, false]; p.stats = this.newStats(); }
      this.turn = Math.floor(Math.random() * this.players.length); this.phase = 'roll'; this.roll = 0; this.moves = []; this.turnNo = 1;
      this.animUntil = Date.now();
      this.logMsg(`🎬 Game on! ${this.cur().name} goes first.`, 'round');
      this.fx({ k: 'start', pid: this.cur().id }, 1400);
      this.schedule(); this.broadcast();
      return null;
    }
    backToLobby() {
      this.clear(); this.state = 'lobby'; this.winnerId = null; this.winners = []; this.winTeam = null; this.results = null;
      for (const p of this.players) { p.marbles = [BASE, BASE, BASE, BASE]; p.fresh = [false, false, false, false]; }
      this.layout();
      this.logMsg('Back to the lobby for a rematch!', 'round');
      this.broadcast();
    }
    // Teams: a player whose marbles are all home only takes a turn while a teammate has something out to move
    turnOk(i) { const p = this.players[i]; return !this.settings.teams || !isDone(p) || canHelp(this.players, i, this.settings); }

    // ---- turn actions
    doRoll(p, sling) {
      if (this.state !== 'playing' || this.phase !== 'roll' || this.cur() !== p) return 'Not your roll';
      const v = this.rollDie();
      const pi = this.players.indexOf(p);
      this.roll = v; p.stats.rolls++; if (v === 6) p.stats.sixes++;
      this.moves = legalMoves(this.players, pi, v, this.settings);
      // how hard the die was flung only changes how it flies and spins, never the number
      const e = { k: 'roll', pid: p.id, v, n: this.moves.length };
      if (sling && isFinite(+sling.pw)) {
        e.pw = Math.round(Math.max(0, Math.min(1, +sling.pw)) * 100) / 100;
        if (isFinite(+sling.ang)) e.ang = Math.round((+sling.ang % 6.2832) * 100) / 100;
      }
      this.fx(e, T.roll + (e.pw ? 500 * e.pw : 0));
      if (!this.moves.length) {
        this.logMsg(`🎲 ${p.name} rolled a ${v} — no moves${v === 6 ? ', but rolls again!' : '.'}`, 'info');
        this.fx({ k: 'nomove', pid: p.id, v }, T.nomove);
        this.advance(v === 6);
      } else {
        this.phase = 'move';
        this.schedule(); this.broadcast();
      }
      return null;
    }
    doMove(p, id) {
      if (this.state !== 'playing' || this.phase !== 'move' || this.cur() !== p) return 'Not your move';
      const mv = this.moves.find((m) => m.id === id);
      if (!mv) return 'That move is not allowed';
      const owner = this.players[mv.o], helped = owner !== p; // helped: a finished player moving a teammate's marble
      let bump = null, revenge = false, mate = false, ms = 0;
      if (mv.bump) {
        const v = this.players[mv.bump.p];
        v.marbles[mv.bump.m] = BASE; v.fresh[mv.bump.m] = false; v.stats.bumped++; p.stats.bumps++;
        mate = this.settings.teams && v.team === p.team;
        if (this.lastBumper[p.id] === v.id && !mate) { revenge = true; p.stats.revenge++; delete this.lastBumper[p.id]; }
        this.lastBumper[v.id] = p.id;
        bump = { pid: v.id, m: mv.bump.m };
        ms += T.bump;
      }
      owner.marbles[mv.m] = mv.to;
      owner.fresh[mv.m] = mv.kind === 'out' && !this.settings.jumpStart;
      if (mv.kind === 'ring') p.stats.shortcuts++;
      const home = mv.to >= HOME0, star = isStar(mv.to), center = mv.to === CENTER;
      ms += mv.kind === 'out' ? T.out : mv.path.length * (mv.kind === 'ring' ? T.ringStep : T.step) + 250;
      if (home) ms += T.home; if (center) ms += T.center;
      const won = this.settings.teams ? this.players.filter((x) => x.team === owner.team).every(isDone) : isDone(owner);
      this.fx({ k: 'move', pid: p.id, oid: owner.id, m: mv.m, from: mv.from, to: mv.to, path: mv.path, kind: mv.kind, hops: mv.hops || 0, bump, revenge, mate, home, star, center, v: this.roll, won }, ms);
      const who = helped ? `${p.name} (helping ${owner.name})` : p.name, nHome = owner.marbles.filter((x) => x >= HOME0).length;
      const what = bump ? `💥 ${who} bumped ${mate ? 'teammate ' : ''}${this.P(bump.pid).name} back to base!${revenge ? ' REVENGE!' : ''}`
        : home ? (helped ? `🤝 ${p.name} got ${owner.name}'s marble home (${nHome}/4).` : `🏠 ${p.name} got a marble home (${nHome}/4).`)
        : center ? `🌀 ${who} dove into the center.`
        : mv.kind === 'ring' ? `⚡ ${who} zipped around the shortcut.`
        : mv.kind === 'out' ? `🚀 ${p.name} brought a marble out.`
        : star ? `⚡ ${who} landed on a shortcut pad.` : null;
      if (what) this.logMsg(what, bump ? 'bump' : home ? 'home' : 'info');
      this.botReact(p, bump, home);
      if (won) { this.finish(owner); return null; }
      this.advance(this.roll === 6);
      return null;
    }
    advance(again) {
      if (again && !this.turnOk(this.turn)) again = false;
      if (!again) {
        for (let i = 0; i < this.players.length; i++) { this.turn = (this.turn + 1) % this.players.length; if (this.turnOk(this.turn)) break; }
        this.turnNo++;
      }
      this.phase = 'roll'; this.moves = [];
      this.schedule(); this.broadcast();
    }
    finish(owner) {
      this.clear(); this.state = 'gameover'; this.phase = 'roll'; this.moves = [];
      const team = this.settings.teams ? owner.team : null;
      const win = team ? this.players.filter((x) => x.team === team) : [owner];
      this.winnerId = owner.id; this.winners = win.map((x) => x.id); this.winTeam = team;
      const prog = (p) => p.marbles.reduce((a, x) => a + (x >= HOME0 ? 200 + (x - HOME0) : x === BASE ? 0 : 120 - distHome(p.arm, x)), 0);
      const ranked = this.players.slice().sort((a, b) => win.includes(b) - win.includes(a) || prog(b) - prog(a));
      const top = (key) => { const s = this.players.slice().sort((a, b) => b.stats[key] - a.stats[key])[0]; return s && s.stats[key] > 0 ? { pid: s.id, n: s.stats[key] } : null; };
      this.results = {
        ranks: ranked.map((p) => ({ pid: p.id, home: p.marbles.filter((x) => x >= HOME0).length, team: this.settings.teams ? p.team : null })),
        awards: { bully: top('bumps'), bag: top('bumped'), lucky: top('sixes'), zippy: top('shortcuts'), revenge: top('revenge') },
        turns: this.turnNo, team, winners: this.winners,
      };
      this.logMsg(team ? `🏆 Team ${team} wins!` : `🏆 ${owner.name} wins!`, 'win');
      this.fx({ k: 'win', pid: owner.id, ids: this.winners, team }, 0);
      this.broadcast();
    }
    botReact(mover, bump, home) {
      const say = (p, list) => { if (p && p.bot && Math.random() < 0.55) this.react(p, list[Math.floor(Math.random() * list.length)]); };
      if (bump) { say(mover, ['😂', '😈', '🔥']); say(this.P(bump.pid), ['😭', '😤', '😱']); }
      else if (home) say(mover, ['🔥', '🙏']);
    }

    // ---- timers / autopilot
    clear() { clearTimeout(this.timer); this.timer = null; this.deadline = null; }
    schedule() {
      this.clear();
      if (this.state !== 'playing' || this.closed) return;
      const p = this.cur();
      const wait = Math.max(0, this.animUntil - Date.now());
      const act = () => {
        if (this.closed || this.state !== 'playing' || this.cur() !== p) return;
        try {
          if (this.phase === 'roll') this.doRoll(p, { pw: 0.25 + Math.random() * 0.75 });
          else this.doMove(p, botChoose(this.players, this.players.indexOf(p), this.moves, this.settings).id);
        } catch (e) { if (typeof console !== 'undefined') console.error('game error', e); }
      };
      if (p.bot || !p.connected) {
        this.timer = setTimeout(act, wait + (T.think + Math.random() * 450) * this.speed);
      } else if (this.settings.turnTimer > 0) {
        const ms = wait + this.settings.turnTimer * 1000;
        this.deadline = Date.now() + ms;
        this.timer = setTimeout(() => { this.logMsg(`⏰ ${p.name} ran out of time — autopilot.`, 'info'); act(); }, ms);
      }
    }

    // ---- chat
    say(p, text) {
      const t = String(text || '').trim().slice(0, 240);
      if (!t) return;
      const m = { pid: p.id, name: p.name, text: t, ts: Date.now() };
      this.chat.push(m); if (this.chat.length > 100) this.chat.shift();
      this.out.all('chat', m);
    }
    react(p, emoji) { if (REACTIONS.includes(emoji)) this.out.all('react', { pid: p.id, emoji }); }
    close() { this.closed = true; this.clear(); }
  }

  return { ARMS, PER, TRACK, BASE, CENTER, HOME0, STARS, COLORS, PATTERNS, REACTIONS, ARM_LAYOUT, T, isStar, isDone, startHole, jumpHole, entryHole, rel, homeStar, colorHex, walk, legalMoves, movesFor, canHelp, distHome, botChoose, cleanName, cleanDie, Room };
});
