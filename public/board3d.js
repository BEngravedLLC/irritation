// Irritation 3D board: the table, glass marbles, the rolling die and every animation.
window.Board3D = (function () {
  'use strict';
  if (!window.THREE) return null; // 3D library did not load
  const K = window.KCore, THREE = window.THREE;
  // layout (world units; holes are 1 apart)
  const W = 2, VS = Math.sqrt(3) * W, VE = VS + 5, RB = 12.4, MR = 0.37, MY = MR * 0.86, DIE = 1.25;
  const HOME_V = (h) => VE - 1.15 - 0.95 * h, BASE_V = VE + 1.85;
  const GREY = '#69708a';
  const snd = (n, a) => window.Sound && window.Sound.play(n, a);

  function loc(a, u, v) { const al = (a * Math.PI) / 3, s = Math.sin(al), c = Math.cos(al); return [-s * v - c * u, c * v - s * u]; }
  function trackXZ(i) {
    const a = Math.floor(i / 14), j = i % 14, b = (a + 1) % 6;
    if (j === 0) return loc(a, 0, VE);
    if (j === 1) return loc(a, W / 2, VE);
    if (j === 2) return loc(a, W, VE);
    if (j <= 6) return loc(a, W, VE - (j - 2));
    if (j === 7) return loc(a, W, VS);
    if (j <= 11) return loc(b, -W, VS + (j - 7));
    if (j === 12) return loc(b, -W, VE);
    return loc(b, -W / 2, VE);
  }
  function posXZ(pos, arm, m) {
    if (pos === K.BASE) return loc(arm, (1.5 - m) * 1.2, BASE_V);
    if (pos === K.CENTER) return [0, 0];
    if (pos >= K.HOME0) return loc(arm, 0, HOME_V(pos - K.HOME0));
    return trackXZ(pos);
  }
  const dieSpot = (arm) => { const al = (arm * Math.PI) / 3 - Math.PI / 6; return [-Math.sin(al) * 8.3, Math.cos(al) * 8.3]; };

  let renderer, scene, camera, canvas, sun, opts = {}, ready = false, quality = 2, slowN = 0, born = 0;
  let boardCanvas, boardTex, boardSig = '';
  let cfg = { players: [], settings: { jumpStart: true }, byId: {} };
  const marbles = {}; // pid -> [mesh x4]
  let die, dieMats = [], dieTexCache = new Map(), dieState = { mode: 'hidden', arm: 0, canRoll: false, busy: false };
  let hiRings = [], destMarks = [], pathDots, padGlows = [], waves = [], sparkles;
  let parts, partData = [], partN = 160;
  const tweens = [], anchors = [];
  let speed = 1, choice = null, celebrating = null, shakeAmt = 0;
  const cam = { az: 0, pol: 0.86, zoom: 1, tAz: 0, tPol: 0.86, tZoom: 1, top: false };
  const tmp = new THREE.Vector3();
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = { out: (t) => 1 - Math.pow(1 - t, 3), inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), back: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2) };

  // ------------------------------------------------------------------ tweens
  function tween(ms, fn, ez) {
    return new Promise((res) => { tweens.push({ t0: performance.now(), ms: Math.max(1, ms / speed), fn, ez: ez || ((x) => x), res }); });
  }
  function stepTweens(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i], k = Math.min(1, (now - t.t0) / t.ms);
      try { t.fn(t.ez(k), k); } catch (e) { console.error(e); }
      if (k >= 1) { tweens.splice(i, 1); t.res(); }
    }
  }
  const wait = (ms) => tween(ms, () => {});

  // ------------------------------------------------------------------ board artwork (painted on a canvas)
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function label(g, str, x, y, size, color, o) {
    o = o || {};
    g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot); g.scale(size / 100, size / 100);
    g.font = `${o.weight || 700} 100px Fredoka, Nunito, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (o.spacing && g.letterSpacing !== undefined) g.letterSpacing = o.spacing + 'px';
    if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.strokeW || 18; g.strokeStyle = o.stroke; g.strokeText(str, 0, 0); }
    g.fillStyle = color; g.fillText(str, 0, 0); g.restore();
  }
  function hole(g, x, z, r, rim, lw) {
    const gr = g.createRadialGradient(x - r * 0.25, z - r * 0.3, r * 0.1, x, z, r);
    gr.addColorStop(0, '#1b1e3d'); gr.addColorStop(1, '#04050d');
    g.beginPath(); g.arc(x, z, r, 0, 6.2832); g.fillStyle = gr; g.fill();
    g.lineWidth = lw || 0.06; g.strokeStyle = rim; g.stroke();
  }
  function chevron(g, x, z, dx, dz, s, color, lw) {
    const L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, px = -uz, pz = ux;
    g.beginPath(); g.moveTo(x - ux * s + px * s, z - uz * s + pz * s); g.lineTo(x + ux * s * 0.6, z + uz * s * 0.6); g.lineTo(x - ux * s - px * s, z - uz * s - pz * s);
    g.lineWidth = lw || 0.07; g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
  }
  function shadeHex(hex, f) { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)); return `rgb(${c[0]},${c[1]},${c[2]})`; }
  function alphaHex(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  function paintBoard() {
    const S = boardCanvas.width, g = boardCanvas.getContext('2d'), k = S / (2 * RB);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
    g.setTransform(k, 0, 0, k, S / 2, S / 2);
    // deep night-sky table top
    let gr = g.createRadialGradient(0, 0, 1, 0, 0, RB);
    gr.addColorStop(0, '#343a8c'); gr.addColorStop(0.42, '#1d2058'); gr.addColorStop(1, '#0a0b24');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, RB, 0, 6.2832); g.fill();
    for (let i = 0; i < 24; i++) { if (i % 2) continue; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, RB, (i / 24) * 6.2832 + 0.13, ((i + 1) / 24) * 6.2832 + 0.13); g.closePath(); g.fillStyle = 'rgba(255,255,255,.028)'; g.fill(); }
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 260; i++) { const a = rnd() * 6.2832, r = 2 + rnd() * (RB - 2.4); g.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.3})`; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.02 + rnd() * 0.035, 0, 6.2832); g.fill(); }
    g.lineWidth = 0.1; g.strokeStyle = 'rgba(255,214,102,.9)'; g.beginPath(); g.arc(0, 0, RB - 0.3, 0, 6.2832); g.stroke();
    g.lineWidth = 0.04; g.strokeStyle = 'rgba(255,214,102,.4)'; g.beginPath(); g.arc(0, 0, RB - 0.55, 0, 6.2832); g.stroke();

    const armColor = [null, null, null, null, null, null];
    cfg.players.forEach((p) => { armColor[p.arm] = p.color; });
    const T30 = Math.tan(Math.PI / 6);
    // arms
    for (let a = 0; a < 6; a++) {
      const col = armColor[a] || GREY, live = !!armColor[a];
      g.save(); g.rotate((a * Math.PI) / 3); // local frame: x = -left, y = outward
      g.save();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-T30 * 14, 14); g.lineTo(T30 * 14, 14); g.closePath(); g.clip();
      gr = g.createLinearGradient(0, VS - 1.3, 0, VE + 2.9);
      gr.addColorStop(0, alphaHex(col, live ? 0.1 : 0.05)); gr.addColorStop(1, alphaHex(col, live ? 0.42 : 0.14));
      rr(g, -W - 0.82, VS - 1.3, 2 * W + 1.64, VE + 2.95 - VS + 1.3, 0.9); g.fillStyle = gr; g.fill();
      g.lineWidth = 0.08; g.strokeStyle = alphaHex(col, live ? 0.85 : 0.3); g.stroke();
      g.restore();
      // home lane
      gr = g.createLinearGradient(0, VS, 0, VE);
      gr.addColorStop(0, live ? shadeHex(col, 0.28) : '#4b5169'); gr.addColorStop(1, live ? shadeHex(col, -0.12) : '#3a3f55');
      rr(g, -W + 0.8, VS + 0.22, 2 * W - 1.6, VE - 0.8 - VS - 0.22, 0.55); g.fillStyle = gr; g.globalAlpha = live ? 0.95 : 0.5; g.fill(); g.globalAlpha = 1;
      g.lineWidth = 0.06; g.strokeStyle = 'rgba(255,255,255,.45)'; g.stroke();
      // base tray
      rr(g, -2.75, VE + 1.12, 5.5, 1.62, 0.8); g.fillStyle = live ? shadeHex(col, -0.35) : '#2d3145'; g.globalAlpha = live ? 0.95 : 0.6; g.fill(); g.globalAlpha = 1;
      g.lineWidth = 0.07; g.strokeStyle = live ? shadeHex(col, 0.45) : 'rgba(255,255,255,.2)'; g.stroke();
      if (live) {
        const dark = window.DiceSkins && window.DiceSkins.lum(col) > 0.62;
        label(g, 'HOME', 0, VS + 0.5, 0.3, dark ? 'rgba(20,20,40,.8)' : 'rgba(255,255,255,.92)', { spacing: 14 });
        // little arrows up the home lane
        for (let h = 0; h < 3; h++) chevron(g, 0, HOME_V(h) - 0.475, 0, -1, 0.1, dark ? 'rgba(20,20,40,.45)' : 'rgba(255,255,255,.55)', 0.06);
      }
      g.restore();
    }
    // shortcut ring + spokes
    g.setLineDash([0.34, 0.26]); g.lineCap = 'butt';
    for (let s = 0; s < 6; s++) {
      const p = trackXZ(K.STARS[s]), q = trackXZ(K.STARS[(s + 1) % 6]);
      g.lineWidth = 0.13; g.strokeStyle = 'rgba(255,214,102,.85)'; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
      g.lineWidth = 0.09; g.strokeStyle = 'rgba(120,230,255,.7)'; g.beginPath(); g.moveTo(p[0] * 0.82, p[1] * 0.82); g.lineTo(p[0] * 0.3, p[1] * 0.3); g.stroke();
    }
    g.setLineDash([]);
    for (let s = 0; s < 6; s++) {
      const p = trackXZ(K.STARS[s]), q = trackXZ(K.STARS[(s + 1) % 6]);
      for (const t of [0.36, 0.64]) chevron(g, lerp(p[0], q[0], t), lerp(p[1], q[1], t), q[0] - p[0], q[1] - p[1], 0.17, '#ffe9a8', 0.09);
    }
    // the road
    const road = () => { g.beginPath(); for (let i = 0; i < K.TRACK; i++) { const p = trackXZ(i); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.closePath(); };
    g.lineJoin = 'round'; g.lineCap = 'round';
    road(); g.lineWidth = 1.42; g.strokeStyle = 'rgba(6,7,20,.92)'; g.stroke();
    road(); g.lineWidth = 1.2; g.strokeStyle = '#262a5c'; g.stroke();
    road(); g.lineWidth = 0.96; g.strokeStyle = '#1a1d45'; g.stroke();
    for (let i = 0; i < K.TRACK; i++) { const p = trackXZ(i), q = trackXZ((i + 1) % K.TRACK); chevron(g, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, q[0] - p[0], q[1] - p[1], 0.085, 'rgba(140,200,255,.5)', 0.05); }
    // holes
    for (let i = 0; i < K.TRACK; i++) {
      const p = trackXZ(i);
      if (K.isStar(i)) {
        g.beginPath(); for (let c = 0; c < 6; c++) { const an = (c / 6) * 6.2832 + Math.atan2(p[1], p[0]); const x = p[0] + Math.cos(an) * 0.74, z = p[1] + Math.sin(an) * 0.74; c ? g.lineTo(x, z) : g.moveTo(x, z); } g.closePath();
        gr = g.createRadialGradient(p[0], p[1], 0.1, p[0], p[1], 0.8); gr.addColorStop(0, '#fff3c2'); gr.addColorStop(0.6, '#ffc93d'); gr.addColorStop(1, '#e08a00');
        g.fillStyle = gr; g.fill(); g.lineWidth = 0.07; g.strokeStyle = '#fff8dc'; g.stroke();
        hole(g, p[0], p[1], 0.36, '#7a4a00', 0.07);
        // lightning bolt toward the middle
        const L = Math.hypot(p[0], p[1]), ix = -p[0] / L, iz = -p[1] / L;
        g.save(); g.translate(p[0] + ix * 1.12, p[1] + iz * 1.12); g.rotate(Math.atan2(iz, ix) - Math.PI / 2); g.scale(0.3, 0.3);
        g.beginPath(); g.moveTo(0.25, -1); g.lineTo(-0.55, 0.15); g.lineTo(-0.05, 0.15); g.lineTo(-0.3, 1); g.lineTo(0.6, -0.25); g.lineTo(0.08, -0.25); g.closePath();
        g.fillStyle = '#ffe066'; g.fill(); g.lineWidth = 0.14; g.strokeStyle = '#7a4a00'; g.lineJoin = 'round'; g.stroke(); g.restore();
      } else hole(g, p[0], p[1], 0.33, 'rgba(170,190,255,.55)');
    }
    // center whirlpool
    gr = g.createRadialGradient(0, 0, 0.2, 0, 0, 1.15); gr.addColorStop(0, '#7df3ff'); gr.addColorStop(0.55, '#7a5cff'); gr.addColorStop(1, '#2a1a7a');
    g.beginPath(); g.arc(0, 0, 1.12, 0, 6.2832); g.fillStyle = gr; g.fill(); g.lineWidth = 0.08; g.strokeStyle = '#d7f9ff'; g.stroke();
    g.lineWidth = 0.08; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) { g.beginPath(); for (let t = 0; t <= 1; t += 0.05) { const an = arm * 2.094 + t * 3.6, r = 0.42 + t * 0.6; const x = Math.cos(an) * r, z = Math.sin(an) * r; t ? g.lineTo(x, z) : g.moveTo(x, z); } g.stroke(); }
    hole(g, 0, 0, 0.38, '#eafcff', 0.08);
    // per-player holes, entry markers
    for (let a = 0; a < 6; a++) {
      const col = armColor[a], live = !!col;
      for (let h = 0; h < 4; h++) { const p = loc(a, 0, HOME_V(h)); hole(g, p[0], p[1], 0.33, live ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.25)', 0.07); }
      for (let m = 0; m < 4; m++) { const p = posXZ(K.BASE, a, m); hole(g, p[0], p[1], 0.33, live ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.2)', 0.06); }
      if (!live) continue;
      const jump = !!cfg.settings.jumpStart, e = trackXZ(K.entryHole(a, cfg.settings));
      g.beginPath(); g.arc(e[0], e[1], 0.47, 0, 6.2832); g.lineWidth = 0.13; g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 14; g.stroke(); g.shadowBlur = 0;
      g.beginPath(); g.arc(e[0], e[1], 0.56, 0, 6.2832); g.lineWidth = 0.04; g.strokeStyle = '#fff'; g.stroke();
      g.save(); g.rotate((a * Math.PI) / 3);
      const tx = jump ? -(W + 1.2) : 0, ty = jump ? VE + 0.05 : VE + 0.86, tw = jump ? 1.0 : 0.86, th = jump ? 0.52 : 0.38;
      rr(g, tx - tw / 2, ty - th / 2, tw, th, th / 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 0.06; g.strokeStyle = col; g.stroke();
      label(g, 'GO', tx, ty + 0.02, jump ? 0.34 : 0.26, '#1a1c3a', { weight: 700 });
      if (jump) { g.beginPath(); g.moveTo(-(W + 0.62), VE + 0.05); g.lineTo(-(W + 0.76), VE - 0.08); g.lineTo(-(W + 0.76), VE + 0.18); g.closePath(); g.fillStyle = '#fff'; g.fill(); chevron(g, -W - 0.62, VE - 0.9, 0, -1, 0.13, '#fff', 0.08); chevron(g, -W - 0.62, VE - 1.9, 0, -1, 0.13, 'rgba(255,255,255,.6)', 0.08); }
      g.restore();
    }
    // wordmark in two of the open gaps
    for (const gap of [0, 3]) {
      const an = (gap * Math.PI) / 3 - Math.PI / 6;
      g.save(); g.rotate(an); label(g, 'IRRITATION', 0, 10.35, 0.64, '#ffd23f', { stroke: '#7a3b00', strokeW: 16, weight: 700, spacing: 4 }); g.restore();
    }
    if (boardTex) boardTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ scene
  function init(canvasEl, o) {
    canvas = canvasEl; opts = o || {};
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.5, 200);

    // reflections for the glass marbles
    const envScene = new THREE.Scene();
    const ec = document.createElement('canvas'); ec.width = 16; ec.height = 128; const eg = ec.getContext('2d');
    const egr = eg.createLinearGradient(0, 0, 0, 128); egr.addColorStop(0, '#b9c4ff'); egr.addColorStop(0.35, '#5a6bd6'); egr.addColorStop(0.62, '#2a2d6b'); egr.addColorStop(1, '#0a0b1e');
    eg.fillStyle = egr; eg.fillRect(0, 0, 16, 128);
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(ec), side: THREE.BackSide })));
    [[10, 22, 8, 12], [-16, 18, -6, 9], [0, 26, -18, 10], [-8, 14, 20, 6]].forEach(([x, y, z, s]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); });
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.03).texture; pm.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2850, 0.6));
    sun = new THREE.DirectionalLight(0xfff2dc, 0.95);
    sun.position.set(7, 18, 9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 2, far: 50 }); sun.shadow.bias = -0.0006; sun.shadow.radius = 4;
    scene.add(sun);
    const glow = new THREE.PointLight(0x9fd8ff, 0.5, 30); glow.position.set(0, 6, 0); scene.add(glow);

    // board
    boardCanvas = document.createElement('canvas'); boardCanvas.width = boardCanvas.height = Math.min(2048, renderer.capabilities.maxTextureSize);
    boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.encoding = THREE.sRGBEncoding; boardTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    paintBoard();
    const top = new THREE.Mesh(new THREE.CircleGeometry(RB, 96), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.42, metalness: 0.05, envMapIntensity: 0.55 }));
    top.rotation.x = -Math.PI / 2; top.receiveShadow = true; scene.add(top);
    const side = new THREE.Mesh(new THREE.CylinderGeometry(RB, RB * 0.975, 0.8, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x15173c, roughness: 0.5, metalness: 0.3 }));
    side.position.y = -0.4; scene.add(side);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RB, 0.13, 12, 120), new THREE.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.25, metalness: 0.9, envMapIntensity: 1.3 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; scene.add(rim);
    const rim2 = rim.clone(); rim2.position.y = -0.8; rim2.scale.setScalar(0.975); scene.add(rim2);
    // soft floor shadow under the board
    const sc = document.createElement('canvas'); sc.width = sc.height = 256; const sg = sc.getContext('2d');
    const sgr = sg.createRadialGradient(128, 128, 60, 128, 128, 128); sgr.addColorStop(0, 'rgba(0,0,0,.6)'); sgr.addColorStop(0.75, 'rgba(0,0,0,.35)'); sgr.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = sgr; sg.fillRect(0, 0, 256, 256);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(RB * 2.9, RB * 2.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; scene.add(floor);

    // glows over the shortcut pads + center
    const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    K.STARS.concat([K.CENTER]).forEach((s, i) => {
      const p = s === K.CENTER ? [0, 0] : trackXZ(s);
      const m = new THREE.Mesh(new THREE.RingGeometry(i === 6 ? 0.95 : 0.66, i === 6 ? 1.25 : 0.9, 40), glowMat(i === 6 ? 0x7df3ff : 0xffd75e));
      m.rotation.x = -Math.PI / 2; m.position.set(p[0], 0.03, p[1]); scene.add(m); padGlows.push(m);
    });
    // helpers: highlight rings, destination markers, path dots, shockwaves
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.62, 36), glowMat(0xffffff)); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); hiRings.push(m); }
    for (let i = 0; i < 8; i++) {
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.6, 36), glowMat(0xffffff)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
      const ghost = new THREE.Mesh(new THREE.SphereGeometry(MR, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false })); ghost.position.y = MY;
      grp.add(ring); grp.add(ghost); grp.visible = false; scene.add(grp); destMarks.push(grp);
    }
    pathDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), 14);
    pathDots.count = 0; scene.add(pathDots);
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), glowMat(0xffffff)); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); waves.push(m); }
    // particles
    parts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), partN);
    parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parts.count = partN;
    for (let i = 0; i < partN; i++) { partData.push({ life: 0 }); parts.setColorAt(i, new THREE.Color(1, 1, 1)); }
    parts.frustumCulled = false; scene.add(parts);
    // floating dust
    const sp = new Float32Array(140 * 3); for (let i = 0; i < 140; i++) { sp[i * 3] = (Math.random() - 0.5) * 34; sp[i * 3 + 1] = Math.random() * 9 + 0.5; sp[i * 3 + 2] = (Math.random() - 0.5) * 34; }
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sparkles = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xfff0b8, size: 0.09, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(sparkles);

    // the die (rounded cube, one painted canvas per face)
    const geo = new THREE.BoxGeometry(1, 1, 1, 7, 7, 7), pos = geo.attributes.position, nor = geo.attributes.normal, R = 0.15, h = 0.5 - R, v = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); q.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z))); v.sub(q).normalize(); nor.setXYZ(i, v.x, v.y, v.z); pos.setXYZ(i, q.x + v.x * R, q.y + v.y * R, q.z + v.z * R); }
    for (let i = 0; i < 6; i++) dieMats.push(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05, envMapIntensity: 0.7 }));
    die = new THREE.Mesh(geo, dieMats); die.scale.setScalar(DIE); die.castShadow = true; die.visible = false; scene.add(die);

    bindInput();
    window.addEventListener('resize', resize); resize();
    if (document.fonts && document.fonts.load) document.fonts.load('700 20px Fredoka').then(paintBoard).catch(() => {});
    requestAnimationFrame(frame);
    setInterval(() => { if (document.hidden) stepTweens(performance.now()); }, 250); // keep the game moving in a background tab
    ready = true;
    return true;
  }

  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ players + marbles
  function configure(c) {
    cfg = { players: c.players, settings: c.settings, byId: {} };
    c.players.forEach((p) => { cfg.byId[p.id] = p; });
    const sig = c.players.map((p) => p.id + p.arm + p.color).join(',') + '|' + !!c.settings.jumpStart;
    if (!ready || sig === boardSig) return;
    boardSig = sig; paintBoard();
    // rebuild marbles
    for (const pid in marbles) { marbles[pid].forEach((m) => { scene.remove(m); m.material.dispose(); }); delete marbles[pid]; }
    const geo = new THREE.SphereGeometry(MR, 40, 28);
    c.players.forEach((p) => {
      marbles[p.id] = [0, 1, 2, 3].map((m) => {
        const col = new THREE.Color(p.color), hsl = {};
        col.getHSL(hsl); col.setHSL(hsl.h, Math.min(1, hsl.s * 1.2), hsl.l * (hsl.l > 0.8 ? 0.8 : 0.66)); // deepen so bright lights don't wash it out
        const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.22, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.1, envMapIntensity: 0.3, emissive: col, emissiveIntensity: 0.18 }));
        mesh.castShadow = true; mesh.userData = { pid: p.id, m, pos: K.BASE };
        const xz = posXZ(K.BASE, p.arm, m); mesh.position.set(xz[0], MY, xz[1]);
        scene.add(mesh); return mesh;
      });
    });
  }
  function snap(players) {
    if (!ready) return;
    players.forEach((p) => {
      const ms = marbles[p.id]; if (!ms) return;
      p.marbles.forEach((pos, m) => { const xz = posXZ(pos, p.arm, m); ms[m].userData.pos = pos; ms[m].position.set(xz[0], MY, xz[1]); ms[m].scale.setScalar(1); });
    });
  }
  function vecOf(pos, arm, m) { const xz = posXZ(pos, arm, m); return new THREE.Vector3(xz[0], MY, xz[1]); }

  // ------------------------------------------------------------------ particles + effects
  function burst(x, y, z, color, n, power, up) {
    const c = new THREE.Color(color);
    for (let i = 0, made = 0; i < partN && made < n; i++) {
      const p = partData[i]; if (p.life > 0) continue;
      const a = Math.random() * 6.2832, s = (0.4 + Math.random() * 0.8) * power;
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = (up || 3) * (0.5 + Math.random());
      p.life = p.max = 0.6 + Math.random() * 0.6; p.s = 0.6 + Math.random() * 1.2;
      const cc = Math.random() < 0.25 ? new THREE.Color(1, 1, 1) : c; parts.setColorAt(i, cc); made++;
    }
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  }
  const m4 = new THREE.Matrix4();
  function stepParts(dt) {
    for (let i = 0; i < partN; i++) {
      const p = partData[i];
      if (p.life <= 0) { m4.makeScale(0, 0, 0); parts.setMatrixAt(i, m4); continue; }
      p.life -= dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.08) { p.y = 0.08; p.vy *= -0.4; p.vx *= 0.7; p.vz *= 0.7; }
      const s = p.s * Math.max(0, p.life / p.max);
      m4.makeScale(s, s, s); m4.setPosition(p.x, p.y, p.z); parts.setMatrixAt(i, m4);
    }
    parts.instanceMatrix.needsUpdate = true;
  }
  function wave(x, z, color, size, ms) {
    const w = waves.find((m) => !m.visible) || waves[0];
    w.visible = true; w.position.set(x, 0.06, z); w.material.color.set(color);
    tween(ms || 600, (e) => { w.scale.setScalar(0.4 + e * (size || 3)); w.material.opacity = 0.85 * (1 - e); }, ease.out).then(() => { w.visible = false; });
  }
  function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

  // ------------------------------------------------------------------ die
  const FACE_Q = {
    1: new THREE.Quaternion(), 6: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
    2: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), 5: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
    3: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), 4: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
  };
  function skinDie(skin, decalUrl) {
    const DS = window.DiceSkins; if (!DS || !skin) return;
    const decal = DS.img(decalUrl, () => { if (dieState.skinKey === DS.key(skin, decalUrl)) { dieState.skinKey = ''; skinDie(skin, decalUrl); } });
    const key = DS.key(skin, decalUrl) + (decal ? '+' : '');
    if (dieState.texKey === key) return;
    dieState.texKey = key; dieState.skinKey = DS.key(skin, decalUrl);
    let tex = dieTexCache.get(key);
    if (!tex) {
      tex = DS.FACE_VALUES.map((v) => { const t = new THREE.CanvasTexture(DS.faceCanvas(skin, v, decal, 256)); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; });
      dieTexCache.set(key, tex);
      if (dieTexCache.size > 24) { const first = dieTexCache.keys().next().value; dieTexCache.get(first).forEach((t) => t.dispose()); dieTexCache.delete(first); }
    }
    dieMats.forEach((m, i) => { m.map = tex[i]; m.needsUpdate = true; });
  }
  // mode: 'idle' (floating, waiting for a roll) | 'rest' (showing a value) | 'hidden'
  function setDie(d) {
    if (!ready) return;
    if (d.skin) skinDie(d.skin, d.decal);
    dieState.mode = d.mode; dieState.canRoll = !!d.canRoll;
    if (d.arm != null) dieState.arm = d.arm;
    if (dieState.busy) return;
    die.visible = d.mode !== 'hidden';
    const s = dieSpot(dieState.arm);
    if (d.mode === 'idle') { die.position.set(s[0], DIE * 0.5 + 0.9, s[1]); }
    else if (d.mode === 'rest') { die.position.set(s[0], DIE * 0.5, s[1]); if (d.value) die.quaternion.copy(FACE_Q[d.value]); die.scale.setScalar(DIE); }
  }
  async function roll(arm, value, skin, decalUrl) {
    if (!ready) return;
    skinDie(skin, decalUrl);
    dieState.busy = true; dieState.arm = arm; dieState.mode = 'rest'; dieState.canRoll = false; die.visible = true; die.scale.setScalar(DIE);
    const from = loc(arm, -1.2, VE + 3.6), to = dieSpot(arm);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.2832);
    const qEnd = yaw.multiply(FACE_Q[value]);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize(), turns = (5 + Math.random() * 3) * Math.PI, spin = new THREE.Quaternion();
    const floor = DIE * 0.5, hits = [0.4, 0.68, 0.86, 0.96]; let hi = 0;
    snd('shake');
    await tween(1250, (e, k) => {
      const px = ease.out(k);
      die.position.x = lerp(from[0], to[0], px); die.position.z = lerp(from[1], to[1], px);
      let y;
      if (k < 0.4) y = 3.4 * (1 - (k / 0.4) * (k / 0.4));
      else if (k < 0.68) { const u = (k - 0.4) / 0.28; y = 1.5 * 4 * u * (1 - u); }
      else if (k < 0.86) { const u = (k - 0.68) / 0.18; y = 0.55 * 4 * u * (1 - u); }
      else if (k < 0.96) { const u = (k - 0.86) / 0.1; y = 0.14 * 4 * u * (1 - u); }
      else y = 0;
      die.position.y = floor + y;
      const rem = Math.pow(1 - Math.min(1, k / 0.93), 2);
      spin.setFromAxisAngle(axis, turns * rem); die.quaternion.copy(qEnd).multiply(spin);
      while (hi < hits.length && k >= hits[hi]) { snd('clack', 1 - hi * 0.22); if (hi === 0) burst(die.position.x, 0.1, die.position.z, '#ffffff', 5, 2, 1.5); hi++; }
    });
    die.quaternion.copy(qEnd);
    await tween(220, (e) => { die.scale.setScalar(DIE * (1 + 0.22 * Math.sin(e * Math.PI))); });
    dieState.busy = false;
  }

  // ------------------------------------------------------------------ marble moves
  function hop(mesh, a, b, ms, height, squash) {
    return tween(ms, (e, k) => {
      mesh.position.x = lerp(a.x, b.x, k); mesh.position.z = lerp(a.z, b.z, k);
      mesh.position.y = lerp(a.y, b.y, k) + Math.sin(Math.PI * k) * height;
      if (squash) { const sq = k > 0.85 ? 1 - (k - 0.85) * 1.2 : 1; mesh.scale.set(2 - sq, sq, 2 - sq); if (k >= 1) mesh.scale.setScalar(1); }
    });
  }
  // e = the 'move' event from the game core. onLand fires at the moment of impact.
  async function move(e, onLand) {
    const P = cfg.byId[e.pid], ms = marbles[e.pid];
    if (!ready || !P || !ms) { if (onLand) onLand(); return; }
    const mesh = ms[e.m], col = P.color;
    let prev = mesh.position.clone();
    if (e.kind === 'out') {
      snd('out');
      const dst = vecOf(e.to, P.arm, e.m);
      await hop(mesh, prev, dst, 480, 2.1, true);
      prev = dst;
    } else {
      for (let i = 0; i < e.path.length; i++) {
        const pos = e.path[i], dst = vecOf(pos, P.arm, e.m), ring = e.kind === 'ring' && i < e.hops, exit = e.kind === 'exit', center = pos === K.CENTER;
        if (ring || exit) { snd('zip', i); burst(prev.x, 0.2, prev.z, '#ffd75e', 4, 1.6, 2); await hop(mesh, prev, dst, exit ? 420 : 215, exit ? 1.8 : 1.15); }
        else if (center) { snd('center'); await tween(520, (ez, k) => { const an = k * 7, r = (1 - k) * 0.9; mesh.position.set(lerp(prev.x, dst.x, k) + Math.cos(an) * r * (1 - k), dst.y + Math.sin(Math.PI * k) * 1.4, lerp(prev.z, dst.z, k) + Math.sin(an) * r * (1 - k)); }); }
        else { snd('hop', i); await hop(mesh, prev, dst, 138, 0.5, i === e.path.length - 1); }
        prev = dst;
      }
    }
    mesh.position.copy(prev); mesh.scale.setScalar(1); mesh.userData.pos = e.to;
    if (onLand) onLand();
    if (e.bump) {
      const V = cfg.byId[e.bump.pid], vm = marbles[e.bump.pid] && marbles[e.bump.pid][e.bump.m];
      snd('bump'); shake(0.55); wave(prev.x, prev.z, '#ffffff', 4.5, 550);
      burst(prev.x, 0.4, prev.z, V ? V.color : '#fff', 26, 4.2, 5); burst(prev.x, 0.4, prev.z, col, 10, 3, 4);
      if (vm && V) {
        const a = vm.position.clone(), b = vecOf(K.BASE, V.arm, e.bump.m);
        vm.userData.pos = K.BASE;
        await tween(900, (ez, k) => { vm.position.x = lerp(a.x, b.x, k); vm.position.z = lerp(a.z, b.z, k); vm.position.y = MY + Math.sin(Math.PI * k) * 6.2; const s = 1 + Math.sin(Math.PI * k) * 0.35; vm.scale.setScalar(s); });
        vm.position.copy(b); vm.scale.setScalar(1);
        snd('thud'); burst(b.x, 0.15, b.z, V.color, 8, 1.6, 2);
      }
    } else if (e.home) {
      snd('home'); wave(prev.x, prev.z, col, 2.6, 700); burst(prev.x, 0.3, prev.z, col, 18, 1.8, 6);
      await tween(420, (ez, k) => { mesh.position.y = MY + Math.sin(Math.PI * k) * 0.8; });
    } else if (e.center) { wave(0, 0, '#7df3ff', 3.2, 700); burst(0, 0.3, 0, '#7df3ff', 14, 2.2, 4); }
    else if (e.star) { snd('shortcut'); wave(prev.x, prev.z, '#ffd75e', 2.8, 650); burst(prev.x, 0.3, prev.z, '#ffd75e', 12, 2, 4); }
    else if (e.kind === 'out') { wave(prev.x, prev.z, col, 2.2, 500); burst(prev.x, 0.3, prev.z, col, 10, 1.8, 3.5); }
    mesh.position.y = MY;
  }

  function celebrate(pid) {
    celebrating = pid ? { pid, t0: performance.now(), next: 0 } : null;
    if (!pid) for (const id in marbles) marbles[id].forEach((m) => { m.position.y = MY; });
  }

  // ------------------------------------------------------------------ choosing a move
  function setChoices(pid, moves, onPick) {
    clearChoices();
    if (!ready || !moves || !moves.length) return;
    const by = {}; moves.forEach((mv) => { (by[mv.m] = by[mv.m] || []).push(mv); });
    choice = { pid, moves, by, onPick, sel: null, hover: null, tags: [] };
    showMarks();
  }
  function clearChoices() {
    if (choice) choice.tags.forEach((t) => { removeAnchor(t); t.remove(); });
    choice = null;
    hiRings.forEach((r) => { r.visible = false; }); destMarks.forEach((d) => { d.visible = false; }); if (pathDots) pathDots.count = 0;
    for (const id in marbles) marbles[id].forEach((m) => { if (!celebrating) m.position.y = MY; });
    if (canvas) canvas.style.cursor = '';
  }
  function showMarks() {
    if (!choice) return;
    const P = cfg.byId[choice.pid], ms = marbles[choice.pid]; if (!P || !ms) return;
    choice.tags.forEach((t) => { removeAnchor(t); t.remove(); }); choice.tags = [];
    destMarks.forEach((d) => { d.visible = false; }); pathDots.count = 0;
    const active = choice.sel != null ? choice.sel : choice.hover;
    let i = 0;
    Object.keys(choice.by).forEach((m, n) => { const r = hiRings[n]; if (!r) return; r.visible = true; r.material.color.set(+m === active ? '#ffffff' : P.color); r.userData.mesh = ms[m]; });
    for (let n = Object.keys(choice.by).length; n < hiRings.length; n++) hiRings[n].visible = false;
    if (active == null) return;
    const list = choice.by[active] || [];
    list.forEach((mv) => {
      const d = destMarks[i++]; if (!d) return;
      const xz = posXZ(mv.to, P.arm, mv.m);
      d.visible = true; d.position.set(xz[0], 0, xz[1]); d.userData.move = mv;
      const c = mv.bump ? '#ff5a5f' : mv.to >= K.HOME0 ? '#7dff9a' : mv.to === K.CENTER ? '#7df3ff' : K.isStar(mv.to) ? '#ffd75e' : '#ffffff';
      d.children[0].material.color.set(c); d.children[1].material.color.set(P.color);
      let txt = null;
      if (mv.bump) { const V = cfg.players[mv.bump.p]; txt = '💥 Bump ' + (V ? V.name : ''); }
      else if (mv.to >= K.HOME0) txt = '🏠 Home';
      else if (mv.to === K.CENTER) txt = '🌀 Center';
      else if (mv.kind === 'ring') txt = '⚡ Shortcut';
      else if (K.isStar(mv.to) && list.length > 1) txt = '⚡ Pad';
      else if (list.length > 1) txt = '➜ Stay on track';
      if (txt && opts.overlay) {
        const el = document.createElement('div'); el.className = 'move-tag' + (mv.bump ? ' bump' : ''); el.textContent = txt;
        opts.overlay.appendChild(el); choice.tags.push(el);
        addAnchor(el, () => [xz[0], 1.35, xz[1]]);
      }
    });
    // dotted preview of the route (first option only if there is just one)
    if (list.length === 1) {
      const mv = list[0]; let n = 0;
      mv.path.slice(0, -1).forEach((pos) => { if (n >= 14) return; const xz = posXZ(pos, P.arm, mv.m); m4.makeTranslation(xz[0], 0.5, xz[1]); pathDots.setMatrixAt(n++, m4); });
      pathDots.count = n; pathDots.instanceMatrix.needsUpdate = true;
    }
  }
  function pickMarble(m) {
    if (!choice) return;
    const list = choice.by[m];
    if (!list) return;
    if (list.length === 1) { const cb = choice.onPick, id = list[0].id; clearChoices(); cb(id); return; }
    choice.sel = choice.sel === m ? null : m; snd('select'); showMarks();
  }

  // ------------------------------------------------------------------ input (orbit, zoom, taps)
  function toScreen(x, y, z) {
    tmp.set(x, y, z).project(camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, behind: tmp.z > 1 };
  }
  function hitTest(x, y, forTap) {
    const R = forTap ? 46 : 30;
    let best = null, bd = R;
    if (choice) {
      const P = cfg.byId[choice.pid], ms = marbles[choice.pid];
      destMarks.forEach((d) => { if (!d.visible) return; const s = toScreen(d.position.x, MY, d.position.z), dd = Math.hypot(s.x - x, s.y - y); if (dd < bd && (choice.sel != null || forTap)) { bd = dd; best = { type: 'dest', move: d.userData.move }; } });
      if (ms && P) ms.forEach((mesh, m) => {
        let key = choice.by[m] ? m : null;
        if (key == null && mesh.userData.pos === K.BASE) { const o = choice.moves.find((mv) => mv.kind === 'out'); if (o) key = o.m; }
        if (key == null) return;
        const s = toScreen(mesh.position.x, mesh.position.y, mesh.position.z), dd = Math.hypot(s.x - x, s.y - y) + (best && best.type === 'dest' ? 12 : 0);
        if (dd < bd) { bd = dd; best = { type: 'marble', m: key }; }
      });
    }
    if (!best && dieState.canRoll && die.visible) { const s = toScreen(die.position.x, die.position.y, die.position.z); if (Math.hypot(s.x - x, s.y - y) < (forTap ? 74 : 56)) best = { type: 'die' }; }
    return best;
  }
  function bindInput() {
    const pts = new Map(); let moved = 0, downAt = 0, pinch = 0;
    const xy = (ev) => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      pts.set(ev.pointerId, xy(ev)); if (pts.size === 1) { moved = 0; downAt = performance.now(); }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    });
    canvas.addEventListener('pointermove', (ev) => {
      const p = xy(ev), last = pts.get(ev.pointerId);
      if (!last) { // hover
        const h = hitTest(p[0], p[1], false);
        canvas.style.cursor = h ? 'pointer' : '';
        if (choice && choice.sel == null) { const hm = h && h.type === 'marble' ? h.m : null; if (hm !== choice.hover) { choice.hover = hm; showMarks(); } }
        return;
      }
      const dx = p[0] - last[0], dy = p[1] - last[1]; pts.set(ev.pointerId, p);
      if (pts.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 8) { cam.tAz -= dx * 0.006; cam.tPol = Math.max(0.04, Math.min(1.22, cam.tPol - dy * 0.005)); cam.top = cam.tPol < 0.2; }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) cam.tZoom = Math.max(0.5, Math.min(1.7, cam.tZoom * (pinch / d)));
        pinch = d; moved = 99;
      }
    });
    const up = (ev) => {
      const p = pts.get(ev.pointerId); pts.delete(ev.pointerId);
      if (!p || pts.size) return;
      if (moved <= 8 && performance.now() - downAt < 600) tap(p[0], p[1], ev.pointerType !== 'mouse');
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', (ev) => pts.delete(ev.pointerId));
    canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.tZoom = Math.max(0.5, Math.min(1.7, cam.tZoom * (ev.deltaY > 0 ? 1.08 : 0.92))); }, { passive: false });
  }
  function tap(x, y) {
    const h = hitTest(x, y, true);
    if (!h) { if (choice && choice.sel != null) { choice.sel = null; showMarks(); } return; }
    if (h.type === 'die') { if (opts.onRollTap) opts.onRollTap(); }
    else if (h.type === 'dest') { const cb = choice.onPick, id = h.move.id; clearChoices(); cb(id); }
    else if (h.type === 'marble') pickMarble(h.m);
  }

  // ------------------------------------------------------------------ camera + HTML anchors
  function setView(arm, instant) {
    const target = (arm * Math.PI) / 3;
    let d = target - cam.tAz; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    cam.tAz += d; if (instant) cam.az = cam.tAz;
  }
  function toggleTop() { cam.top = !cam.top; cam.tPol = cam.top ? 0.04 : defaultPol(); return cam.top; }
  function resetView(arm) { cam.top = false; cam.tPol = defaultPol(); cam.tZoom = 1; if (arm != null) setView(arm); }
  function addAnchor(el, get, clamp) { anchors.push({ el, get, clamp }); }
  function removeAnchor(el) { const i = anchors.findIndex((a) => a.el === el); if (i >= 0) anchors.splice(i, 1); }
  // name badges sit to the left of each lane (the die lands on the right); on tall phone screens they move further out
  const portrait = () => canvas.clientWidth / (canvas.clientHeight || 1) < 0.8;
  const seatWorld = (arm) => { const p = portrait() ? loc(arm, 3.4, VE + 5.4) : loc(arm, 5.0, VE + 2.5); return [p[0], 0.3, p[1]]; };
  const defaultPol = () => (portrait() ? 0.6 : 0.86);
  const dieWorld = () => [die.position.x, die.position.y + 1.3, die.position.z];

  // Find the closest camera distance (and a small pan) that keeps the whole board inside the free part of the screen.
  const fitCam = new THREE.PerspectiveCamera(); let fitKey = '', fitRes = { d: 30, t: 0 };
  function computeFit(w, h, pad) {
    const key = [w, h, pad.top, pad.bottom, cam.pol.toFixed(3)].join('|');
    if (key === fitKey) return fitRes;
    fitKey = key;
    fitCam.fov = camera.fov; fitCam.aspect = w / h; fitCam.near = 0.5; fitCam.far = 400; fitCam.updateProjectionMatrix();
    const sp = Math.sin(cam.pol), cp = Math.cos(cam.pol), R = RB * 1.02;
    const yTop = 1 - (2 * (pad.top + 44)) / h, yBot = -1 + (2 * (pad.bottom + 8)) / h, xLim = 1 - 28 / w, yc = (yTop + yBot) / 2;
    const measure = (d, t) => {
      fitCam.position.set(0, cp * d, sp * d + t); fitCam.up.set(0, 1, 0); if (cam.pol < 0.08) fitCam.up.set(0, 0, -1);
      fitCam.lookAt(0, 0, t); fitCam.updateMatrixWorld(true); fitCam.matrixWorldInverse.copy(fitCam.matrixWorld).invert();
      let x = 0, y0 = 9, y1 = -9;
      for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.2832; tmp.set(Math.cos(a) * R, 0, Math.sin(a) * R).project(fitCam); x = Math.max(x, Math.abs(tmp.x)); y0 = Math.min(y0, tmp.y); y1 = Math.max(y1, tmp.y); }
      return { x, y0, y1 };
    };
    let lo = 12, hi = 160, best = { d: hi, t: 0 };
    for (let it = 0; it < 14; it++) {
      const d = (lo + hi) / 2;
      let a = -RB, b = RB, t = 0, m = null;
      for (let j = 0; j < 9; j++) { t = (a + b) / 2; m = measure(d, t); if ((m.y0 + m.y1) / 2 < yc) a = t; else b = t; }
      if (m.x <= xLim && m.y1 - m.y0 <= yTop - yBot) { best = { d, t }; hi = d; } else lo = d;
    }
    fitRes = best; return best;
  }

  let lastT = 0, lastW = 0, lastH = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - lastT) / 1000 || 0.016, dt = Math.min(0.05, raw); lastT = now;
    stepTweens(now);
    if (!canvas.clientWidth || !canvas.clientHeight) { born = 0; return; } // board is not on screen
    // slow phone or laptop? trade sharpness, then shadows, for a smooth game
    if (!born) born = now;
    if (quality > 0 && now - born > 2500 && !document.hidden) {
      slowN = raw > 0.042 ? slowN + 1 : Math.max(0, slowN - 2);
      if (slowN > 40) { slowN = 0; quality--; if (quality === 1 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); lastW = 0; } else { quality = 0; sun.castShadow = false; } }
    }
    if (canvas.clientWidth !== lastW || canvas.clientHeight !== lastH) { const was = lastW ? lastW / lastH < 0.8 : null; lastW = canvas.clientWidth; lastH = canvas.clientHeight; resize(); if (!cam.top && was !== portrait()) { cam.tPol = defaultPol(); if (was === null) cam.pol = cam.tPol; } }
    const t = now / 1000;
    // camera
    const kk = 1 - Math.pow(0.001, dt);
    cam.az = lerp(cam.az, cam.tAz, kk); cam.pol = lerp(cam.pol, cam.tPol, kk); cam.zoom = lerp(cam.zoom, cam.tZoom, kk);
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    const pad = opts.pad ? opts.pad() : { top: 0, bottom: 0 };
    const fit = computeFit(w, h, pad), dist = fit.d * cam.zoom;
    const sp = Math.sin(cam.pol), cp = Math.cos(cam.pol), sa = Math.sin(cam.az), ca = Math.cos(cam.az);
    const tx = -sa * fit.t, tz = ca * fit.t;
    camera.position.set(tx - sa * sp * dist, cp * dist, tz + ca * sp * dist);
    camera.up.set(0, 1, 0); if (cam.pol < 0.08) camera.up.set(sa, 0, -ca);
    camera.lookAt(tx, 0, tz);
    if (shakeAmt > 0.01) { camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt; shakeAmt *= Math.pow(0.02, dt); }

    // idle life
    padGlows.forEach((m, i) => { m.material.opacity = 0.28 + 0.22 * Math.sin(t * 2.2 + i); if (i === 6) m.rotation.z = t * 0.8; });
    if (sparkles) { sparkles.rotation.y = t * 0.02; sparkles.position.y = Math.sin(t * 0.3) * 0.4; }
    if (choice) {
      const ms = marbles[choice.pid];
      hiRings.forEach((r) => { if (!r.visible || !r.userData.mesh) return; const mm = r.userData.mesh; r.position.set(mm.position.x, 0.05, mm.position.z); r.scale.setScalar(1 + 0.18 * Math.sin(t * 6)); r.material.opacity = 0.65 + 0.3 * Math.sin(t * 6); });
      if (ms) Object.keys(choice.by).forEach((m) => { ms[m].position.y = MY + Math.abs(Math.sin(t * 4.5 + m)) * (+m === choice.sel ? 0.5 : 0.24); });
      destMarks.forEach((d) => { if (!d.visible) return; d.children[0].scale.setScalar(1 + 0.2 * Math.sin(t * 7)); d.children[1].position.y = MY + 0.12 + 0.1 * Math.sin(t * 5); });
    }
    if (!dieState.busy && die.visible && dieState.mode === 'idle') {
      const s = dieSpot(dieState.arm);
      die.position.set(s[0], DIE * 0.5 + 0.9 + Math.sin(t * 2.6) * 0.18, s[1]);
      die.rotation.set(t * 0.9, t * 1.3, t * 0.5);
      die.scale.setScalar(DIE * (dieState.canRoll ? 1.06 + 0.07 * Math.sin(t * 6) : 1));
    }
    if (celebrating) {
      const ms = marbles[celebrating.pid], P = cfg.byId[celebrating.pid];
      if (ms) ms.forEach((m, i) => { m.position.y = MY + Math.abs(Math.sin(t * 5 + i * 0.8)) * 1.1; });
      if (now > celebrating.next && now - celebrating.t0 < 9000) {
        celebrating.next = now + 380 + Math.random() * 300;
        const a = Math.random() * 6.28, r = Math.random() * 9, cols = ['#ff5a5f', '#ffd23f', '#7dff9a', '#7df3ff', '#c08bff', P ? P.color : '#fff'];
        burst(Math.cos(a) * r, 3 + Math.random() * 4, Math.sin(a) * r, cols[Math.floor(Math.random() * cols.length)], 26, 4.5, 3); snd('firework');
      }
      cam.tAz += dt * 0.18;
    }
    stepParts(dt);
    renderer.render(scene, camera);
    // HTML bits pinned to 3D spots
    for (const a of anchors) {
      const p = a.get(); if (!p) { a.el.style.visibility = 'hidden'; continue; }
      const s = toScreen(p[0], p[1], p[2]);
      let x = s.x, y = s.y;
      if (a.clamp) { const c = a.clamp(x, y, w, h); x = Math.max(c.l, Math.min(w - c.r, x)); y = Math.max(c.t, Math.min(h - c.b, y)); }
      a.el.style.visibility = s.behind ? 'hidden' : 'visible';
      a.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
    }
    if (opts.onFrame) opts.onFrame();
  }

  return {
    init, configure, snap, setDie, roll, move, setChoices, clearChoices, celebrate, setView, toggleTop, resetView, shake, burst, wave,
    addAnchor, removeAnchor, seatWorld, dieWorld, toScreen, wait,
    setSpeed(s) { speed = s; }, get ready() { return ready; }, get busyDie() { return dieState.busy; },
    posXZ, trackXZ, repaint() { if (ready) paintBoard(); },
  };
})();
