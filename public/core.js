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
  // Marbles turn into Home from the space just before their own start (b-1).
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

  function nextStep(arm, pos) {
    if (pos >= HOME0) return pos + 1 <= HOME0 + 3 ? pos + 1 : null;
    if (rel(arm, pos) === TRACK - 1) return HOME0;
    return (pos + 1) % TRACK;
  }
  function walk(arm, pos, n) {
    const path = [];
    let p = pos;
    for (let s = 0; s < n; s++) {
      p = nextStep(arm, p);
      if (p == null) return null;
      path.push(p);
    }
    return path;
  }

  // Every legal move for player `pi` with this roll. players[i] = { arm, marbles: [pos x4] }
  function legalMoves(players, pi, roll, settings) {
    const me = players[pi], arm = me.arm;
    const own = new Set(), occ = new Map();
    players.forEach((p, i) => p.marbles.forEach((pos, m) => {
      if (pos < 0) return;
      if (i === pi) own.add(pos);
      else if (pos <= CENTER) occ.set(pos, { p: i, m });
    }));
    const moves = [];
    const push = (m, path, kind, extra) => {
      for (const q of path) if (own.has(q)) return; // never land on or jump your own marble
      const to = path[path.length - 1];
      const hit = to <= CENTER ? occ.get(to) : null;
      moves.push(Object.assign({ id: moves.length, m, from: me.marbles[m], to, path, kind, bump: hit ? { p: hit.p, m: hit.m } : null }, extra || {}));
    };
    let outDone = false;
    me.marbles.forEach((pos, m) => {
      if (pos === BASE) {
        if (!outDone && (roll === 1 || roll === 6)) { outDone = true; push(m, [entryHole(arm, settings)], 'out'); }
        return;
      }
      if (pos === CENTER) {
        if (roll === 1) for (const s of STARS) push(m, [s], 'exit');
        return;
      }
      const normal = walk(arm, pos, roll);
      if (normal) push(m, normal, pos >= HOME0 ? 'inhome' : normal[normal.length - 1] >= HOME0 ? 'home' : 'track');
      if (pos >= HOME0) return;
      // center: exact count, stepping in from a shortcut pad
      const pre = roll === 1 ? [] : walk(arm, pos, roll - 1);
      if (pre) {
        const last = pre.length ? pre[pre.length - 1] : pos;
        if (isStar(last)) push(m, pre.concat([CENTER]), 'center');
      }
      // shortcut ring: only for a marble that starts its move on a pad
      if (isStar(pos)) {
        for (let k = 1; k <= Math.min(roll, 5); k++) {
          const hops = [];
          for (let j = 1; j <= k; j++) hops.push((pos + PER * j) % TRACK);
          const rest = roll - k ? walk(arm, hops[k - 1], roll - k) : [];
          if (rest) push(m, hops.concat(rest), 'ring', { hops: k });
        }
      }
    });
    return moves;
  }

  // ------------------------------------------------------------------ bots
  function distHome(arm, pos) {
    if (pos === BASE) return 100;
    if (pos >= HOME0) return 3 - (pos - HOME0);
    if (pos === CENTER) return 7 + 1 + 6 + 4;
    let d = TRACK - rel(arm, pos);
    if (isStar(pos)) {
      const hops = ((((homeStar(arm) - pos) / PER) % ARMS) + ARMS) % ARMS;
      d = Math.min(d, hops + 7);
    }
    return d + 4;
  }
  function threat(players, pi, pos, settings) {
    if (pos < 0 || pos >= HOME0) return 0;
    let t = 0;
    players.forEach((p, i) => {
      if (i === pi) return;
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
    const arm = players[pi].arm;
    let best = moves[0], bestS = -1e9;
    for (const mv of moves) {
      let s = distHome(arm, mv.from) - distHome(arm, mv.to);
      if (mv.kind === 'out') s = 32;
      if (mv.bump) {
        const v = players[mv.bump.p];
        s += 42 + (100 - distHome(v.arm, v.marbles[mv.bump.m])) * 0.4;
      }
      if (mv.to >= HOME0) s += 22;
      s -= threat(players, pi, mv.to, settings) * 7;
      s += threat(players, pi, mv.from, settings) * 5;
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
      this.settings = { jumpStart: true, turnTimer: 0 };
      this.turn = 0; this.phase = 'roll'; this.roll = 0; this.moves = []; this.turnNo = 0;
      this.log = []; this.chat = []; this.fxSeq = 0; this.timer = null; this.deadline = null; this.animUntil = 0;
      this.winnerId = null; this.results = null; this.lastBumper = {}; this.lastActive = Date.now(); this.closed = false;
    }
    P(pid) { return this.players.find((p) => p.id === pid); }
    cur() { return this.players[this.turn]; }
    freeColor() { const used = new Set(this.players.map((p) => p.color)); return (COLORS.find((c) => !used.has(c.id)) || COLORS[0]).id; }

    addPlayer(d, flags) {
      d = d || {}; flags = flags || {};
      if (this.players.length >= 6) return null;
      const p = {
        id: this.uid(), token: this.uid() + this.uid(), name: cleanName(d.name), avatar: cleanImg(d.avatar), emoji: typeof d.emoji === 'string' ? d.emoji.slice(0, 4) : null,
        bot: !!flags.bot, connected: true, color: null, arm: 0, marbles: [BASE, BASE, BASE, BASE],
        die: cleanDie(d.die), decal: cleanImg(d.decal, 200000), stats: this.newStats(),
      };
      const want = COLORS.find((c) => c.id === d.color);
      p.color = want && !this.players.some((x) => x.color === want.id) ? want.id : this.freeColor();
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
          color: p.color, arm: p.arm, marbles: p.marbles.slice(), home: p.marbles.filter((x) => x >= HOME0).length, die: p.die, stats: p.stats,
        })),
        turnId: this.state === 'playing' ? this.cur().id : null, phase: this.phase, roll: this.roll, turnNo: this.turnNo,
        moves: this.state === 'playing' && this.phase === 'move' ? this.moves : [],
        deadline: this.deadline, now: Date.now(), log: this.log.slice(-30), winnerId: this.winnerId, results: this.results, fxSeq: this.fxSeq,
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
      if (d.color && this.state === 'lobby' && COLORS.some((c) => c.id === d.color) && !this.players.some((x) => x !== p && x.color === d.color)) p.color = d.color;
      this.assets(); this.broadcast();
    }
    setSettings(s) {
      if (this.state !== 'lobby' || !s) return;
      if (typeof s.jumpStart === 'boolean') this.settings.jumpStart = s.jumpStart;
      if ([0, 20, 30, 45, 60].includes(+s.turnTimer)) this.settings.turnTimer = +s.turnTimer;
      this.broadcast();
    }
    start() {
      if (this.state !== 'lobby' || this.players.length < 2) return false;
      this.layout();
      this.state = 'playing'; this.winnerId = null; this.results = null; this.lastBumper = {};
      for (const p of this.players) { p.marbles = [BASE, BASE, BASE, BASE]; p.stats = this.newStats(); }
      this.turn = Math.floor(Math.random() * this.players.length); this.phase = 'roll'; this.roll = 0; this.moves = []; this.turnNo = 1;
      this.animUntil = Date.now();
      this.logMsg(`🎬 Game on! ${this.cur().name} goes first.`, 'round');
      this.fx({ k: 'start', pid: this.cur().id }, 1400);
      this.schedule(); this.broadcast();
      return true;
    }
    backToLobby() {
      this.clear(); this.state = 'lobby'; this.winnerId = null; this.results = null;
      for (const p of this.players) p.marbles = [BASE, BASE, BASE, BASE];
      this.layout();
      this.logMsg('Back to the lobby for a rematch!', 'round');
      this.broadcast();
    }

    // ---- turn actions
    doRoll(p) {
      if (this.state !== 'playing' || this.phase !== 'roll' || this.cur() !== p) return 'Not your roll';
      const v = this.rollDie();
      const pi = this.players.indexOf(p);
      this.roll = v; p.stats.rolls++; if (v === 6) p.stats.sixes++;
      this.moves = legalMoves(this.players, pi, v, this.settings);
      this.fx({ k: 'roll', pid: p.id, v, n: this.moves.length }, T.roll);
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
      const pi = this.players.indexOf(p);
      let bump = null, revenge = false, ms = 0;
      if (mv.bump) {
        const v = this.players[mv.bump.p];
        v.marbles[mv.bump.m] = BASE; v.stats.bumped++; p.stats.bumps++;
        if (this.lastBumper[p.id] === v.id) { revenge = true; p.stats.revenge++; delete this.lastBumper[p.id]; }
        this.lastBumper[v.id] = p.id;
        bump = { pid: v.id, m: mv.bump.m };
        ms += T.bump;
      }
      p.marbles[mv.m] = mv.to;
      if (mv.kind === 'ring') p.stats.shortcuts++;
      const home = mv.to >= HOME0, star = isStar(mv.to), center = mv.to === CENTER;
      ms += mv.kind === 'out' ? T.out : mv.path.length * (mv.kind === 'ring' ? T.ringStep : T.step) + 250;
      if (home) ms += T.home; if (center) ms += T.center;
      const won = p.marbles.every((x) => x >= HOME0);
      this.fx({ k: 'move', pid: p.id, m: mv.m, from: mv.from, to: mv.to, path: mv.path, kind: mv.kind, hops: mv.hops || 0, bump, revenge, home, star, center, v: this.roll, won }, ms);
      const what = bump ? `💥 ${p.name} bumped ${this.P(bump.pid).name} back to base!${revenge ? ' REVENGE!' : ''}`
        : home ? `🏠 ${p.name} got a marble home (${p.marbles.filter((x) => x >= HOME0).length}/4).`
        : center ? `🌀 ${p.name} dove into the center.`
        : mv.kind === 'ring' ? `⚡ ${p.name} zipped around the shortcut.`
        : mv.kind === 'out' ? `🚀 ${p.name} brought a marble out.`
        : star ? `⚡ ${p.name} landed on a shortcut pad.` : null;
      if (what) this.logMsg(what, bump ? 'bump' : home ? 'home' : 'info');
      this.botReact(p, bump, home);
      if (won) { this.finish(p); return null; }
      this.advance(this.roll === 6);
      return null;
    }
    advance(again) {
      if (!again) { this.turn = (this.turn + 1) % this.players.length; this.turnNo++; }
      this.phase = 'roll'; this.moves = [];
      this.schedule(); this.broadcast();
    }
    finish(winner) {
      this.clear(); this.state = 'gameover'; this.winnerId = winner.id; this.phase = 'roll'; this.moves = [];
      const prog = (p) => p.marbles.reduce((a, x) => a + (x >= HOME0 ? 200 + (x - HOME0) : x === BASE ? 0 : 120 - distHome(p.arm, x)), 0);
      const ranked = this.players.slice().sort((a, b) => (b === winner) - (a === winner) || prog(b) - prog(a));
      const top = (key) => { const s = this.players.slice().sort((a, b) => b.stats[key] - a.stats[key])[0]; return s && s.stats[key] > 0 ? { pid: s.id, n: s.stats[key] } : null; };
      this.results = {
        ranks: ranked.map((p) => ({ pid: p.id, home: p.marbles.filter((x) => x >= HOME0).length })),
        awards: { bully: top('bumps'), bag: top('bumped'), lucky: top('sixes'), zippy: top('shortcuts'), revenge: top('revenge') },
        turns: this.turnNo,
      };
      this.logMsg(`🏆 ${winner.name} wins!`, 'win');
      this.fx({ k: 'win', pid: winner.id }, 0);
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
          if (this.phase === 'roll') this.doRoll(p);
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

  return { ARMS, PER, TRACK, BASE, CENTER, HOME0, STARS, COLORS, PATTERNS, REACTIONS, ARM_LAYOUT, T, isStar, startHole, jumpHole, entryHole, rel, homeStar, colorHex, walk, legalMoves, distHome, botChoose, cleanName, cleanDie, Room };
});
