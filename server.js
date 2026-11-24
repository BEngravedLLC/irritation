// Irritation — online multiplayer server (Express + Socket.io).
// All the rules live in public/core.js so the browser can also run practice games offline.
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const K = require('./public/core.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1.5e6, pingTimeout: 30000 });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_q, r) => r.send('ok'));

const rooms = new Map();
const tokenIndex = new Map(); // token -> { code, pid }
const SPEED = process.env.BOT_SPEED == null ? 1 : +process.env.BOT_SPEED; // test hook
const uid = () => crypto.randomBytes(9).toString('hex');

function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => L[crypto.randomInt(L.length)]).join(''); } while (rooms.has(c));
  return c;
}
function createRoom() {
  const code = newCode();
  const room = new K.Room(code, {
    send(pid, ev, data) { const p = room.P(pid); if (p && p.socketId) io.to(p.socketId).emit(ev, data); },
    all(ev, data) { io.to(code).emit(ev, data); },
  }, { speed: SPEED, uid, rollDie: () => crypto.randomInt(1, 7) });
  rooms.set(code, room);
  return room;
}
function closeRoom(room) {
  room.close();
  for (const p of room.players) tokenIndex.delete(p.token);
  rooms.delete(room.code);
}
function fixHost(room) {
  const humans = room.players.filter((p) => !p.bot);
  if (!humans.length) { closeRoom(room); return; }
  const host = room.P(room.hostId);
  if (!host || host.bot || !host.connected) {
    const next = humans.find((p) => p.connected) || humans[0];
    if (next.id !== room.hostId) { room.hostId = next.id; room.logMsg(`👑 ${next.name} is now the host.`); }
  }
}
function attach(socket, room, p) {
  p.socketId = socket.id; p.connected = true;
  socket.data.code = room.code; socket.data.pid = p.id;
  socket.join(room.code);
  room.assets();
  socket.emit('chatHistory', room.chat);
  if (room.state === 'playing') room.schedule();
  room.broadcast();
}
function ctx(socket) {
  const room = rooms.get(socket.data.code);
  const p = room && room.P(socket.data.pid);
  return room && p ? { room, p } : null;
}
const isHost = (c) => c && c.room.hostId === c.p.id;

io.on('connection', (socket) => {
  socket.on('create', (d, cb = () => {}) => {
    const room = createRoom();
    const p = room.addPlayer(d || {});
    tokenIndex.set(p.token, { code: room.code, pid: p.id });
    room.logMsg(`${p.name} set up the board (room ${room.code}).`);
    cb({ ok: true, code: room.code, token: p.token });
    attach(socket, room, p);
  });

  socket.on('join', (d, cb = () => {}) => {
    const code = String((d && d.code) || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb({ error: 'Room not found. Check the code?' });
    if (room.state !== 'lobby') return cb({ error: 'That game already started. Ask the host to wait for the next one.' });
    if (room.players.length >= 6) return cb({ error: 'Room is full (6 players max).' });
    const p = room.addPlayer(d || {});
    tokenIndex.set(p.token, { code: room.code, pid: p.id });
    room.logMsg(`${p.name} joined.`, 'join');
    cb({ ok: true, code: room.code, token: p.token });
    attach(socket, room, p);
    room.out.all('fx', { k: 'join', pid: p.id });
  });

  socket.on('rejoin', (d, cb = () => {}) => {
    const ref = d && tokenIndex.get(d.token);
    const room = ref && rooms.get(ref.code);
    const p = room && room.P(ref.pid);
    if (!p) return cb({ ok: false });
    cb({ ok: true, code: room.code });
    room.logMsg(`${p.name} is back.`, 'join');
    attach(socket, room, p);
  });

  socket.on('profile', (d) => { const c = ctx(socket); if (c) c.room.setProfile(c.p, d); });

  socket.on('addBot', () => {
    const c = ctx(socket); if (!isHost(c) || c.room.state !== 'lobby') return;
    const b = c.room.addBot();
    if (!b) return;
    c.room.logMsg(`🤖 ${b.name} (bot) rolled up.`, 'join');
    c.room.assets(); c.room.broadcast();
    c.room.out.all('fx', { k: 'join', pid: b.id });
  });

  socket.on('kick', (pid) => {
    const c = ctx(socket); if (!isHost(c) || c.room.state !== 'lobby' || pid === c.p.id) return;
    const gone = c.room.removePlayer(pid);
    if (!gone) return;
    tokenIndex.delete(gone.token);
    if (gone.socketId) io.to(gone.socketId).emit('kicked');
    c.room.logMsg(`${gone.name} left the table.`);
    c.room.broadcast();
  });

  socket.on('settings', (s) => { const c = ctx(socket); if (isHost(c)) c.room.setSettings(s); });

  socket.on('start', () => {
    const c = ctx(socket); if (!isHost(c)) return;
    if (c.room.players.length < 2) return socket.emit('toast', 'Need at least 2 players — add a bot!');
    c.room.start();
  });
  socket.on('backToLobby', () => { const c = ctx(socket); if (isHost(c) && c.room.state === 'gameover') c.room.backToLobby(); });

  socket.on('roll', (_d, cb = () => {}) => {
    const c = ctx(socket); if (!c) return cb({ error: 'Not in a game' });
    let err; try { err = c.room.doRoll(c.p); } catch (e) { console.error(e); err = 'Something went wrong'; }
    cb(err ? { error: err } : { ok: true });
  });
  socket.on('move', (id, cb = () => {}) => {
    const c = ctx(socket); if (!c) return cb({ error: 'Not in a game' });
    let err; try { err = c.room.doMove(c.p, +id); } catch (e) { console.error(e); err = 'Something went wrong'; }
    cb(err ? { error: err } : { ok: true });
  });

  socket.on('chat', (text) => { const c = ctx(socket); if (c) c.room.say(c.p, text); });
  socket.on('react', (emoji) => { const c = ctx(socket); if (c) c.room.react(c.p, emoji); });

  socket.on('leave', () => {
    const c = ctx(socket); if (!c) return;
    const { room, p } = c;
    socket.leave(room.code);
    socket.data = {};
    if (room.state === 'lobby') {
      room.removePlayer(p.id);
      tokenIndex.delete(p.token);
    } else {
      p.connected = false; p.socketId = null;
      room.logMsg(`${p.name} left — autopilot takes over.`);
      room.schedule();
    }
    fixHost(room);
    room.broadcast();
  });

  socket.on('disconnect', () => {
    const c = ctx(socket); if (!c) return;
    const { room, p } = c;
    if (p.socketId !== socket.id) return;
    p.connected = false;
    room.logMsg(`${p.name} disconnected${room.state === 'playing' ? ' — autopilot on until they return' : ''}.`);
    if (room.state === 'playing') room.schedule();
    room.broadcast();
    setTimeout(() => {
      if (!rooms.has(room.code) || p.connected) return;
      if (room.state === 'lobby') {
        room.removePlayer(p.id);
        tokenIndex.delete(p.token);
        fixHost(room); room.broadcast();
      } else fixHost(room);
    }, 45000);
  });
});

// sweep rooms nobody is in
setInterval(() => {
  for (const room of rooms.values()) {
    const live = room.players.some((p) => !p.bot && p.connected);
    if (live) room.lastActive = Date.now();
    else if (Date.now() - room.lastActive > 20 * 60 * 1000) closeRoom(room);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Irritation running on http://localhost:${PORT}`));
