// Procedural chill music + sound effects for Irritation, all generated live with Web Audio (no files needed).
window.Sound = (function () {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const cfg = Object.assign({ music: 0.45, sfx: 0.8, musicOn: true, sfxOn: true }, store.get('kb_audio', {}));
  let ctx, master, musicBus, sfxBus, lp, reverb, crackleSrc, schedTimer, nextTime = 0, step = 0, bar = 0, playing = false;
  let noiseBuf;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const BPM = 82, STEP = 60 / BPM / 4;
    const PROG = [
    { root: 36, ch: [52, 55, 59, 64] },
    { root: 45, ch: [52, 57, 60, 64] },
    { root: 41, ch: [53, 57, 60, 65] },
    { root: 43, ch: [50, 55, 59, 62] },
    { root: 36, ch: [52, 55, 59, 64] },
    { root: 40, ch: [52, 55, 59, 62] },
    { root: 41, ch: [53, 57, 60, 64] },
    { root: 43, ch: [53, 55, 59, 62] },
  ];
  const SCALE = [72, 74, 76, 79, 81, 84];

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicBus = ctx.createGain(); sfxBus = ctx.createGain();
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.3;
    musicBus.connect(lp); lp.connect(master);
    sfxBus.connect(master);
    // reverb
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.28; reverb.connect(wet); wet.connect(lp);
    // noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyVolumes();
    if (cfg.musicOn) startMusic();
  }
  function applyVolumes() {
    if (!ctx) return;
    musicBus.gain.setTargetAtTime(cfg.musicOn ? cfg.music * 0.55 : 0, ctx.currentTime, 0.15);
    sfxBus.gain.setTargetAtTime(cfg.sfxOn ? cfg.sfx : 0, ctx.currentTime, 0.05);
  }

  // ---------------- music voices
  function env(g, t, a, peak, d, sustain = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }
  function pad(notes, t, dur) {
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'triangle'; o.frequency.value = mtof(n); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.028, t + 0.6);
        g.gain.setValueAtTime(0.028, t + dur - 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
        o.connect(f); f.connect(g); g.connect(musicBus); g.connect(reverb);
        o.start(t); o.stop(t + dur + 0.5);
      }
    }
  }
  function keys(n, t, vel = 1) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(n);
    o2.type = 'sine'; o2.frequency.value = mtof(n) * 2; g2.gain.value = mtof(n) * 0.6;
    o2.connect(g2); g2.connect(o.frequency); // gentle FM for an electric-piano bell
    env(g, t, 0.01, 0.07 * vel, 1.3);
    o.connect(g); g.connect(musicBus); g.connect(reverb);
    o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5);
  }
  function bass(n, t, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(n);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(g, t, 0.003, 0.32, 0.3);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.35);
  }
  function noise(t, dur, type, freq, gain, bus, q = 0.8) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, 0.002, gain, dur);
    s.connect(f); f.connect(g); g.connect(bus || musicBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    return g;
  }
  function snare(t) { const g = noise(t, 0.22, 'bandpass', 1700, 0.09); g.connect(reverb); }
  function hat(t, open) { noise(t, open ? 0.12 : 0.035, 'highpass', 7500, 0.035); }
  function crackle() {
    // sparse vinyl crackle
    const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.8 : (Math.random() * 2 - 1) * 0.012;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; s.loop = true; f.type = 'bandpass'; f.frequency.value = 2500; g.gain.value = 0.35;
    s.connect(f); f.connect(g); g.connect(musicBus); s.start();
    return s;
  }

  function scheduleStep(t) {
    const s = step % 16;
    const chord = PROG[bar % PROG.length];
    const swing = s % 2 === 1 ? STEP * 0.18 : 0;
    const tt = t + swing;
    if (s === 0) { pad(chord.ch, t, STEP * 16); bass(chord.root, t, STEP * 6); }
    if (s === 10) bass(chord.root + 12, tt, STEP * 4);
    if (s === 14 && bar % 2) bass(chord.root + 7, tt, STEP * 2);
    if (s === 0 || s === 7 || (s === 10 && bar % 2 === 0)) kick(tt);
    if (s === 4 || s === 12) snare(tt);
    if (s % 2 === 0) hat(tt, s === 14);
    else if (Math.random() < 0.25) hat(tt);
    if (s === 2 || s === 8) {
      const ch = chord.ch.map((n) => n + 12);
      ch.forEach((n, i) => { if (Math.random() < 0.8) keys(n, tt + i * 0.025, 0.7); });
    }
    if ((s === 6 || s === 11 || s === 13) && Math.random() < 0.35) keys(SCALE[Math.floor(Math.random() * SCALE.length)], tt, 0.9);
    step++;
    if (step % 16 === 0) bar++;
  }
  function tick() {
    while (nextTime < ctx.currentTime + 0.15) { scheduleStep(nextTime); nextTime += STEP; }
  }
  function startMusic() {
    if (!ctx || playing) return;
    playing = true; step = 0; nextTime = ctx.currentTime + 0.1;
    crackleSrc = crackle();
    schedTimer = setInterval(tick, 30);
  }
  function stopMusic() {
    playing = false; clearInterval(schedTimer);
    if (crackleSrc) { try { crackleSrc.stop(); } catch (e) {} crackleSrc = null; }
  }

  // ---------------- sound effects
  function tone(freq, t0, dur, type = 'sine', gain = 0.2, slideTo, a = 0.005) {
    if (!ctx) return;
    const t = ctx.currentTime + t0;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, a, gain, dur);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + a + 0.05);
  }
  const sfxNoise = (t0, dur, type, f, gain, q) => ctx && noise(ctx.currentTime + t0, dur, type, f, gain, sfxBus, q);
  const fx = {
    click: () => tone(1200, 0, 0.03, 'sine', 0.08),
    select: () => { tone(740, 0, 0.06, 'triangle', 0.12); sfxNoise(0, 0.04, 'highpass', 4000, 0.05); },
    // dice + marbles
    sling: (pw = 0.4) => { tone(170 + 120 * pw, 0, 0.22, 'sawtooth', 0.07 + 0.05 * pw, 640 + 700 * pw); tone(90, 0, 0.12, 'triangle', 0.2, 60); sfxNoise(0.02, 0.2 + 0.2 * pw, 'bandpass', 1400 + 1600 * pw, 0.12 + 0.12 * pw, 0.7); },
    shake: () => { for (let i = 0; i < 7; i++) sfxNoise(i * 0.045, 0.03, 'bandpass', 2600 + Math.random() * 1800, 0.16, 3); },
    clack: (s = 1) => { sfxNoise(0, 0.05, 'bandpass', 3200, 0.42 * s, 2.2); tone(900 + Math.random() * 300, 0, 0.04, 'square', 0.05 * s, 420); },
    hop: (n = 0) => { const f = 520 * Math.pow(2, Math.min(n, 14) / 12); tone(f, 0, 0.07, 'triangle', 0.13, f * 1.25); sfxNoise(0, 0.025, 'highpass', 5200, 0.07); },
    zip: (n = 0) => { const f = 700 * Math.pow(2, Math.min(n, 8) * 2 / 12); tone(f, 0, 0.16, 'sawtooth', 0.06, f * 1.9); tone(f * 2, 0, 0.12, 'sine', 0.07, f * 3); sfxNoise(0, 0.14, 'bandpass', 2400, 0.12, 0.7); },
    out: () => { tone(260, 0, 0.16, 'triangle', 0.16, 780); tone(1046, 0.13, 0.22, 'sine', 0.13); sfxNoise(0, 0.1, 'highpass', 3000, 0.1); },
    bump: () => { tone(150, 0, 0.3, 'sine', 0.42, 48); sfxNoise(0, 0.11, 'lowpass', 1100, 0.6); tone(620, 0, 0.07, 'square', 0.1, 210); tone(1500, 0.07, 0.75, 'sine', 0.11, 190); tone(1510, 0.07, 0.75, 'triangle', 0.05, 200); },
    thud: () => { tone(120, 0, 0.16, 'sine', 0.3, 60); sfxNoise(0, 0.08, 'lowpass', 700, 0.3); },
    revenge: () => { [392, 392, 523, 659].forEach((f, i) => tone(f, i * 0.09, 0.16, 'square', 0.07)); tone(784, 0.36, 0.5, 'sawtooth', 0.08); },
    home: () => { [784, 988, 1175, 1568].forEach((f, i) => { tone(f, i * 0.07, 0.5, 'sine', 0.13); tone(f * 2, i * 0.07, 0.25, 'sine', 0.03); }); },
    six: () => { [659, 784, 988, 1318].forEach((f, i) => tone(f, i * 0.06, 0.22, 'triangle', 0.14)); tone(1318, 0.26, 0.5, 'sine', 0.1); },
    shortcut: () => { tone(440, 0, 0.3, 'sawtooth', 0.05, 1760); tone(880, 0.05, 0.3, 'sine', 0.1, 2640); sfxNoise(0, 0.3, 'bandpass', 3000, 0.1, 0.6); },
    center: () => { for (let i = 0; i < 7; i++) tone(1200 - i * 130, i * 0.06, 0.12, 'sine', 0.1, 900 - i * 110); tone(140, 0.4, 0.45, 'sine', 0.2, 70); },
    nomove: () => { tone(330, 0, 0.22, 'triangle', 0.12, 290); tone(247, 0.2, 0.4, 'triangle', 0.12, 190); },
    start: () => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.13)); },
    yourTurn: () => { [1046, 1318, 1568, 2093].forEach((f, i) => { tone(f, i * 0.09, 0.9, 'sine', 0.13); tone(f * 2.01, i * 0.09, 0.4, 'sine', 0.03); }); },
    chat: () => tone(660, 0, 0.07, 'sine', 0.1, 990),
    react: () => tone(880, 0, 0.1, 'triangle', 0.08, 1320),
    join: () => { tone(587, 0, 0.12, 'sine', 0.12); tone(880, 0.1, 0.25, 'sine', 0.12); },
    tick: () => tone(1500, 0, 0.03, 'square', 0.04),
    error: () => { tone(200, 0, 0.12, 'square', 0.06); tone(160, 0.1, 0.15, 'square', 0.06); },
    firework: () => { sfxNoise(0, 0.5, 'bandpass', 1800 + Math.random() * 1500, 0.22, 0.5); tone(1800 + Math.random() * 800, 0, 0.3, 'sine', 0.05, 600); },
    win: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.11, 0.5, 'triangle', 0.15)); [523, 659, 784].forEach((f) => tone(f, 0.85, 1.4, 'sine', 0.1)); },
  };

  return {
    init,
    play(name, arg) { if (!ctx || !cfg.sfxOn) return; try { fx[name] && fx[name](arg); } catch (e) {} },
    cfg,
    set(k, v) {
      cfg[k] = v; store.set('kb_audio', cfg);
      if (!ctx) return;
      if (k === 'musicOn') { if (v) startMusic(); }
      applyVolumes();
    },
    get musicPlaying() { return playing && cfg.musicOn; },
    stopMusic,
  };
})();
