// Custom dice: body + dot colors, printed patterns (camo, cheetah, zebra...), and an uploaded decal.
// Every face is painted on a canvas, then used both by the 3D die and by the little preview cube.
window.DiceSkins = (function () {
  const PATTERNS = [
    { id: 'solid', name: 'Solid' }, { id: 'camo', name: 'Camo' }, { id: 'cheetah', name: 'Cheetah' }, { id: 'zebra', name: 'Zebra' },
    { id: 'tiger', name: 'Tiger' }, { id: 'cow', name: 'Cow' }, { id: 'giraffe', name: 'Giraffe' }, { id: 'flames', name: 'Flames' },
    { id: 'galaxy', name: 'Galaxy' }, { id: 'tiedye', name: 'Tie-dye' }, { id: 'checker', name: 'Checkers' }, { id: 'glitter', name: 'Glitter' },
    { id: 'lava', name: 'Lava' }, { id: 'ocean', name: 'Ocean' },
  ];
  const SWATCHES = ['#ffffff', '#1d1d28', '#ff3b4e', '#ff8a1f', '#ffd21f', '#35d65a', '#18d3c5', '#3d7bff', '#a259ff', '#ff5fb8', '#8b5a2b', '#5b6b3a', '#d9b26f', '#9aa3b2'];
  // order the 3D box uses its six faces in: +x, -x, +y, -y, +z, -z  (opposite sides add up to 7)
  const FACE_VALUES = [2, 5, 1, 6, 3, 4];
  const PRESETS = [
    { name: 'Classic', body: '#ffffff', pip: '#1d1d28', pattern: 'solid' },
    { name: 'Woodland', body: '#5b6b3a', pip: '#ffffff', pattern: 'camo' },
    { name: 'Cheetah', body: '#d9a856', pip: '#ffffff', pattern: 'cheetah' },
    { name: 'Zebra', body: '#ffffff', pip: '#ff3b4e', pattern: 'zebra' },
    { name: 'Tiger', body: '#ff8a1f', pip: '#ffffff', pattern: 'tiger' },
    { name: 'Moo', body: '#ffffff', pip: '#ff5fb8', pattern: 'cow' },
    { name: 'Hot Rod', body: '#1d1d28', pip: '#ffffff', pattern: 'flames' },
    { name: 'Deep Space', body: '#a259ff', pip: '#ffffff', pattern: 'galaxy' },
    { name: 'Pink Camo', body: '#ff5fb8', pip: '#ffffff', pattern: 'camo' },
  ];

  // ---- color helpers
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hsl(hex) {
    let [r, g, b] = rgb(hex).map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  const css = (h, s, l, a) => `hsla(${((h % 360) + 360) % 360},${Math.max(0, Math.min(100, s))}%,${Math.max(0, Math.min(100, l))}%,${a == null ? 1 : a})`;
  function tone(hex, dl, ds, dh, a) { const [h, s, l] = hsl(hex); return css(h + (dh || 0), s + (ds || 0), l + dl, a); }
  const lum = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function blob(g, r, x, y, rad, n, wob) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, rr = rad * (1 - wob + r() * wob * 2); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) g.moveTo(mx, my);
      const p2 = pts[(i + 1) % n], q2 = pts[(i + 2) % n];
      g.quadraticCurveTo(p2[0], p2[1], (p2[0] + q2[0]) / 2, (p2[1] + q2[1]) / 2);
    }
    g.closePath();
  }

  // ---- pattern painters (S = face size in px)
  const paint = {
    solid(g, S, c) { g.fillStyle = c; g.fillRect(0, 0, S, S); },
    camo(g, S, c, r) {
      g.fillStyle = c; g.fillRect(0, 0, S, S);
      const tones = [tone(c, -16, -8), tone(c, 13, -18), tone(c, -32, -5)];
      tones.forEach((t, ti) => { g.fillStyle = t; for (let i = 0; i < 7 - ti; i++) { blob(g, r, r() * S, r() * S, S * (0.1 + r() * 0.13), 7, 0.45); g.fill(); } });
    },
    cheetah(g, S, c, r) {
      const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, tone(c, 8)); gr.addColorStop(1, tone(c, -8)); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 26; i++) {
        const x = ((i % 5) + 0.15 + r() * 0.7) * S / 5, y = (Math.floor(i / 5) + 0.15 + r() * 0.7) * S / 5.2, rad = S * (0.035 + r() * 0.03);
        g.fillStyle = tone(c, -22, 10); blob(g, r, x, y, rad, 6, 0.3); g.fill();
        g.strokeStyle = '#1c130c'; g.lineCap = 'round'; g.lineWidth = rad * 0.75;
        const a0 = r() * 6.28, parts = 2 + Math.floor(r() * 2);
        for (let k = 0; k < parts; k++) { const a = a0 + (k * 6.28) / parts; g.beginPath(); g.arc(x, y, rad * 1.25, a, a + 6.28 / parts - 0.7); g.stroke(); }
      }
    },
    zebra(g, S, c, r) {
      g.fillStyle = c; g.fillRect(0, 0, S, S);
      g.fillStyle = lum(c) > 0.35 ? '#14141a' : '#f4f1e8';
      const ph = r() * 6;
      for (let i = -2; i < 9; i++) {
        g.beginPath();
        for (let y = 0; y <= S; y += S / 16) { const x = (i + 0.5) * S / 6 + Math.sin(y / S * 5 + ph + i) * S * 0.07 + y * 0.25; y === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
        for (let y = S; y >= 0; y -= S / 16) { const w = S * (0.045 + 0.035 * Math.sin(y / S * 7 + i * 2)); const x = (i + 0.5) * S / 6 + Math.sin(y / S * 5 + ph + i) * S * 0.07 + y * 0.25 + w * 1.6; g.lineTo(x, y); }
        g.closePath(); g.fill();
      }
    },
    tiger(g, S, c, r) {
      const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, tone(c, 6)); gr.addColorStop(1, tone(c, -10)); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      g.fillStyle = '#17110c';
      for (let i = 0; i < 9; i++) {
        const y = (i + 0.3 + r() * 0.5) * S / 9, left = i % 2 === 0, len = S * (0.38 + r() * 0.3), th = S * (0.03 + r() * 0.03), bend = (r() - 0.5) * S * 0.14;
        const x0 = left ? 0 : S, x1 = left ? len : S - len;
        g.beginPath(); g.moveTo(x0, y - th); g.quadraticCurveTo((x0 + x1) / 2, y - th + bend, x1, y + bend * 0.6); g.quadraticCurveTo((x0 + x1) / 2, y + th + bend, x0, y + th); g.closePath(); g.fill();
      }
    },
    cow(g, S, c, r) {
      g.fillStyle = c; g.fillRect(0, 0, S, S);
      g.fillStyle = lum(c) > 0.35 ? '#17171c' : '#f4f1e8';
      for (let i = 0; i < 5; i++) { blob(g, r, r() * S, r() * S, S * (0.14 + r() * 0.14), 8, 0.4); g.fill(); }
    },
    giraffe(g, S, c, r) {
      g.fillStyle = tone(c, 34, -10); g.fillRect(0, 0, S, S);
      const n = 4, pts = [];
      for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) pts.push([(x + (r() - 0.5) * 0.5) * S / n, (y + (r() - 0.5) * 0.5) * S / n]);
      g.fillStyle = tone(c, -8, 5); g.lineJoin = 'round';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const q = [pts[y * (n + 1) + x], pts[y * (n + 1) + x + 1], pts[(y + 1) * (n + 1) + x + 1], pts[(y + 1) * (n + 1) + x]];
        const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
        g.beginPath(); q.forEach((p, i) => { const px = cx + (p[0] - cx) * 0.84, py = cy + (p[1] - cy) * 0.84; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); g.fill();
      }
    },
    flames(g, S, c, r) {
      const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, tone(c, -12)); gr.addColorStop(1, tone(c, 4)); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      [['#d81e1e', 0.78, 7], ['#ff7a1a', 0.6, 6], ['#ffd53d', 0.4, 5]].forEach(([col, h, n], li) => {
        g.fillStyle = col; g.beginPath(); g.moveTo(0, S);
        for (let i = 0; i < n; i++) {
          const x0 = (i / n) * S, x1 = ((i + 1) / n) * S, tip = S - S * h * (0.55 + r() * 0.5), lean = (r() - 0.3) * S * 0.12;
          g.lineTo(x0, S - S * h * 0.25);
          g.bezierCurveTo(x0 + (x1 - x0) * 0.1, S - S * h * 0.6, x0 + (x1 - x0) * 0.6 + lean, tip + S * 0.12, x0 + (x1 - x0) * 0.5 + lean, tip);
          g.bezierCurveTo(x0 + (x1 - x0) * 0.75, tip + S * 0.16, x1 - (x1 - x0) * 0.1, S - S * h * 0.5, x1, S - S * h * 0.25);
        }
        g.lineTo(S, S); g.closePath(); g.fill();
      });
    },
    galaxy(g, S, c, r) {
      const [h] = hsl(c);
      const gr = g.createRadialGradient(S * 0.5, S * 0.5, 0, S * 0.5, S * 0.5, S * 0.75); gr.addColorStop(0, css(h, 55, 20)); gr.addColorStop(1, css(h + 30, 60, 5)); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x = r() * S, y = r() * S, rad = S * (0.2 + r() * 0.25), n = g.createRadialGradient(x, y, 0, x, y, rad);
        n.addColorStop(0, css(h + (r() - 0.5) * 120, 90, 55, 0.5)); n.addColorStop(1, css(h, 90, 50, 0)); g.fillStyle = n; g.fillRect(0, 0, S, S);
      }
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`; const s = r() < 0.12 ? S * 0.012 : S * 0.005; g.beginPath(); g.arc(r() * S, r() * S, s, 0, 6.28); g.fill(); }
    },
    tiedye(g, S, c, r) {
      const [h0] = hsl(c), cx = S * (0.4 + r() * 0.2), cy = S * (0.4 + r() * 0.2), rings = 9, wedges = 40, R = S * 0.95;
      for (let k = rings; k >= 1; k--) for (let i = 0; i < wedges; i++) {
        const a0 = (i / wedges) * 6.2832 + k * 0.5, a1 = ((i + 1) / wedges) * 6.2832 + k * 0.5 + 0.02;
        g.fillStyle = css(h0 + (i / wedges) * 360 * 2 + k * 14, 88, 56 + 6 * Math.sin(k + i));
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, (R * k) / rings, a0, a1); g.closePath(); g.fill();
      }
    },
    checker(g, S, c) {
      const n = 4, d = tone(c, lum(c) > 0.5 ? -48 : 34, -5);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? d : c; g.fillRect((x * S) / n, (y * S) / n, S / n + 1, S / n + 1); }
    },
    glitter(g, S, c, r) {
      g.fillStyle = c; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.6 ? tone(c, 22 + r() * 22, 0, 0, 0.9) : tone(c, -18 - r() * 14, 0, 0, 0.8); const s = S * (0.004 + r() * 0.009); g.fillRect(r() * S, r() * S, s, s); }
      g.fillStyle = '#fff';
      for (let i = 0; i < 14; i++) { const x = r() * S, y = r() * S, s = S * (0.012 + r() * 0.02); g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s); g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill(); }
    },
    lava(g, S, c, r) {
      g.fillStyle = '#1a1210'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(60,44,40,${0.4 + r() * 0.4})`; blob(g, r, r() * S, r() * S, S * (0.08 + r() * 0.1), 7, 0.4); g.fill(); }
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 8; i++) {
        const rr = rng(i * 77 + 5 + Math.floor(r() * 0)), hot = pass ? '#ffe36b' : tone(c, 0, 20);
        g.strokeStyle = hot; g.lineWidth = pass ? S * 0.008 : S * 0.028; g.shadowColor = tone(c, 5, 20); g.shadowBlur = pass ? 0 : S * 0.05;
        let x = rr() * S, y = rr() * S; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (rr() - 0.5) * S * 0.36; y += (rr() - 0.5) * S * 0.36; g.lineTo(x, y); }
        g.stroke();
      }
      g.shadowBlur = 0;
    },
    ocean(g, S, c, r) {
      const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, tone(c, 18, 0, -10)); gr.addColorStop(1, tone(c, -22, 5, 12)); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 7; i++) {
        const y0 = (i + 0.4) * S / 7, ph = r() * 6, amp = S * (0.02 + r() * 0.02);
        g.fillStyle = tone(c, -6 - i * 3, 0, i * 3, 0.55); g.beginPath(); g.moveTo(0, S);
        for (let x = 0; x <= S; x += S / 24) g.lineTo(x, y0 + Math.sin((x / S) * 9 + ph) * amp);
        g.lineTo(S, S); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = S * 0.008; g.beginPath();
        for (let x = 0; x <= S; x += S / 24) { const y = y0 + Math.sin((x / S) * 9 + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    },
  };

  const PIPS = { 1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]], 4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]], 6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]] };

  function drawFace(canvas, skin, value, decal) {
    const S = canvas.width, g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.shadowBlur = 0;
    const seed = value * 9973 + skin.pattern.length * 131 + parseInt(skin.body.slice(1), 16);
    g.save(); (paint[skin.pattern] || paint.solid)(g, S, skin.body, rng(seed)); g.restore();
    // soft shading so the cube reads as 3D even with a flat print
    const sh = g.createRadialGradient(S * 0.35, S * 0.3, S * 0.05, S * 0.5, S * 0.5, S * 0.78);
    sh.addColorStop(0, 'rgba(255,255,255,.2)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.26)');
    g.fillStyle = sh; g.fillRect(0, 0, S, S);
    const logoFace = decal && skin.decalMode !== 'all' && value === 1;
    if (decal && (skin.decalMode === 'all' || logoFace)) {
      const box = S * (logoFace ? 0.74 : 0.86), w = decal.naturalWidth || decal.width || 1, h = decal.naturalHeight || decal.height || 1, sc = Math.min(box / w, box / h);
      g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = S * 0.03; g.shadowOffsetY = S * 0.012;
      try { g.drawImage(decal, (S - w * sc) / 2, (S - h * sc) / 2, w * sc, h * sc); } catch (e) {}
      g.restore();
    }
    if (!logoFace) {
      const pr = S * (value === 1 ? 0.125 : 0.092), dark = lum(skin.pip) < 0.5;
      for (const [x, y] of PIPS[value]) {
        g.beginPath(); g.arc(x * S, y * S + S * 0.012, pr * 1.08, 0, 6.2832); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
        g.beginPath(); g.arc(x * S, y * S, pr, 0, 6.2832); g.fillStyle = skin.pip; g.fill();
        g.lineWidth = S * 0.014; g.strokeStyle = dark ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.65)'; g.stroke();
        g.beginPath(); g.arc(x * S - pr * 0.3, y * S - pr * 0.32, pr * 0.28, 0, 6.2832); g.fillStyle = dark ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.7)'; g.fill();
      }
    }
    return canvas;
  }
  function faceCanvas(skin, value, decal, size) { const c = document.createElement('canvas'); c.width = c.height = size || 256; return drawFace(c, skin, value, decal); }
  const key = (skin, decalUrl) => [skin.body, skin.pip, skin.pattern, skin.decalMode, decalUrl ? decalUrl.length + ':' + decalUrl.slice(-24) : ''].join('|');

  // ---- decal images (uploaded SVG / PNG / JPG, always flattened to a small PNG before it is shared)
  const imgCache = new Map();
  function img(url, onReady) {
    if (!url) return null;
    let e = imgCache.get(url);
    if (!e) {
      e = { im: new Image(), ok: false, cbs: [] };
      e.im.onload = () => { e.ok = true; e.cbs.splice(0).forEach((f) => f()); };
      e.im.src = url; imgCache.set(url, e);
    }
    if (e.ok) return e.im;
    if (onReady) e.cbs.push(onReady);
    return null;
  }
  const loadImg = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("That picture couldn't be opened.")); im.src = url; });
  const readUrl = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error("That file couldn't be read.")); fr.readAsDataURL(file); });
  async function fileToDecal(file) {
    if (file.size > 4e6) throw new Error('That file is too big (4 MB max).');
    let url;
    if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) {
      const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
      const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error("That SVG couldn't be read.");
      doc.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
      if (!svg.getAttribute('viewBox')) { const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height')); if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`); }
      svg.setAttribute('width', '512'); svg.setAttribute('height', '512');
      url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    } else if (/^image\//.test(file.type)) url = await readUrl(file);
    else throw new Error('Use an SVG, PNG or JPG file.');
    const im = await loadImg(url);
    for (const size of [256, 180, 128, 96]) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const w = im.naturalWidth || 512, h = im.naturalHeight || 512, sc = Math.min(size / w, size / h);
      c.getContext('2d').drawImage(im, (size - w * sc) / 2, (size - h * sc) / 2, w * sc, h * sc);
      const out = c.toDataURL('image/png');
      if (out.length < 190000) return out;
    }
    throw new Error('That picture is too detailed — try a simpler one.');
  }

  // ---- CSS preview cube
  function cube(el, skin, decalUrl) {
    const decal = img(decalUrl, () => cube(el, skin, decalUrl));
    if (!el.firstChild) el.innerHTML = '<div class="cube">' + [1, 2, 3, 4, 5, 6].map((v) => `<i class="f f${v}"></i>`).join('') + '</div>';
    for (let v = 1; v <= 6; v++) el.querySelector('.f' + v).style.backgroundImage = `url(${faceCanvas(skin, v, decal, 128).toDataURL()})`;
  }
  function chip(skin, size) { return faceCanvas(Object.assign({ decalMode: 'one' }, skin), 5, null, size || 64).toDataURL(); }

  return { PATTERNS, SWATCHES, PRESETS, FACE_VALUES, drawFace, faceCanvas, key, img, fileToDecal, cube, chip, lum };
})();
