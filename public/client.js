// Irritation client: screens, turn flow, pop-ups, chat, dice customizer.
// Works two ways: online (Socket.io rooms) or right in the browser (practice vs bots / pass-and-play).
(function () {
  'use strict';
  const K = window.KCore, DS = window.DiceSkins, B = window.Board3D, Snd = window.Sound;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const EMOJIS = ['😎', '🦊', '🐸', '🐼', '🦄', '🐙', '🤠', '👑', '🐯', '🚀'];
  const QUICK = ['Sorry! 😇', 'Payback time 😈', 'Nooo! 😭', 'Nice roll! 👏', 'Hurry up ⏰', 'GG 🤝'];
  const profile = Object.assign({ name: '', avatar: null, emoji: '😎', die: { body: '#ffffff', pip: '#1d1d28', pattern: 'solid', decalMode: 'one' }, decal: null, color: null }, store.get('kb_profile', {}));
  const prefs = Object.assign({ autoMove: true }, store.get('kb_prefs', {}));
  const saveProfile = () => store.set('kb_profile', profile);
  const payload = () => ({ name: profile.name || 'Player', avatar: profile.avatar, emoji: profile.avatar ? null : profile.emoji, die: profile.die, decal: profile.decal, color: profile.color });

  let S = null, assets = { avatars: {}, decals: {} }, pendingAct = false, lastTurnKey = '', dieShown = null, viewArmNow = null, autoTimer = null, titleTimer = null;
  let chatOpen = false, unread = 0, glOk = true;
  const queue = []; let pumping = false;
  const seats = new Map(); let seatSig = '';
  const Net = { mode: 'none', socket: null, online: false };

  // ------------------------------------------------------------------ little helpers
  function toast(text, kind) {
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = text;
    $('toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
  }
  const P = (pid) => (S ? S.players.find((p) => p.id === pid) : null);
  const cur = () => (S && S.turnId ? P(S.turnId) : null);
  const meP = () => (S ? P(S.me) : null);
  const canAct = () => { const c = cur(); return !!(S && S.state === 'playing' && c && (S.local ? !c.bot : c.id === S.me)); };
  const isHost = () => !!S && (S.local || S.hostId === S.me);
  const hex = (p) => K.colorHex(p.color);
  const lightColor = (p) => DS.lum(hex(p)) > 0.62;
  function avatarHTML(p) {
    const a = assets.avatars[p.id];
    if (a) return `<img src="${a}" alt="">`;
    return esc(p.emoji || (p.name || '?').charAt(0).toUpperCase());
  }
  const chipCache = new Map();
  function dieChip(p) {
    const d = p.die || profile.die, decalUrl = assets.decals[p.id] || null, key = DS.key(d, decalUrl);
    if (!chipCache.has(key)) {
      const img = DS.img(decalUrl, () => { chipCache.delete(key); refreshSkins(); });
      chipCache.set(key, DS.faceCanvas(d, img && d.decalMode !== 'all' ? 1 : 5, img, 64).toDataURL());
    }
    return chipCache.get(key);
  }
  function faceURL(p, v) { const d = p.die || profile.die, img = DS.img(assets.decals[p.id] || null); return DS.faceCanvas(d, v, img, 96).toDataURL(); }
  function showScreen(name) { ['home', 'lobby', 'game'].forEach((s) => $(s).classList.toggle('hidden', s !== name)); if (name !== 'game') { document.body.classList.remove('chat-open'); } $('chat').classList.toggle('hidden', !(chatOpen && name !== 'home' && !(S && S.local))); }
  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  // ------------------------------------------------------------------ networking (online or local)
  function send(ev, data, cb) {
    if (Net.mode === 'online') Net.socket.emit(ev, data, cb || (() => {}));
    else if (Net.mode === 'local') Local.handle(ev, data, cb || (() => {}));
  }
  const Local = {
    room: null, meId: null,
    open(kind) {
      this.close();
      const deliver = (ev, d) => { const copy = d === undefined ? d : JSON.parse(JSON.stringify(d)); Promise.resolve().then(() => { if (Local.room === room) onEvent(ev, copy); }); };
      const room = new K.Room('LOCAL', { send: (_pid, ev, d) => deliver(ev, d), all: deliver }, { local: true });
      this.room = room; Net.mode = 'local';
      this.meId = room.addPlayer(payload()).id;
      if (kind === 'practice') { room.addBot(); room.addBot(); }
      else this.addHuman('Player 2');
      room.assets(); room.broadcast();
    },
    addHuman(name) {
      const room = this.room, n = room.players.length, pre = DS.PRESETS[(n + 1) % DS.PRESETS.length];
      return room.addPlayer({ name, emoji: EMOJIS[(n + 2) % EMOJIS.length], die: { body: pre.body, pip: pre.pip, pattern: pre.pattern } });
    },
    actor() { const r = this.room, c = r.state === 'playing' ? r.cur() : null; return c && !c.bot ? c : r.P(this.meId); },
    handle(ev, d, cb) {
      const room = this.room; if (!room) return;
      const me = room.P(this.meId);
      switch (ev) {
        case 'profile': { const t = d && d.pid ? room.P(d.pid) : me; if (t) room.setProfile(t, d); break; }
        case 'addBot': if (room.state === 'lobby' && room.addBot()) { room.assets(); room.broadcast(); Snd.play('join'); } break;
        case 'addLocal': if (room.state === 'lobby' && this.addHuman(d)) { room.assets(); room.broadcast(); Snd.play('join'); } break;
        case 'kick': if (room.state === 'lobby' && d !== this.meId) { room.removePlayer(d); room.broadcast(); } break;
        case 'settings': room.setSettings(d); break;
        case 'start': if (room.players.length < 2) toast('Need at least 2 players — add a bot!', 'bad'); else room.start(); break;
        case 'backToLobby': room.backToLobby(); break;
        case 'roll': { const p = room.cur(); if (p && !p.bot) room.doRoll(p); break; }
        case 'move': { const p = room.cur(); if (p && !p.bot) room.doMove(p, +d); break; }
        case 'react': room.react(this.actor(), d); break;
        case 'chat': room.say(this.actor(), d); break;
        case 'leave': this.close(); break;
      }
      cb({ ok: true });
    },
    close() { if (this.room) this.room.close(); this.room = null; if (Net.mode === 'local') Net.mode = Net.online ? 'online' : 'none'; },
  };
  function loadSocketIo() {
    return new Promise((res) => {
      if (window.KB_OFFLINE || location.protocol === 'file:') return res(false);
      const s = document.createElement('script'); s.src = '/socket.io/socket.io.js';
      s.onload = () => res(typeof window.io === 'function'); s.onerror = () => res(false);
      document.head.appendChild(s); setTimeout(() => res(typeof window.io === 'function'), 5000);
    });
  }
  function connectOnline() {
    const sock = window.io({ reconnection: true });
    Net.socket = sock; Net.online = true; Net.mode = 'online';
    ['state', 'fx', 'assets', 'chat', 'chatHistory', 'react', 'toast', 'kicked'].forEach((ev) => sock.on(ev, (d) => { if (Net.mode === 'online') onEvent(ev, d); }));
    sock.on('connect', () => {
      const tok = store.get('kb_token', null);
      if (tok) sock.emit('rejoin', { token: tok }, (r) => { if (!r || !r.ok) { store.del('kb_token'); if (S && !S.local && Net.mode === 'online') goHome(); } });
    });
    sock.on('disconnect', () => { if (S && Net.mode === 'online') toast('Connection lost — reconnecting…', 'bad'); });
  }
  function onEvent(ev, d) {
    switch (ev) {
      case 'state': queue.push({ t: 'state', s: d }); pump(); break;
      case 'fx': if (d.k === 'join') Snd.play('join'); else { queue.push({ t: 'fx', e: d }); pump(); } break;
      case 'assets': assets = d; chipCache.clear(); refreshSkins(); break;
      case 'chatHistory': $('chatMsgs').innerHTML = ''; d.forEach((m) => addChat(m, true)); break;
      case 'chat': addChat(d); break;
      case 'react': floatEmoji(d.pid, d.emoji); break;
      case 'toast': toast(d, 'bad'); break;
      case 'kicked': toast('The host removed you from the room.', 'bad'); store.del('kb_token'); goHome(); break;
    }
  }
  function goHome() {
    queue.length = 0; S = null; lastTurnKey = ''; seatSig = ''; clearTimeout(autoTimer); stopTitle();
    B.clearChoices(); B.celebrate(null); stopConfetti();
    ['resultsModal', 'settingsModal', 'diceModal'].forEach(closeModal);
    chatOpen = false; showScreen('home'); renderHome();
  }

  // ------------------------------------------------------------------ ordered playback of everything the game sends
  async function pump() {
    if (pumping) return; pumping = true;
    while (queue.length) {
      if (queue.length > 24) { // way behind (tab was asleep): jump to the newest picture
        let last = -1; queue.forEach((q, i) => { if (q.t === 'state') last = i; });
        if (last > 0) queue.splice(0, last);
      }
      const it = queue.shift();
      B.setSpeed(queue.length > 9 ? 4 : queue.length > 4 ? 2 : 1);
      try { if (it.t === 'state') applyState(it.s); else if (S && S.state !== 'lobby') await playFx(it.e); } catch (e) { console.error(e); }
    }
    pumping = false;
  }
  const nameOf = (pid) => { const p = P(pid); return p ? p.name : 'Someone'; };
  function pop(o) {
    const host = $('bigfx');
    host.querySelectorAll('.pop').forEach((n) => n.remove());
    const el = document.createElement('div'); el.className = 'pop ' + (o.cls || '') + (o.small ? ' small' : '');
    el.innerHTML = `<span class="glyph">${o.glyph}</span><span class="word">${esc(o.word)}</span>${o.sub ? `<span class="sub">${o.sub}</span>` : ''}`;
    host.appendChild(el); setTimeout(() => el.remove(), 1700);
  }
  async function playFx(e) {
    if (!glOk) return;
    switch (e.k) {
      case 'start':
        Snd.play('start'); pop({ glyph: '🎬', word: 'GAME ON!', sub: `${esc(nameOf(e.pid))} goes first`, cls: 'gold' });
        await B.wait(1200); break;
      case 'roll': {
        const p = P(e.pid); if (!p) break;
        setRolling(e.pid);
        await B.roll(p.arm, e.v, p.die, assets.decals[p.id] || null);
        dieShown = { pid: e.pid, v: e.v }; showRolled(p, e.v);
        if (e.v === 6) { Snd.play('six'); pop({ glyph: '6', word: 'ROLL AGAIN!', cls: 'green', small: true }); await B.wait(700); }
        else await B.wait(e.n ? 180 : 80);
        break;
      }
      case 'nomove':
        Snd.play('nomove'); pop({ glyph: '😬', word: 'NO MOVES', sub: `${esc(nameOf(e.pid))} is stuck`, cls: 'blue', small: true });
        await B.wait(1000); break;
      case 'move':
        await B.move(e, () => landed(e));
        await B.wait(e.bump ? 260 : 110); break;
      case 'win':
        B.clearChoices(); B.celebrate(e.pid); startConfetti(); Snd.play('win');
        pop({ glyph: '🏆', word: `${nameOf(e.pid)} WINS!`, cls: 'gold' });
        await B.wait(1700); break;
    }
  }
  function landed(e) {
    const p = P(e.pid);
    if (e.bump) {
      const v = P(e.bump.pid);
      pop({ glyph: '💥', word: 'IRRITATED!', sub: `${esc(nameOf(e.pid))} bumped ${esc(nameOf(e.bump.pid))} back to base`, cls: 'red shakey' });
      const s = seats.get(e.bump.pid); if (s) { s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); }
      if (v && (S.local ? !v.bot : v.id === S.me)) buzz([60, 40, 120]);
      if (e.revenge) setTimeout(() => { Snd.play('revenge'); pop({ glyph: '😈', word: 'REVENGE!', cls: 'red', small: true }); }, 800);
    } else if (e.home) {
      const n = p ? Math.min(4, p.home + 1) : 0;
      pop({ glyph: '🏠', word: 'HOME SAFE!', sub: n ? `${esc(nameOf(e.pid))}: ${n} of 4` : '', cls: 'green', small: true });
      const s = seats.get(e.pid); if (s) { const dots = s.querySelectorAll('.pips i'); if (dots[n - 1]) dots[n - 1].classList.add('in'); }
    } else if (e.center) pop({ glyph: '🌀', word: 'WHIRLPOOL!', cls: 'blue', small: true });
    else if (e.kind === 'ring' || e.kind === 'exit') pop({ glyph: '⚡', word: 'SHORTCUT!', cls: 'gold', small: true });
    else if (e.kind === 'out' && S.settings.jumpStart) pop({ glyph: '🚀', word: 'JUMP START!', cls: 'blue', small: true });
  }

  // ------------------------------------------------------------------ applying a state snapshot
  function applyState(s) {
    const first = !S || S.state === 'lobby' || S.code !== s.code;
    S = s; pendingAct = false; clearTimeout(autoTimer);
    if (s.state === 'lobby') {
      B.clearChoices(); B.celebrate(null); stopConfetti(); closeModal('resultsModal'); lastTurnKey = ''; seatSig = ''; viewArmNow = null; dieShown = null;
      showScreen('lobby'); renderLobby(); return;
    }
    showScreen('game');
    B.configure({ players: s.players.map((p) => ({ id: p.id, arm: p.arm, color: hex(p), name: p.name })), settings: s.settings });
    B.snap(s.players);
    renderSeats(); renderLog(); renderTop();
    // camera sits behind whoever is playing on this screen
    let arm = viewArmNow;
    const c = cur(), mine = meP();
    if (s.local) { if (c && !c.bot) arm = c.arm; else if (arm == null) arm = (s.players.find((p) => !p.bot) || s.players[0]).arm; }
    else if (mine) arm = mine.arm;
    if (arm !== viewArmNow) { viewArmNow = arm; B.setView(arm, first); }
    renderTurn();
    if (s.state === 'gameover') { B.celebrate(s.winnerId); setTimeout(() => { if (S === s) showResults(); }, 1400); }
  }
  function renderTop() {
    $('tbRoom').textContent = S.local ? 'Local game' : 'Room ' + S.code;
    $('chatToggle').classList.toggle('hidden', !!S.local);
    $('musicBtn').classList.toggle('off', !Snd.cfg.musicOn);
    $('ruleJumpTitle').textContent = '🚀 Jump Start (house rule' + (S.settings.jumpStart ? ', ON)' : ', off)');
  }
  function renderSeats() {
    const sig = S.players.map((p) => p.id + p.arm + p.color).join(',');
    if (sig !== seatSig) {
      seatSig = sig;
      seats.forEach((el) => { B.removeAnchor(el); el.remove(); }); seats.clear();
      S.players.forEach((p) => {
        const el = document.createElement('div'); el.className = 'seat';
        el.innerHTML = '<div class="frame"><div class="av"></div><i class="sd"></i></div><div class="banner"></div><div class="pips"><i></i><i></i><i></i><i></i></div>';
        $('overlay').appendChild(el); seats.set(p.id, el);
        const arm = p.arm;
        B.addAnchor(el, () => B.seatWorld(arm), (x, y, w, h) => ({ l: y > h - 330 && w > 900 ? 104 : 46, r: 46, t: w > 900 ? 50 : 96, b: Math.abs(x - w / 2) < 175 ? 132 : x > w - 330 && w > 900 ? 118 : 52 }));
      });
    }
    S.players.forEach((p) => {
      const el = seats.get(p.id); if (!el) return;
      el.style.setProperty('--c', hex(p));
      el.classList.toggle('light', lightColor(p));
      el.classList.toggle('offline', !p.bot && !p.connected);
      el.classList.toggle('turn', S.state === 'playing' && S.turnId === p.id);
      const av = el.querySelector('.av'), html = avatarHTML(p); if (av.dataset.h !== html) { av.dataset.h = html; av.innerHTML = html; }
      el.querySelector('.sd').style.backgroundImage = `url(${dieChip(p)})`;
      el.querySelector('.banner').textContent = (p.bot ? '🤖 ' : '') + p.name + (!S.local && p.id === S.me ? ' (you)' : '');
      el.querySelectorAll('.pips i').forEach((d, i) => d.classList.toggle('in', i < p.home));
    });
  }
  function refreshSkins() {
    if (!S) return;
    if (S.state === 'lobby') renderLobby(); else { renderSeats(); const c = cur(); if (c && S.state === 'playing') B.setDie({ mode: S.phase === 'roll' ? 'idle' : 'rest', arm: c.arm, skin: c.die, decal: assets.decals[c.id] || null, canRoll: canAct() && S.phase === 'roll' && !pendingAct }); }
  }
  function renderLog() {
    const list = $('logList'), items = S.log.slice(-3);
    const key = items.map((l) => l.ts + l.text).join('|');
    if (list.dataset.k === key) return; list.dataset.k = key;
    list.innerHTML = items.map((l) => `<li class="${esc(l.kind)}">${esc(l.text)}</li>`).join('');
  }
  let dieTag = null;
  function setRolling(pid) { const p = P(pid); if (p) $('actionBar').innerHTML = `<div class="hint">🎲 ${esc(p.name)} is rolling…</div>`; if (dieTag) dieTag.style.display = 'none'; }
  function showRolled(p, v) { $('actionBar').innerHTML = `<div class="hint"><i class="face" style="background-image:url(${faceURL(p, v)})"></i><span><b>${esc(p.name)}</b> rolled a <b>${v}</b></span></div>`; }

  function renderTurn() {
    const c = cur(), act = canAct(), bar = $('actionBar'), pill = $('turnStrip');
    $('arena').classList.toggle('my-turn', act);
    if (!dieTag) { dieTag = document.createElement('div'); dieTag.className = 'die-tag'; dieTag.innerHTML = '<span>👆 TAP TO ROLL</span>'; $('overlay').appendChild(dieTag); B.addAnchor(dieTag, () => B.dieWorld()); }
    dieTag.style.display = 'none';
    if (S.state !== 'playing' || !c) {
      B.clearChoices(); B.setDie({ mode: 'hidden' });
      const w = P(S.winnerId); pill.textContent = w ? `🏆 ${w.name} wins!` : ''; pill.classList.remove('mine'); bar.innerHTML = ''; stopTitle(); return;
    }
    const you = !S.local && c.id === S.me, who = you ? 'Your' : c.name + "'s";
    pill.textContent = S.phase === 'roll' ? `${who} turn — roll!` : `${you ? 'You' : c.name} rolled ${S.roll}`;
    pill.classList.toggle('mine', act);
    const decal = assets.decals[c.id] || null;
    if (S.phase === 'roll') {
      B.clearChoices();
      B.setDie({ mode: 'idle', arm: c.arm, skin: c.die, decal, canRoll: act });
      if (act) {
        const again = dieShown && dieShown.pid === c.id && dieShown.v === 6 && S.roll === 6;
        bar.innerHTML = `<button class="roll-btn" id="rollBtn">🎲 ROLL</button>${again ? '<div class="hint"><span>You rolled a <b>6</b> — go again!</span></div>' : S.local && S.players.filter((p) => !p.bot).length > 1 ? `<div class="hint"><span><b>${esc(c.name)}</b>, you're up</span></div>` : ''}`;
        $('rollBtn').onclick = doRoll; dieTag.style.display = '';
      } else bar.innerHTML = `<div class="hint"><span>${c.bot ? '🤖' : '⏳'} Waiting for <b>${esc(c.name)}</b> to roll…</span></div>`;
    } else {
      const seen = dieShown && dieShown.pid === c.id && dieShown.v === S.roll;
      B.setDie({ mode: 'rest', arm: c.arm, skin: c.die, decal, canRoll: false, value: seen ? 0 : S.roll });
      const face = `<i class="face" style="background-image:url(${faceURL(c, S.roll)})"></i>`;
      if (act) {
        bar.innerHTML = `<div class="hint">${face}<span>${you || S.local ? 'Tap a <b>glowing marble</b>' : ''}${S.moves.some((m) => m.bump) ? ' — 💥 a bump is on!' : ''}</span></div>`;
        B.setChoices(c.id, S.moves, pickMove);
        if (prefs.autoMove && S.moves.length === 1) { const snap = S; autoTimer = setTimeout(() => { if (S === snap && !pendingAct) pickMove(snap.moves[0].id); }, 850); }
      } else { B.clearChoices(); bar.innerHTML = `<div class="hint">${face}<span><b>${esc(c.name)}</b> is choosing…</span></div>`; }
    }
    if (S.deadline && act) {
      const total = Math.max(1000, S.deadline - S.now), t = document.createElement('div'); t.className = 'timer'; t.innerHTML = '<i></i>'; bar.appendChild(t);
      t.firstChild.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: total, fill: 'forwards' });
    }
    // "your turn" fanfare once per turn
    const key = S.turnNo + ':' + S.turnId;
    if (key !== lastTurnKey) {
      lastTurnKey = key;
      if (act && S.phase === 'roll') {
        const b = $('turnBanner'); b.textContent = you ? 'YOUR TURN!' : `${c.name.toUpperCase()}'S TURN!`;
        b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
        Snd.play('yourTurn'); buzz(120);
        if (you && document.hidden) startTitle();
      } else stopTitle();
    }
  }
  function doRoll() {
    if (!S || !canAct() || S.phase !== 'roll' || pendingAct || pumping && queue.length) return;
    pendingAct = true; stopTitle();
    const b = $('rollBtn'); if (b) b.disabled = true; if (dieTag) dieTag.style.display = 'none';
    B.setDie({ mode: 'idle', canRoll: false });
    send('roll', null, (r) => { if (r && r.error) { pendingAct = false; renderTurn(); } });
  }
  function pickMove(id) {
    if (!S || !canAct() || S.phase !== 'move' || pendingAct) return;
    pendingAct = true; clearTimeout(autoTimer); B.clearChoices();
    send('move', id, (r) => { if (r && r.error) { pendingAct = false; toast(r.error, 'bad'); renderTurn(); } });
  }
  function startTitle() { stopTitle(); let on = false; titleTimer = setInterval(() => { on = !on; document.title = on ? '🎲 YOUR TURN!' : 'Irritation'; if (!document.hidden) stopTitle(); }, 900); }
  function stopTitle() { clearInterval(titleTimer); titleTimer = null; document.title = 'Irritation'; }

  // ------------------------------------------------------------------ results
  function showResults() {
    const r = S.results, w = P(S.winnerId); if (!r || !w) return;
    const aw = [['bully', '💥', 'Biggest Bully', (n) => `${n} bumps`], ['bag', '🥊', 'Punching Bag', (n) => `bumped ${n} times`], ['lucky', '🎲', 'Lucky Roller', (n) => `${n} sixes`], ['zippy', '⚡', 'Shortcut Champ', (n) => `${n} shortcut runs`], ['revenge', '😈', 'Sweet Revenge', (n) => `${n} paybacks`]];
    $('resultsBody').innerHTML = `
      <div class="res-win"><div class="crown">👑</div><div class="avatar lg" style="margin:auto;border-color:${hex(w)}">${avatarHTML(w)}</div>
        <h2>${esc(w.name)} wins!</h2><p class="muted">All four marbles home in ${r.turns} turn${r.turns === 1 ? '' : 's'}.</p>
        <div class="row gap center-row wrap">${isHost() ? '<button class="btn big primary" id="rematchBtn">🔁 Rematch</button>' : '<span class="muted">Waiting for the host to start a rematch…</span>'}<button class="btn ghost" id="resLeave">Leave</button></div></div>
      <div class="awards">${aw.map(([k, ic, title, f]) => { const a = r.awards[k], p = a && P(a.pid); return p ? `<div class="award"><span class="ic">${ic}</span><b>${title}</b>${esc(p.name)} <small>· ${f(a.n)}</small></div>` : ''; }).join('')}</div>
      <ul class="res-list">${r.ranks.map((x, i) => { const p = P(x.pid); return p ? `<li style="--c:${hex(p)}"><span>${i + 1}.</span><div class="avatar sm">${avatarHTML(p)}</div><span>${esc(p.name)}</span><span class="sp"></span><span>🏠 ${x.home}/4</span></li>` : ''; }).join('')}</ul>`;
    if ($('rematchBtn')) $('rematchBtn').onclick = () => send('backToLobby');
    $('resLeave').onclick = leave;
    openModal('resultsModal');
  }
  let confTimer = null;
  function startConfetti() {
    stopConfetti();
    const cv = $('confetti'), g = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
    const cols = ['#ff5a5f', '#ffd23f', '#35d65a', '#3d7bff', '#a259ff', '#ff5fb8', '#18d3c5'];
    const bits = Array.from({ length: 170 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, vy: 2 + Math.random() * 4, vx: (Math.random() - 0.5) * 2, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    confTimer = setInterval(() => {
      g.clearRect(0, 0, cv.width, cv.height);
      bits.forEach((b) => { b.x += b.vx; b.y += b.vy; b.r += b.vr; if (b.y > cv.height + 20 && performance.now() - t0 < 6500) { b.y = -20; b.x = Math.random() * cv.width; } g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore(); });
      if (performance.now() - t0 > 9500) stopConfetti();
    }, 33);
  }
  function stopConfetti() { clearInterval(confTimer); confTimer = null; const cv = $('confetti'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }

  // ------------------------------------------------------------------ home + lobby
  function setAvatarEl(el) { el.innerHTML = profile.avatar ? `<img src="${profile.avatar}" alt="">` : esc(profile.emoji || '😎'); }
  function skinName(d) { const pat = DS.PATTERNS.find((x) => x.id === d.pattern); return (pat ? pat.name : 'Solid') + (profile.decal ? ' + your decal' : ''); }
  function renderHome() {
    setAvatarEl($('avatarPreview')); setAvatarEl($('avatarPreview2'));
    $('nameInput').value = profile.name; $('nameInput2').value = profile.name;
    $('clearPhoto').hidden = !profile.avatar;
    $('emojiRow').innerHTML = EMOJIS.map((e) => `<button type="button" class="${!profile.avatar && profile.emoji === e ? 'on' : ''}" data-e="${e}">${e}</button>`).join('');
    DS.cube($('homeCube'), profile.die, profile.decal); $('homeDiceName').textContent = skinName(profile.die);
    $('onlineActions').classList.toggle('hidden', !Net.online); $('offlineNote').classList.toggle('hidden', Net.online);
  }
  function pushProfile(extra) { saveProfile(); if (S) send('profile', Object.assign({ name: profile.name || 'Player', avatar: profile.avatar, emoji: profile.avatar ? null : profile.emoji }, extra || {})); }
  async function pickAvatar(file) {
    if (!file) return;
    try {
      const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const s = Math.min(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, 128, 128);
      profile.avatar = c.toDataURL('image/jpeg', 0.85); pushProfile(); renderHome();
    } catch (e) { toast("That photo couldn't be used.", 'bad'); }
  }
  function renderLobby() {
    const local = !!S.local, host = isHost(), me = meP();
    $('lobbyKicker').textContent = local ? 'PLAYING ON THIS DEVICE' : 'ROOM CODE';
    $('lobbyCode').textContent = local ? 'Local game' : S.code; $('lobbyCode').classList.toggle('words', local);
    $('copyLink').classList.toggle('hidden', local);
    $('playerCount').textContent = `(${S.players.length}/6)`;
    $('lobbyPlayers').innerHTML = S.players.map((p) => {
      const mine = p.id === S.me, canDice = mine || (local && !p.bot);
      return `<div class="lp" style="--c:${hex(p)}"><div class="avatar">${avatarHTML(p)}</div>
        <div class="nm">${esc(p.name)}${p.id === S.hostId && !local ? ' 👑' : ''}<small>${p.bot ? 'Bot' : mine ? 'You' : !p.connected ? 'Offline' : 'Player'} · ${esc((K.COLORS.find((c) => c.id === p.color) || {}).name || '')}</small></div>
        <${canDice ? 'button title="Change dice"' : 'i'} class="mini-die" data-dice="${p.id}" style="background-image:url(${dieChip(p)})"></${canDice ? 'button' : 'i'}>
        ${host && !mine ? `<button class="kick" data-kick="${p.id}" title="Remove">✕</button>` : ''}</div>`;
    }).join('') + (S.players.length < 6 ? '<div class="lp empty">Open seat</div>' : '');
    $('colorRow').innerHTML = K.COLORS.map((c) => { const taken = S.players.some((p) => p.color === c.id && p.id !== S.me); return `<button type="button" title="${c.name}" data-color="${c.id}" style="--c:${c.hex}" class="${me && me.color === c.id ? 'on' : ''}" ${taken ? 'disabled' : ''}></button>`; }).join('');
    $('hostControls').classList.toggle('hidden', !host); $('waitHost').classList.toggle('hidden', host);
    $('addLocal').classList.toggle('hidden', !local);
    $('addBot').disabled = $('addLocal').disabled = S.players.length >= 6;
    $('setJump').checked = !!S.settings.jumpStart; $('setTimer').value = String(S.settings.turnTimer);
    $('startBtn').disabled = S.players.length < 2;
    if (!host) $('waitHost').innerHTML = `Waiting for the host to start… <br><b>🚀 Jump Start is ${S.settings.jumpStart ? 'ON' : 'off'}</b>`;
  }
  function leave() {
    const wasLocal = Net.mode === 'local';
    send('leave'); store.del('kb_token');
    if (wasLocal) Local.close();
    goHome();
  }

  // ------------------------------------------------------------------ chat + reactions
  function addChat(m, quiet) {
    const box = $('chatMsgs'), mine = S && m.pid === S.me, p = P(m.pid);
    const el = document.createElement('div'); el.className = 'msg' + (mine ? ' mine' : '');
    el.innerHTML = `<div class="avatar sm">${p ? avatarHTML(p) : '💬'}</div><div class="bubble"><div class="who">${esc(m.name)}</div>${esc(m.text)}</div>`;
    box.appendChild(el); box.scrollTop = box.scrollHeight;
    if (quiet) return;
    if (!mine) Snd.play('chat');
    if (!chatOpen && !mine) { unread++; $('unread').textContent = unread; $('unread').classList.remove('hidden'); }
    const seat = seats.get(m.pid);
    if (seat && S && S.state !== 'lobby') {
      seat.querySelectorAll('.bubble').forEach((b) => b.remove());
      const b = document.createElement('div'); b.className = 'bubble'; b.textContent = m.text.length > 70 ? m.text.slice(0, 68) + '…' : m.text;
      seat.appendChild(b); setTimeout(() => b.remove(), 4200);
    }
  }
  function floatEmoji(pid, emoji) {
    Snd.play('react');
    const seat = seats.get(pid); let x = innerWidth / 2, y = innerHeight / 2;
    if (seat && S && S.state !== 'lobby') { const r = seat.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    const el = document.createElement('div'); el.className = 'float-emoji'; el.textContent = emoji; el.style.left = x - 19 + 'px'; el.style.top = y - 30 + 'px';
    document.body.appendChild(el); setTimeout(() => el.remove(), 1800);
  }
  function setChat(open) {
    chatOpen = open; $('chat').classList.toggle('hidden', !open); document.body.classList.toggle('chat-open', open);
    if (open) { unread = 0; $('unread').classList.add('hidden'); $('chatMsgs').scrollTop = 1e6; }
  }

  // ------------------------------------------------------------------ dice customizer
  let dz = null; // { pid, die, decal }
  function openDice(pid) {
    const p = pid && S ? P(pid) : null, own = !p || (S && p.id === S.me);
    dz = { pid: own ? null : pid, die: Object.assign({}, own ? profile.die : p.die), decal: own ? profile.decal : assets.decals[pid] || null };
    $('diceTitle').textContent = own ? 'Your dice' : `${p.name}'s dice`;
    renderDice(); openModal('diceModal');
  }
  function renderDice() {
    const d = dz.die;
    DS.cube($('diceCube'), d, dz.decal);
    $('presetRow').innerHTML = DS.PRESETS.map((pr, i) => `<button type="button" data-preset="${i}"><i style="background-image:url(${DS.chip(pr, 64)})"></i>${pr.name}</button>`).join('');
    const sw = (sel, key) => DS.SWATCHES.map((c) => `<button type="button" data-${key}="${c}" style="--c:${c}" class="${sel.toLowerCase() === c ? 'on' : ''}" title="${c}"></button>`).join('') + `<input type="color" data-${key}-custom value="${sel}" title="Any color">`;
    $('bodyRow').innerHTML = sw(d.body, 'body'); $('pipRow').innerHTML = sw(d.pip, 'pip');
    $('patternRow').innerHTML = DS.PATTERNS.map((pt) => `<button type="button" data-pattern="${pt.id}" class="${d.pattern === pt.id ? 'on' : ''}"><i style="background-image:url(${DS.chip({ body: d.body, pip: d.pip, pattern: pt.id }, 64)})"></i>${pt.name}</button>`).join('');
    $('decalRemove').classList.toggle('hidden', !dz.decal);
    document.querySelectorAll('input[name=decalMode]').forEach((r) => { r.checked = r.value === (d.decalMode || 'one'); });
  }
  function bindDice() {
    $('diceModal').addEventListener('click', (ev) => {
      const t = ev.target.closest('button'); if (!t || !dz) return;
      if (t.dataset.preset != null) { const pr = DS.PRESETS[+t.dataset.preset]; Object.assign(dz.die, { body: pr.body, pip: pr.pip, pattern: pr.pattern }); }
      else if (t.dataset.body) dz.die.body = t.dataset.body;
      else if (t.dataset.pip) dz.die.pip = t.dataset.pip;
      else if (t.dataset.pattern) dz.die.pattern = t.dataset.pattern;
      else return;
      Snd.play('click'); renderDice();
    });
    $('diceModal').addEventListener('input', (ev) => {
      const t = ev.target; if (!dz) return;
      if (t.matches('[data-body-custom]')) dz.die.body = t.value;
      else if (t.matches('[data-pip-custom]')) dz.die.pip = t.value;
      else if (t.name === 'decalMode') dz.die.decalMode = t.value;
      else return;
      DS.cube($('diceCube'), dz.die, dz.decal);
    });
    $('diceModal').addEventListener('change', (ev) => { if (dz && (ev.target.matches('[data-body-custom]') || ev.target.matches('[data-pip-custom]'))) renderDice(); });
    $('decalInput').addEventListener('change', async (ev) => {
      const f = ev.target.files[0]; ev.target.value = ''; if (!f || !dz) return;
      try { dz.decal = await DS.fileToDecal(f); renderDice(); toast('Decal added!', 'good'); } catch (e) { toast(e.message || "That file couldn't be used.", 'bad'); }
    });
    $('decalRemove').onclick = () => { if (dz) { dz.decal = null; renderDice(); } };
    $('diceSave').onclick = () => {
      if (!dz) return;
      if (dz.pid) send('profile', { pid: dz.pid, die: dz.die, decal: dz.decal });
      else { profile.die = dz.die; profile.decal = dz.decal; saveProfile(); if (S) send('profile', { die: dz.die, decal: dz.decal }); renderHome(); }
      closeModal('diceModal'); Snd.play('select'); toast('Dice saved 🎲', 'good');
    };
  }

  // ------------------------------------------------------------------ wiring
  function requireName() { profile.name = K.cleanName($('nameInput').value || profile.name || 'Player'); saveProfile(); return true; }
  function bind() {
    document.addEventListener('pointerdown', () => { try { Snd.init(); } catch (e) {} }, { passive: true });
    document.addEventListener('click', (ev) => {
      const o = ev.target.closest('[data-open]'); if (o) { openModal(o.dataset.open); if (o.dataset.open === 'settingsModal') renderSettings(); return; }
      if (ev.target.closest('[data-close]') || ev.target.classList.contains('modal') && ev.target.id !== 'resultsModal') { const m = ev.target.closest('.modal'); if (m) m.classList.add('hidden'); }
    });
    // home
    $('nameInput').addEventListener('change', () => { profile.name = K.cleanName($('nameInput').value); saveProfile(); });
    $('avatarInput').addEventListener('change', (ev) => pickAvatar(ev.target.files[0]));
    $('avatarInput2').addEventListener('change', (ev) => pickAvatar(ev.target.files[0]));
    $('clearPhoto').onclick = () => { profile.avatar = null; pushProfile(); renderHome(); };
    $('emojiRow').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; profile.emoji = b.dataset.e; profile.avatar = null; pushProfile(); renderHome(); });
    $('homeDice').onclick = () => openDice(null);
    $('diceBtn').onclick = () => { const c = cur(); openDice(S && S.local && c && !c.bot ? c.id : null); };
    $('createBtn').onclick = () => { requireName(); send('create', payload(), (r) => { if (r && r.ok) store.set('kb_token', r.token); else toast('Could not create a room.', 'bad'); }); };
    const join = () => {
      const code = $('codeInput').value.toUpperCase().trim(); if (code.length !== 4) return toast('Type the 4-letter room code.', 'bad');
      requireName(); send('join', Object.assign({ code }, payload()), (r) => { if (r && r.ok) store.set('kb_token', r.token); else toast((r && r.error) || 'Could not join.', 'bad'); });
    };
    $('joinBtn').onclick = join; $('codeInput').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') join(); });
    $('practiceBtn').onclick = () => { requireName(); Local.open('practice'); };
    $('passBtn').onclick = () => { requireName(); Local.open('pass'); };
    // lobby
    $('copyLink').onclick = async () => {
      const url = location.origin + location.pathname + '?room=' + S.code;
      try { await navigator.clipboard.writeText(url); toast('Invite link copied!', 'good'); } catch (e) { toast('Room code: ' + S.code); }
    };
    $('leaveLobby').onclick = leave; $('leaveGame').onclick = () => { closeModal('settingsModal'); leave(); };
    $('addBot').onclick = () => send('addBot');
    $('addLocal').onclick = () => { $('localName').value = ''; openModal('nameModal'); setTimeout(() => $('localName').focus(), 50); };
    $('nameForm').addEventListener('submit', (ev) => { ev.preventDefault(); send('addLocal', K.cleanName($('localName').value || 'Player ' + (S.players.length + 1))); closeModal('nameModal'); });
    $('setJump').addEventListener('change', () => send('settings', { jumpStart: $('setJump').checked }));
    $('setTimer').addEventListener('change', () => send('settings', { turnTimer: +$('setTimer').value }));
    $('startBtn').onclick = () => send('start');
    $('lobbyPlayers').addEventListener('click', (ev) => {
      const k = ev.target.closest('[data-kick]'); if (k) return send('kick', k.dataset.kick);
      const d = ev.target.closest('button[data-dice]'); if (d) openDice(d.dataset.dice);
    });
    $('colorRow').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-color]'); if (!b || b.disabled) return; profile.color = b.dataset.color; saveProfile(); send('profile', { color: profile.color }); });
    // game
    $('viewBtn').onclick = () => { $('viewBtn').classList.toggle('on', B.toggleTop()); };
    $('resetView').onclick = () => { B.resetView(viewArmNow); $('viewBtn').classList.remove('on'); closeModal('settingsModal'); };
    $('musicBtn').onclick = () => { Snd.init(); Snd.set('musicOn', !Snd.cfg.musicOn); if (!Snd.cfg.musicOn) Snd.stopMusic(); $('musicBtn').classList.toggle('off', !Snd.cfg.musicOn); };
    $('chatToggle').onclick = () => setChat(!chatOpen); $('chatClose').onclick = () => setChat(false);
    $('chatForm').addEventListener('submit', (ev) => { ev.preventDefault(); const v = $('chatInput').value.trim(); if (v) send('chat', v); $('chatInput').value = ''; });
    $('quickRow').innerHTML = QUICK.map((q) => `<button type="button">${q}</button>`).join('');
    $('quickRow').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) send('chat', b.textContent); });
    $('reactDock').innerHTML = K.REACTIONS.map((e) => `<button type="button" title="React">${e}</button>`).join('');
    $('reactDock').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) send('react', b.textContent); });
    document.addEventListener('keydown', (ev) => {
      if (/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      if (ev.code === 'Space' || ev.key === 'Enter') { if (S && S.state === 'playing' && canAct() && S.phase === 'roll') { ev.preventDefault(); doRoll(); } }
      else if (ev.key === 'Escape') document.querySelectorAll('.modal:not(.hidden)').forEach((m) => { if (m.id !== 'resultsModal') m.classList.add('hidden'); });
    });
    // settings
    $('musicOn').onchange = (e) => { Snd.init(); Snd.set('musicOn', e.target.checked); if (!e.target.checked) Snd.stopMusic(); $('musicBtn').classList.toggle('off', !e.target.checked); };
    $('sfxOn').onchange = (e) => Snd.set('sfxOn', e.target.checked);
    $('musicVol').oninput = (e) => Snd.set('music', +e.target.value);
    $('sfxVol').oninput = (e) => { Snd.set('sfx', +e.target.value); Snd.play('hop', 3); };
    $('autoMove').onchange = (e) => { prefs.autoMove = e.target.checked; store.set('kb_prefs', prefs); };
    $('saveProfile').onclick = () => { profile.name = K.cleanName($('nameInput2').value); pushProfile(); renderHome(); toast('Saved!', 'good'); };
    bindDice();
  }
  function renderSettings() {
    $('musicOn').checked = Snd.cfg.musicOn; $('sfxOn').checked = Snd.cfg.sfxOn; $('musicVol').value = Snd.cfg.music; $('sfxVol').value = Snd.cfg.sfx;
    $('autoMove').checked = prefs.autoMove; $('nameInput2').value = profile.name; setAvatarEl($('avatarPreview2'));
    $('leaveGame').classList.toggle('hidden', !S);
  }

  async function boot() {
    if (!B) { document.body.insertAdjacentHTML('beforeend', '<div class="modal"><div class="modal-box narrow"><h2>Almost there</h2><p>The 3D board could not load. Check your internet connection, then reload this page.</p></div></div>'); return; }
    $('logoMarbles').innerHTML = K.COLORS.slice(0, 6).map((c, i) => `<i style="--c:${c.hex};--i:${i}"></i>`).join('');
    bind(); renderHome();
    glOk = B.init($('board'), { overlay: $('overlay'), onRollTap: doRoll, pad: () => ({ top: 0, bottom: Math.min(130, ($('actionBar').offsetHeight || 60) + 40) }) });
    if (!glOk) $('noGl').classList.remove('hidden');
    const code = new URLSearchParams(location.search).get('room'); if (code) $('codeInput').value = code.toUpperCase().slice(0, 4);
    if (await loadSocketIo()) connectOnline();
    renderHome();
  }
  window.KB = { get state() { return S; }, get queue() { return queue.length; }, Local, doRoll, pickMove, prefs };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
