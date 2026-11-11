/* Kartopu Taburu — lane-picking crowd shooter. Plain script, expects global THREE. */
(function () {
  'use strict';
  const T = window.THREE;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ------------------------------------------------------------------ */
  /* Language                                                            */
  /* ------------------------------------------------------------------ */
  const STR = {
    tr: {
      title1: 'KARTOPU', title2: 'TABURU', tagline: 'Şeridini seç · Taburu büyüt · Hattı savun',
      level: 'Bölüm', play: 'OYNA', next: 'DEVAM', retry: 'TEKRAR DENE',
      winTitle: 'BÖLÜM TAMAM!', loseTitle: 'TABUR DAĞILDI',
      rowSaved: 'Ayakta kalan penguen', rowKills: 'Söndürülen kor', rowCoins: 'Kazanılan altın',
      loseTip: 'Altınlarınla taburu güçlendir, sonra tekrar dene.',
      hintDrag: 'Sürükle, taburu yönlendir', bossName: 'VOLKAN DEVİ',
      winSub: '{n}. bölüm temizlendi', loseSub: 'Yolun %{p} kadarını geçtin',
      bLanes: 'ŞERİDİNİ SEÇ!', bRush: 'KOR DALGASI!', bCharge: 'MOR KAPIYI VUR, BÜYÜT!',
      bPools: 'LAVDAN KAÇ!', bFinale: 'SON SAVUNMA!', bGo: 'HAYDİ!',
      uStart: 'Tabur', uStartD: '{n} penguenle başla',
      uDmg: 'Kartopu Gücü', uDmgD: 'Hasar ×{n}',
      uRate: 'Atış Hızı', uRateD: 'Saniyede {n} atış',
      uGold: 'Ganimet', uGoldD: 'Altın ×{n}',
      noWebgl: 'Bu cihazda 3D grafik (WebGL) açılamadı. Tarayıcını güncelleyip tekrar dene.',
      sound: 'Ses',
    },
    en: {
      title1: 'SNOWBALL', title2: 'BATTALION', tagline: 'Pick a lane · Grow the squad · Hold the line',
      level: 'Level', play: 'PLAY', next: 'CONTINUE', retry: 'TRY AGAIN',
      winTitle: 'LEVEL CLEAR!', loseTitle: 'SQUAD WIPED OUT',
      rowSaved: 'Penguins standing', rowKills: 'Embers put out', rowCoins: 'Gold earned',
      loseTip: 'Spend your gold on upgrades, then try again.',
      hintDrag: 'Drag to steer the squad', bossName: 'VOLCANO GIANT',
      winSub: 'Level {n} cleared', loseSub: 'You made it {p}% of the way',
      bLanes: 'PICK YOUR SIDE!', bRush: 'EMBER WAVE!', bCharge: 'SHOOT THE PURPLE GATE!',
      bPools: 'DODGE THE LAVA!', bFinale: 'LAST STAND!', bGo: 'GO!',
      uStart: 'Squad', uStartD: 'Start with {n}',
      uDmg: 'Snowball Power', uDmgD: 'Damage ×{n}',
      uRate: 'Fire Rate', uRateD: '{n} shots per second',
      uGold: 'Loot', uGoldD: 'Gold ×{n}',
      noWebgl: 'Could not start 3D graphics (WebGL) on this device. Update your browser and try again.',
      sound: 'Sound',
    },
  };
  const LANG = /^tr/i.test(navigator.language || 'tr') ? 'tr' : 'en';
  const t = (k, vars) => {
    let s = STR[LANG][k] || k;
    if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  };
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('mute').setAttribute('aria-label', t('sound'));

  /* ------------------------------------------------------------------ */
  /* Save data and upgrades                                              */
  /* ------------------------------------------------------------------ */
  const SAVE_KEY = 'kartopu-taburu-v1';
  const save = { level: 1, coins: 0, upg: { start: 0, dmg: 0, rate: 0, gold: 0 }, mute: false, seenHint: 0 };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') {
      save.level = Math.max(1, s.level | 0) || 1;
      save.coins = Math.max(0, s.coins | 0);
      save.mute = !!s.mute;
      save.seenHint = s.seenHint | 0;
      for (const k in save.upg) save.upg[k] = Math.max(0, (s.upg && s.upg[k]) | 0);
    }
  } catch (e) { /* storage unavailable: play without persistence */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

  const RATE0 = 2;
  const UPG = {
    start: { base: 40, grow: 1.35, val: (l) => 1 + l + Math.floor((l * l) / 6) },
    dmg: { base: 50, grow: 1.35, val: (l) => Math.pow(1.15, l) },
    rate: { base: 50, grow: 1.35, val: (l) => RATE0 * Math.pow(1.07, l) },
    gold: { base: 60, grow: 1.38, val: (l) => 1 + 0.1 * l },
  };
  const stat = (k) => UPG[k].val(save.upg[k]);
  const cost = (k) => Math.round((UPG[k].base * Math.pow(UPG[k].grow, save.upg[k])) / 5) * 5;
  const fmt = (n) => {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return String(n);
  };

  /* ------------------------------------------------------------------ */
  /* Audio (synthesised, starts on first tap)                            */
  /* ------------------------------------------------------------------ */
  let ac = null, master = null, noiseBuf = null, silent = false;
  function audioInit() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.55;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  function tone(f, dur, type, vol, f2, delay) {
    if (!ac || save.mute || silent) return;
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    if (!ac || save.mute || silent) return;
    const t0 = ac.currentTime;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }
  const lastSfx = {};
  function throttled(name, ms) {
    const now = performance.now();
    if (now - (lastSfx[name] || 0) < ms) return false;
    lastSfx[name] = now;
    return true;
  }
  const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
  let combo = 0, comboT = 0;
  const sfx = {
    gate() {
      if (time - comboT > 1.2) combo = 0;
      comboT = time;
      const f = SCALE[Math.min(combo, SCALE.length - 1)];
      combo++;
      tone(f, 0.16, 'triangle', 0.22);
      tone(f * 2, 0.1, 'sine', 0.08, 0, 0.03);
    },
    bad() { tone(220, 0.25, 'sawtooth', 0.14, 110); },
    pop() { if (throttled('pop', 45)) noise(0.07, 0.16, 1800 + Math.random() * 900); },
    thud() { if (throttled('thud', 60)) noise(0.05, 0.12, 500); },
    lose1() { if (throttled('l1', 70)) tone(180, 0.12, 'square', 0.1, 90); },
    crack() { noise(0.3, 0.3, 900); tone(300, 0.2, 'triangle', 0.15, 120); },
    charge(v) { if (throttled('chg', 60)) tone(400 + v * 30, 0.06, 'square', 0.06); },
    boss() { if (throttled('boss', 80)) tone(90, 0.1, 'sawtooth', 0.12, 60); },
    click() { tone(660, 0.06, 'triangle', 0.15); },
    buy() { tone(660, 0.08, 'triangle', 0.18); tone(990, 0.14, 'triangle', 0.18, 0, 0.07); },
    nope() { tone(160, 0.12, 'square', 0.08); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, 'triangle', 0.2, 0, i * 0.11)); },
    fail() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.1, 0, i * 0.16)); },
    roar() { tone(70, 0.9, 'sawtooth', 0.22, 40); noise(0.8, 0.2, 200); },
  };
  const buzz = (ms) => { if (!silent && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } };

  /* ------------------------------------------------------------------ */
  /* Renderer, scene, camera                                             */
  /* ------------------------------------------------------------------ */
  const stage = $('stage');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    $('fatal').hidden = false;
    $('fatal').textContent = t('noWebgl');
    $('home').hidden = true;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const HORIZON = 0x8fdcec;
  const scene = new T.Scene();
  scene.fog = new T.Fog(HORIZON, 48, 125);
  const camera = new T.PerspectiveCamera(70, 0.5, 0.5, 320);

  function skyTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#0a1038');
    g.addColorStop(0.07, '#1d2f7c');
    g.addColorStop(0.13, '#3f7fc4');
    g.addColorStop(0.19, '#8fdcec');
    g.addColorStop(1, '#8fdcec');
    x.fillStyle = g; x.fillRect(0, 0, 256, 512);
    // aurora ribbons near the top
    for (let i = 0; i < 26; i++) {
      const px = Math.random() * 256, w = 6 + Math.random() * 22, h = 30 + Math.random() * 50;
      const a = x.createLinearGradient(0, 4, 0, 4 + h);
      a.addColorStop(0, 'rgba(60,255,190,0)');
      a.addColorStop(0.5, 'rgba(80,255,200,' + (0.1 + Math.random() * 0.16) + ')');
      a.addColorStop(1, 'rgba(120,200,255,0)');
      x.fillStyle = a; x.fillRect(px, 4, w, h);
    }
    for (let i = 0; i < 70; i++) {
      x.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.6) + ')';
      x.fillRect(Math.random() * 256, Math.random() * 46, 1.3, 1.3);
    }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }
  scene.background = skyTexture();
  scene.add(new T.HemisphereLight(0xe8f6ff, 0x6c93c4, 2.3));
  const sun = new T.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-5, 10, 7);
  scene.add(sun);

  let viewW = 1, viewH = 1;
  function resize() {
    viewW = stage.clientWidth || 1; viewH = stage.clientHeight || 1;
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.fov = clamp((2 * Math.atan(0.37 / camera.aspect) * 180) / Math.PI, 52, 82);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  /* ------------------------------------------------------------------ */
  /* Geometry helpers                                                    */
  /* ------------------------------------------------------------------ */
  function P(g, c, x, y, z, sx, sy, sz, rx, ry, rz) {
    const m = new T.Matrix4().compose(
      new T.Vector3(x || 0, y || 0, z || 0),
      new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)),
      new T.Vector3(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
    return { g, c, m };
  }
  function buildGeo(parts) {
    const gs = parts.map((p) => {
      const g = p.g.index ? p.g.toNonIndexed() : p.g;
      g.applyMatrix4(p.m);
      return g;
    });
    let n = 0;
    gs.forEach((g) => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c = new T.Color();
    let o = 0;
    gs.forEach((g, i) => {
      const cnt = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      c.set(parts[i].c);
      for (let k = 0; k < cnt; k++) { col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b; }
      o += cnt;
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    return out;
  }
  const S = (r, w, h) => new T.SphereGeometry(r, w || 10, h || 8);
  const HP = Math.PI / 2;
  const SHADOW = 0x8db9d6;

  function penguinGeo() { // faces -z (away from the camera)
    return buildGeo([
      P(new T.CircleGeometry(0.3, 14), SHADOW, 0, 0.015, 0, 1, 1, 1, -HP),
      P(S(0.25), 0x1c2a59, 0, 0.34, 0, 1, 1.25, 0.95),
      P(S(0.2, 10, 6), 0xffffff, 0, 0.31, -0.1, 0.85, 1.15, 0.75),
      P(S(0.185), 0x1c2a59, 0, 0.7, 0),
      P(S(0.13, 8, 6), 0xffffff, 0, 0.68, -0.09, 1.05, 0.9, 0.8),
      P(S(0.03, 6, 4), 0x10183a, -0.07, 0.72, -0.19),
      P(S(0.03, 6, 4), 0x10183a, 0.07, 0.72, -0.19),
      P(new T.ConeGeometry(0.06, 0.16, 8), 0xff9f1c, 0, 0.66, -0.22, 1, 1, 1, -HP),
      P(S(0.09, 8, 5), 0xff9f1c, -0.12, 0.04, -0.05, 1, 0.4, 1.4),
      P(S(0.09, 8, 5), 0xff9f1c, 0.12, 0.04, -0.05, 1, 0.4, 1.4),
      P(S(0.1, 8, 5), 0x1c2a59, -0.26, 0.36, 0, 0.35, 1.5, 0.8, 0, 0, -0.35),
      P(S(0.1, 8, 5), 0x1c2a59, 0.26, 0.36, 0, 0.35, 1.5, 0.8, 0, 0, 0.35),
      P(new T.SphereGeometry(0.205, 10, 5, 0, Math.PI * 2, 0, HP), 0xffd23f, 0, 0.75, 0),
      P(new T.CylinderGeometry(0.215, 0.215, 0.07, 12), 0xff8a3d, 0, 0.77, 0),
      P(S(0.07, 8, 6), 0xffffff, 0, 0.98, 0),
    ]);
  }
  function emberParts(boss) { // faces +z (towards the camera)
    const parts = [
      P(new T.CircleGeometry(0.34, 14), SHADOW, 0, 0.015, 0, 1, 1, 1, -HP),
      P(S(0.3), 0xff5126, 0, 0.3, 0, 1, 0.95, 1),
      P(S(0.2, 8, 6), 0xff8c3a, 0, 0.22, 0.12, 1.1, 0.75, 0.9),
      P(new T.ConeGeometry(0.17, 0.42, 8), 0xffc531, 0, 0.74, 0),
      P(S(0.075, 8, 6), 0xffffff, -0.11, 0.38, 0.24),
      P(S(0.075, 8, 6), 0xffffff, 0.11, 0.38, 0.24),
      P(S(0.04, 6, 5), 0x2b0a0a, -0.11, 0.38, 0.305),
      P(S(0.04, 6, 5), 0x2b0a0a, 0.11, 0.38, 0.305),
      P(new T.BoxGeometry(0.15, 0.045, 0.05), 0x5a1410, -0.11, 0.475, 0.27, 1, 1, 1, 0, 0, -0.45),
      P(new T.BoxGeometry(0.15, 0.045, 0.05), 0x5a1410, 0.11, 0.475, 0.27, 1, 1, 1, 0, 0, 0.45),
    ];
    if (boss) {
      parts.push(
        P(new T.ConeGeometry(0.07, 0.3, 6), 0x3a1a1a, -0.24, 0.62, 0, 1, 1, 1, 0, 0, 0.6),
        P(new T.ConeGeometry(0.07, 0.3, 6), 0x3a1a1a, 0.24, 0.62, 0, 1, 1, 1, 0, 0, -0.6),
        P(new T.BoxGeometry(0.26, 0.05, 0.05), 0x2b0a0a, 0, 0.2, 0.3),
        P(new T.ConeGeometry(0.03, 0.08, 4), 0xffffff, -0.07, 0.165, 0.3, 1, 1, 1, Math.PI),
        P(new T.ConeGeometry(0.03, 0.08, 4), 0xffffff, 0.07, 0.165, 0.3, 1, 1, 1, Math.PI),
        P(S(0.14, 6, 5), 0x4a2323, -0.28, 0.14, 0.05),
        P(S(0.14, 6, 5), 0x4a2323, 0.28, 0.14, 0.05),
        P(new T.ConeGeometry(0.09, 0.26, 6), 0xff8c3a, -0.13, 0.7, -0.05),
        P(new T.ConeGeometry(0.09, 0.26, 6), 0xff8c3a, 0.13, 0.7, -0.05));
    }
    return parts;
  }

  const lambertVC = () => new T.MeshLambertMaterial({ vertexColors: true });

  /* ------------------------------------------------------------------ */
  /* Persistent instanced meshes                                         */
  /* ------------------------------------------------------------------ */
  const MAX_DRAWN = 60, MAX_EN_DRAWN = 520, MAX_PROJ = 200, MAX_PART = 420;
  const unitMesh = new T.InstancedMesh(penguinGeo(), lambertVC(), MAX_DRAWN);
  const enemyMesh = new T.InstancedMesh(buildGeo(emberParts(false)), lambertVC(), MAX_EN_DRAWN);
  const projMesh = new T.InstancedMesh(S(0.13, 8, 6), new T.MeshLambertMaterial({ color: 0x4fb4ff, emissive: 0x1f7fe0, emissiveIntensity: 0.9 }), MAX_PROJ);
  const partMesh = new T.InstancedMesh(new T.IcosahedronGeometry(0.13, 0), new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25 }), MAX_PART);
  [unitMesh, enemyMesh, projMesh, partMesh].forEach((m) => { m.frustumCulled = false; m.count = 0; scene.add(m); });
  enemyMesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(MAX_EN_DRAWN * 3).fill(1), 3);
  partMesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(MAX_PART * 3).fill(1), 3);

  const bossMat = new T.MeshLambertMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0 });
  const bossMesh = new T.Mesh(buildGeo(emberParts(true)), bossMat);
  bossMesh.visible = false;
  scene.add(bossMesh);

  function setInst(arr, i, x, y, z, sx, sy, cs, sn) { // y-rotation (cs, sn), scale sx (x,z) and sy
    const o = i * 16;
    arr[o] = sx * cs; arr[o + 1] = 0; arr[o + 2] = -sx * sn; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = sx * sn; arr[o + 9] = 0; arr[o + 10] = sx * cs; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }

  /* ------------------------------------------------------------------ */
  /* Label textures                                                      */
  /* ------------------------------------------------------------------ */
  const FONT = '"Fredoka", "Trebuchet MS", system-ui, sans-serif';
  function makeLabel(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return { c, ctx: c.getContext('2d'), tex };
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const GATE_RGB = { add: '22,208,160', mul: '255,180,30', sub: '255,62,96', charge: '150,92,255' };
  const GATE_HEX = { add: 0x12b58a, mul: 0xe39a00, sub: 0xd92a52, charge: 0x7a45e6 };
  function gateText(g) {
    if (g.type === 'mul') return '×' + g.v;
    if (g.type === 'sub') return '−' + g.v;
    return '+' + g.v;
  }
  function drawGate(g) {
    const { c, ctx, tex } = g.label;
    const W = c.width, H = c.height, rgb = GATE_RGB[g.type];
    ctx.clearRect(0, 0, W, H);
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(' + rgb + ',0.9)');
    grd.addColorStop(1, 'rgba(' + rgb + ',0.5)');
    rr(ctx, 5, 5, W - 10, H - 10, 20);
    ctx.fillStyle = grd; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.stroke();
    if (g.type === 'charge') {
      const p = (g.v - g.base) / Math.max(1, g.max - g.base);
      rr(ctx, 26, H - 30, W - 52, 12, 6);
      ctx.fillStyle = 'rgba(20,10,60,0.55)'; ctx.fill();
      if (p > 0.02) { rr(ctx, 26, H - 30, (W - 52) * p, 12, 6); ctx.fillStyle = '#fff'; ctx.fill(); }
    }
    ctx.font = '700 ' + (g.type === 'charge' ? 76 : 84) + 'px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(10,16,50,0.85)';
    const ty = g.type === 'charge' ? H / 2 - 8 : H / 2 + 4;
    ctx.strokeText(gateText(g), W / 2, ty);
    ctx.fillStyle = '#fff';
    ctx.fillText(gateText(g), W / 2, ty);
    tex.needsUpdate = true;
  }
  function drawBarrier(b) {
    const { c, ctx, tex } = b.label;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const n = Math.max(1, Math.ceil(b.hp / stat('dmg') - 1e-6));
    if (b.reward) {
      ctx.font = '700 46px ' + FONT;
      ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(60,30,0,0.9)';
      ctx.strokeText('+' + b.reward, W / 2, 34);
      ctx.fillStyle = '#fff3b0'; ctx.fillText('+' + b.reward, W / 2, 34);
    }
    ctx.font = '700 ' + (b.reward ? 58 : 84) + 'px ' + FONT;
    ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(10,16,50,0.9)';
    const y = b.reward ? 92 : H / 2 + 4;
    ctx.strokeText(fmt(n), W / 2, y);
    ctx.fillStyle = '#fff'; ctx.fillText(fmt(n), W / 2, y);
    b.shown = n;
    tex.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Level generation                                                    */
  /* ------------------------------------------------------------------ */
  const ROAD_HALF = 4.5;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function genLevel(L) {
    const rng = mulberry32(L * 9973 + 11);
    const R = (a, b) => a + rng() * (b - a);
    const RI = (a, b) => Math.floor(R(a, b + 1));
    const hpE = Math.pow(1.18, L - 1);
    const coinV = Math.pow(1.08, L - 1);
    const g = 1 + Math.floor((L - 1) / 3);
    const lv = {
      L, hpE, gates: [], barriers: [], enemies: [], walls: [], pools: [], banners: [],
      lineD: 0, len: 0, boss: null, coinV, speed: Math.min(8 + (L - 1) * 0.12, 10), spawnRate: 1,
    };
    let est = stat('start');
    let d = 20;
    const crowd = Math.min(1.6, 1 + 0.04 * (L - 1));

    const enemy = (x, dd, brute, wake, speed) => {
      lv.enemies.push({
        x, d: dd, hp: hpE * (brute ? 10 : 1), r: brute ? 0.72 : 0.36, sc: brute ? 2.1 : 1,
        kill: brute ? 4 : 1, coin: (brute ? 5 : 1) * coinV, brute: !!brute,
        wake, speed, awake: false, alive: true, ph: rng() * 6.28, off: R(-1, 1), inc: 0, incT: -9,
      });
    };
    const gate = (type, v, x0, x1, dd, extra) => {
      const o = Object.assign({ type, v, x0, x1, d: dd, used: false }, extra || {});
      lv.gates.push(o);
      return o;
    };
    const L0 = -4.35, L1 = -0.2, R0 = 0.2, R1 = 4.35;

    const secPair = (kind) => {
      let big, small;
      if (kind === 0) { big = ['add', g * RI(3, 5)]; small = ['add', g * RI(1, 2)]; est += big[1]; }
      else if (kind === 1) {
        big = ['mul', 2]; small = ['add', Math.max(2, Math.round(est * R(0.45, 1.25)))];
        est = Math.max(est * 2, est + small[1]);
      } else { big = ['add', g * RI(2, 4)]; small = ['sub', Math.max(1, Math.round(est * 0.3))]; est += big[1]; }
      const flip = rng() < 0.5;
      const a = flip ? small : big, b = flip ? big : small;
      gate(a[0], a[1], L0, L1, d);
      gate(b[0], b[1], R0, R1, d);
      d += 16;
    };

    const secLanes = () => {
      lv.banners.push({ d: d - 16, key: 'bLanes' });
      const k = RI(6, 9);
      const len = 13 + k * 3 + 5;
      const side = rng() < 0.5 ? -1 : 1;
      lv.walls.push({ x: 0, d0: d, d1: d + len, t: 0.2 });
      const gx0 = side < 0 ? L0 : R0, gx1 = side < 0 ? L1 : R1;
      const hx0 = side < 0 ? R0 : L0, hx1 = side < 0 ? R1 : L1;
      lv.barriers.push({ x0: gx0 + 0.05, x1: gx1 - 0.05, d: d + 8, hd: 0.45, h: 1.35, hp: Math.max(3, Math.round(est * 1.2)) * hpE, reward: 0, alive: true });
      for (let i = 0; i < k; i++) gate('add', g, gx0, gx1, d + 13 + i * 3, { row: true });
      const M = clamp(Math.round((est * 2.2 + 6) * crowd), 8, 70);
      const cx = (hx0 + hx1) / 2;
      for (let i = 0; i < M; i++) {
        const c = i % 5, r = Math.floor(i / 5);
        enemy(cx + (c - 2) * 0.78 + R(-0.08, 0.08), d + 13 + r * 0.85 + R(-0.08, 0.08), false, 55, 1.2);
      }
      if (est < 30) gate('mul', 2, hx0, hx1, d + len - 3);
      else gate('add', Math.round(est * 0.8), hx0, hx1, d + len - 3);
      est = Math.max(est + k * g, est * 1.5);
      d += len + 8;
    };

    const secRush = () => {
      lv.banners.push({ d: d - 10, key: 'bRush' });
      const M = clamp(Math.round((est * 1.7 + 3) * crowd), 6, 90);
      for (let i = 0; i < M; i++) {
        const brute = L >= 2 && M >= 20 && i % 10 === 9;
        enemy(R(-4, 4), d + 24 + R(0, 6 + M * 0.2), brute, 30, brute ? 2.4 : 3 + R(0, 1));
      }
      est *= 0.95;
      d += 30;
    };

    const secCharge = () => {
      lv.banners.push({ d: d - 12, key: 'bCharge' });
      const side = rng() < 0.5 ? -1 : 1;
      const steps = RI(8, 12);
      const stepDmg = (est * RATE0 * hpE * 1.8) / steps;
      gate('charge', g, side < 0 ? L0 : R0, side < 0 ? L1 : R1, d + 24, { base: g, inc: g, max: g * (steps + 1), acc: 0, stepDmg });
      gate('add', g * RI(2, 3), side < 0 ? R0 : L0, side < 0 ? R1 : L1, d + 24);
      est += g * steps * 0.8;
      d += 36;
    };

    const secPools = () => {
      lv.banners.push({ d: d - 12, key: 'bPools' });
      const xs = [-2.9, 0, 2.9].sort(() => rng() - 0.5);
      for (let i = 0; i < 3; i++) {
        lv.pools.push({ x: xs[i] + R(-0.3, 0.3), d: d + 8 + i * 8, r: R(1.35, 1.7) });
        const gx = xs[(i + 1) % 3];
        gate('add', g * 2, gx - 1.1, gx + 1.1, d + 8 + i * 8);
        est += g * 2 * 0.7;
      }
      d += 32;
    };

    let order;
    if (L === 1) order = ['pair0', 'lanes', 'rush', 'charge'];
    else if (L === 2) order = ['pair0', 'lanes', 'rush', 'pools', 'pair'];
    else {
      order = ['pair0'];
      const pool = ['lanes', 'rush', 'charge', 'pools', 'pair', 'lanes', 'rush'];
      const n = Math.min(3 + Math.floor(L / 2), 7);
      let last = '';
      for (let i = 0; i < n; i++) {
        let k = pool[RI(0, pool.length - 1)];
        if (k === last) k = pool[(pool.indexOf(k) + 1) % pool.length];
        if (i === 0 && k !== 'lanes' && k !== 'charge') k = 'lanes';
        order.push(k); last = k;
      }
      if (order.indexOf('rush') < 0) order.push('rush');
    }
    order.forEach((k) => {
      if (k === 'pair0') secPair(0);
      else if (k === 'pair') secPair(RI(1, 2));
      else if (k === 'lanes') secLanes();
      else if (k === 'rush') secRush();
      else if (k === 'charge') secCharge();
      else secPools();
    });

    // finale
    lv.lineD = d + 10;
    lv.est = est;
    const dps0 = est * RATE0 * hpE;
    const bossT = Math.min(12, 5 + L);
    lv.bossT = bossT;
    lv.boss = { x: 0, d: lv.lineD + 31, hp: dps0 * bossT, maxhp: dps0 * bossT, r: 1.7, alive: true, active: false, speed: 1.5, flash: 0, drain: 0 };
    const M0 = clamp(Math.round(est * crowd), 6, 60);
    for (let i = 0; i < M0; i++) enemy(R(-4, 4), lv.lineD + R(20, 33), false, -1, 2.6 + R(0, 1));
    const rew = Math.max(3, Math.round(est * 0.3));
    [-1, 1].forEach((s) => {
      lv.barriers.push({ x0: s * 3.25 - 0.95, x1: s * 3.25 + 0.95, d: lv.lineD + 9, hd: 0.6, h: 1.7, hp: dps0 * 0.9, reward: rew, alive: true });
    });
    lv.spawnRate = clamp(est * 0.12 * crowd, 0.8, 6);
    lv.len = lv.lineD + 60;
    lv.gates.sort((a, b) => a.d - b.d);
    return lv;
  }

  /* ------------------------------------------------------------------ */
  /* Level scenery                                                       */
  /* ------------------------------------------------------------------ */
  let level = null, levelGroup = null;
  const disposables = [];
  const own = (o) => { disposables.push(o); return o; };

  function roadTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#d3ecf9'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255,0.6' : '150,205,235,0.35') + ')';
      const s = 2 + Math.random() * 10;
      x.fillRect(Math.random() * 256, Math.random() * 256, s, s * 0.6);
    }
    x.strokeStyle = '#a9d5ee'; x.lineWidth = 5;
    for (let r = 0; r < 4; r++) {
      const y = r * 64;
      x.beginPath(); x.moveTo(0, y + 2); x.lineTo(256, y + 2); x.stroke();
      for (let k = 0; k < 2; k++) {
        const px = k * 128 + (r % 2 ? 64 : 0);
        x.beginPath(); x.moveTo(px + 2, y); x.lineTo(px + 2, y + 64); x.stroke();
      }
    }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  const matIce = new T.MeshLambertMaterial({ color: 0x79cdf3 });
  const matSnow = new T.MeshLambertMaterial({ color: 0xffffff });
  const matWall = new T.MeshLambertMaterial({ color: 0x5fb4e0 });
  const matCrate = new T.MeshLambertMaterial({ color: 0xffc23a });
  const matRock = new T.MeshLambertMaterial({ color: 0x3b2a3f });
  const matLava = new T.MeshBasicMaterial({ color: 0xff5a1f });
  const matLava2 = new T.MeshBasicMaterial({ color: 0xffc531 });
  const matLine = new T.MeshBasicMaterial({ color: 0x1fd8a8, transparent: true, opacity: 0.85 });
  const postMat = {};
  for (const k in GATE_HEX) postMat[k] = new T.MeshLambertMaterial({ color: GATE_HEX[k] });
  const geoBox = new T.BoxGeometry(1, 1, 1);
  const geoPlane = new T.PlaneGeometry(1, 1);
  const geoCircle = new T.CircleGeometry(1, 28);

  function box(mat, w, h, dp, x, y, z, parent) {
    const m = new T.Mesh(geoBox, mat);
    m.scale.set(w, h, dp);
    m.position.set(x, y, z);
    (parent || levelGroup).add(m);
    return m;
  }

  function buildLevel(L) {
    if (levelGroup) {
      scene.remove(levelGroup);
      disposables.forEach((o) => o.dispose());
      disposables.length = 0;
    }
    level = genLevel(L);
    level.builtStart = stat('start');
    levelGroup = new T.Group();
    scene.add(levelGroup);
    const len = level.len;

    // road slab
    const tex = own(roadTexture());
    tex.repeat.set(2, (len + 40) / 4.6);
    const roadMat = own(new T.MeshLambertMaterial({ map: tex }));
    const road = box(roadMat, ROAD_HALF * 2 + 1.5, 4, len + 40, 0, -2, -(len / 2 - 20));
    road.userData.road = true;
    // snow banks
    const bankGeo = own(new T.BoxGeometry(0.7, 0.55, 1.5));
    const nb = Math.floor((len + 40) / 2.1);
    const banks = new T.InstancedMesh(bankGeo, matSnow, nb * 2);
    const dm = new T.Object3D();
    for (let i = 0; i < nb; i++) {
      for (let s = 0; s < 2; s++) {
        dm.position.set((s ? 1 : -1) * (ROAD_HALF + 0.38), 0.27 + (i % 2) * 0.12, 20 - i * 2.1);
        dm.updateMatrix();
        banks.setMatrixAt(i * 2 + s, dm.matrix);
      }
    }
    banks.frustumCulled = false;
    levelGroup.add(banks);

    // sea, floes, icebergs
    const sea = new T.Mesh(geoPlane, own(new T.MeshLambertMaterial({ color: 0x1b6f9c })));
    sea.rotation.x = -HP;
    sea.scale.set(700, len + 500, 1);
    sea.position.set(0, -3.4, -len / 2);
    levelGroup.add(sea);
    const rng = mulberry32(L * 31 + 5);
    const floeGeo = own(new T.CylinderGeometry(1, 1.1, 0.5, 7));
    const nf = Math.floor(len / 3.2);
    const floes = new T.InstancedMesh(floeGeo, matSnow, nf);
    for (let i = 0; i < nf; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const s = 0.8 + rng() * 2.6;
      dm.position.set(side * (7.5 + rng() * 36), -3.25, 25 - rng() * (len + 60));
      dm.scale.set(s, 1, s * (0.6 + rng() * 0.6));
      dm.rotation.set(0, rng() * 6, 0);
      dm.updateMatrix();
      floes.setMatrixAt(i, dm.matrix);
    }
    floes.frustumCulled = false;
    levelGroup.add(floes);
    const bergGeo = own(new T.ConeGeometry(1, 2, 5));
    const nbg = Math.floor(len / 9);
    const bergs = new T.InstancedMesh(bergGeo, matIce, nbg);
    for (let i = 0; i < nbg; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const s = 1.5 + rng() * 4.5;
      dm.position.set(side * (12 + rng() * 40), -3.4 + s * 0.9, 20 - rng() * (len + 80));
      dm.scale.set(s, s, s);
      dm.rotation.set(0, rng() * 6, 0);
      dm.updateMatrix();
      bergs.setMatrixAt(i, dm.matrix);
    }
    bergs.frustumCulled = false;
    levelGroup.add(bergs);
    dm.scale.set(1, 1, 1); dm.rotation.set(0, 0, 0);

    // dividing walls
    level.walls.forEach((w) => {
      const l = w.d1 - w.d0;
      box(matWall, w.t * 2, 0.8, l, w.x, 0.4, -(w.d0 + l / 2));
      box(matSnow, w.t * 2 + 0.12, 0.14, l + 0.1, w.x, 0.86, -(w.d0 + l / 2));
      box(matIce, 0.7, 1.25, 0.7, w.x, 0.62, -w.d0).rotation.y = Math.PI / 4;
    });

    // gates
    level.gates.forEach((g) => {
      const w = g.x1 - g.x0, cx = (g.x0 + g.x1) / 2;
      g.label = makeLabel(256, 128);
      own(g.label.tex);
      drawGate(g);
      const grp = new T.Group();
      grp.position.set(cx, 0, -g.d);
      const mat = own(new T.MeshBasicMaterial({ map: g.label.tex, transparent: true, depthWrite: false }));
      const pl = new T.Mesh(geoPlane, mat);
      pl.scale.set(w - 0.3, g.row ? 1.55 : 1.9, 1);
      pl.position.y = g.row ? 0.95 : 1.12;
      grp.add(pl);
      const ph = g.row ? 1.9 : 2.3;
      box(postMat[g.type], 0.2, ph, 0.2, -w / 2 + 0.1, ph / 2, 0, grp);
      box(postMat[g.type], 0.2, ph, 0.2, w / 2 - 0.1, ph / 2, 0, grp);
      levelGroup.add(grp);
      g.mesh = grp; g.panel = pl; g.pulse = 0;
    });

    // barriers
    level.barriers.forEach((b) => {
      const w = b.x1 - b.x0, cx = (b.x0 + b.x1) / 2;
      const grp = new T.Group();
      grp.position.set(cx, 0, -b.d);
      box(b.reward ? matCrate : matIce, w, b.h, b.hd * 2, 0, b.h / 2, 0, grp);
      box(matSnow, w + 0.12, 0.16, b.hd * 2 + 0.12, 0, b.h + 0.06, 0, grp);
      b.label = makeLabel(128, 128);
      own(b.label.tex);
      drawBarrier(b);
      const pl = new T.Mesh(geoPlane, own(new T.MeshBasicMaterial({ map: b.label.tex, transparent: true, depthWrite: false })));
      const sz = Math.min(w, b.h) * 0.98;
      pl.scale.set(sz, sz, 1);
      pl.position.set(0, b.h / 2, b.hd + 0.02);
      grp.add(pl);
      levelGroup.add(grp);
      b.mesh = grp; b.pulse = 0;
    });

    // lava pools
    level.pools.forEach((p) => {
      const a = new T.Mesh(geoCircle, matLava);
      a.rotation.x = -HP; a.scale.set(p.r, p.r, 1); a.position.set(p.x, 0.03, -p.d);
      const b = new T.Mesh(geoCircle, matLava2);
      b.rotation.x = -HP; b.scale.set(p.r * 0.62, p.r * 0.62, 1); b.position.set(p.x, 0.04, -p.d);
      const rim = new T.Mesh(geoCircle, matRock);
      rim.rotation.x = -HP; rim.scale.set(p.r + 0.18, p.r + 0.18, 1); rim.position.set(p.x, 0.02, -p.d);
      levelGroup.add(rim, a, b);
      p.core = b;
    });

    // defence line and the volcano gate at the far end
    const line = new T.Mesh(geoPlane, matLine);
    line.rotation.x = -HP; line.scale.set(ROAD_HALF * 2, 0.5, 1); line.position.set(0, 0.03, -(level.lineD + 2.6));
    levelGroup.add(line);
    const pz = -(level.lineD + 46);
    box(matRock, 2.2, 7, 2.5, -4.4, 3.5, pz);
    box(matRock, 2.2, 7, 2.5, 4.4, 3.5, pz);
    box(matRock, 11, 2.2, 2.5, 0, 7.4, pz);
    box(matLava, 6.6, 6.4, 0.4, 0, 3.2, pz - 0.6);
    box(matLava2, 4.4, 4.6, 0.4, 0, 2.3, pz - 0.5);
  }

  /* ------------------------------------------------------------------ */
  /* Run state                                                           */
  /* ------------------------------------------------------------------ */
  let state = 'home'; // home | run | won | lost
  let time = 0, finale = false, endT = 0;
  let runCoins = 0, runKills = 0, coinShown = -1;
  let runT = 0, dragged = 0;
  let shake = 0, fireAcc = 0, poolAcc = 0, spawnAcc = 0, gateIdx = 0, bannerIdx = 0;
  const squad = { x: 0, tx: 0, d: 0, n: 1, speed: 0 };
  const ux = new Float32Array(MAX_DRAWN), urd = new Float32Array(MAX_DRAWN), usc = new Float32Array(MAX_DRAWN);
  const fox = new Float32Array(MAX_DRAWN), fod = new Float32Array(MAX_DRAWN);
  for (let i = 0; i < MAX_DRAWN; i++) {
    const r = 0.27 * Math.sqrt(i), a = i * 2.39996;
    fox[i] = Math.cos(a) * r * 0.85; fod[i] = Math.sin(a) * r * 1.15;
  }
  const drawn = () => Math.min(squad.n, MAX_DRAWN);
  const squadRx = () => 0.27 * Math.sqrt(drawn()) * 0.85 + 0.3;
  const squadRd = () => 0.27 * Math.sqrt(drawn()) * 1.15 + 0.3;

  function boundsAt(d, x, out) {
    let lo = -ROAD_HALF, hi = ROAD_HALF;
    const ws = level.walls;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (d > w.d0 - 0.4 && d < w.d1 + 0.2) {
        if (w.x <= x) { if (w.x + w.t > lo) lo = w.x + w.t; } else if (w.x - w.t < hi) hi = w.x - w.t;
      }
    }
    out[0] = lo; out[1] = hi;
  }
  const bnd = [0, 0];

  // projectiles
  const px = new Float32Array(MAX_PROJ), pd = new Float32Array(MAX_PROJ), pd0 = new Float32Array(MAX_PROJ),
    pdm = new Float32Array(MAX_PROJ), psz = new Float32Array(MAX_PROJ), pvx = new Float32Array(MAX_PROJ);
  const pAlive = new Uint8Array(MAX_PROJ);
  const ptg = new Array(MAX_PROJ).fill(null);
  const PSPEED = 34, PRANGE = 24;
  const AIM_X = 2.3, AIM_D = 21;
  function spawnProj(x, d, dmg, size) {
    let slot = -1;
    for (let i = 0; i < MAX_PROJ; i++) if (!pAlive[i]) { slot = i; break; }
    if (slot < 0) return;
    // soft aim: lean towards a nearby target that is not already covered by other shots
    const en = level.enemies;
    let best = null, bs = 1e9;
    for (let k = 0; k < en.length; k++) {
      const e = en[k];
      if (!e.alive) continue;
      const rel = e.d - d;
      if (rel < 0.5 || rel > AIM_D) continue;
      const dx = e.x - x;
      if (dx > AIM_X || dx < -AIM_X) continue;
      if (time - e.incT > 0.9) e.inc = 0;
      if (e.inc >= e.hp) continue;
      const sc = rel + (dx < 0 ? -dx : dx) * 2.5;
      if (sc < bs) { bs = sc; best = e; }
    }
    let vx = 0, tg = null;
    if (best) {
      boundsAt(best.d, x, bnd);
      if (best.x > bnd[0] && best.x < bnd[1]) {
        const tt = (best.d - d) / (PSPEED + best.speed * (best.awake ? 1 : 0));
        vx = clamp((best.x - x) / Math.max(0.05, tt), -14, 14);
        best.inc += dmg; best.incT = time;
        tg = best;
      }
    } else {
      const b = level.boss;
      if (b.alive && b.d - d < PRANGE + 1 && Math.abs(b.x - x) < 3.2) {
        vx = clamp((b.x + (Math.random() - 0.5) * 1.6 - x) / Math.max(0.05, (b.d - b.r - d) / PSPEED), -10, 10);
      }
    }
    pAlive[slot] = 1; px[slot] = x; pd[slot] = d; pd0[slot] = d; pdm[slot] = dmg; psz[slot] = size; pvx[slot] = vx; ptg[slot] = tg;
  }

  // particles
  const qx = new Float32Array(MAX_PART), qy = new Float32Array(MAX_PART), qz = new Float32Array(MAX_PART),
    qvx = new Float32Array(MAX_PART), qvy = new Float32Array(MAX_PART), qvz = new Float32Array(MAX_PART),
    ql = new Float32Array(MAX_PART), qm = new Float32Array(MAX_PART), qs = new Float32Array(MAX_PART);
  let qNext = 0;
  const tmpC = new T.Color();
  function burst(x, y, d, hex, n, spd, size) {
    if (silent) return;
    tmpC.set(hex);
    const col = partMesh.instanceColor.array;
    for (let k = 0; k < n; k++) {
      const i = qNext; qNext = (qNext + 1) % MAX_PART;
      const a = Math.random() * 6.283, u = Math.random();
      qx[i] = x; qy[i] = y; qz[i] = -d;
      qvx[i] = Math.cos(a) * spd * (0.4 + u); qvz[i] = Math.sin(a) * spd * (0.4 + u);
      qvy[i] = spd * (0.6 + Math.random() * 0.9);
      ql[i] = qm[i] = 0.35 + Math.random() * 0.3; qs[i] = (size || 1) * (0.7 + Math.random() * 0.7);
      col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    }
    partMesh.instanceColor.needsUpdate = true;
  }

  // floating text
  const floats = $('floats');
  const v3 = new T.Vector3();
  let floatCount = 0;
  function floatText(text, x, y, d, cls) {
    if (silent || floatCount > 26) return;
    v3.set(x, y, -d).project(camera);
    if (v3.z > 1) return;
    const el = document.createElement('div');
    el.className = 'float ' + (cls || '');
    el.textContent = text;
    el.style.left = ((v3.x * 0.5 + 0.5) * viewW).toFixed(0) + 'px';
    el.style.top = ((-v3.y * 0.5 + 0.5) * viewH).toFixed(0) + 'px';
    floats.appendChild(el);
    floatCount++;
    setTimeout(() => { el.remove(); floatCount--; }, 920);
  }

  const countEl = $('count');
  function flashCount(cls) {
    if (silent) return;
    countEl.classList.remove('pop', 'hurt');
    void countEl.offsetWidth;
    countEl.classList.add(cls);
  }

  function addUnits(k, quiet) {
    if (k <= 0) return;
    const before = drawn();
    squad.n += k;
    const after = drawn();
    for (let i = before; i < after; i++) { usc[i] = 0.2; ux[i] = squad.x; urd[i] = 0; }
    if (!quiet) flashCount('pop');
  }
  function loseUnits(k) {
    if (state !== 'run' || k <= 0) return;
    k = Math.min(k, squad.n);
    const before = drawn();
    squad.n -= k;
    const after = drawn();
    for (let i = after; i < before && i < after + 6; i++) burst(ux[i], 0.5, squad.d + urd[i], 0xffffff, 4, 2.5, 1);
    sfx.lose1(); buzz(18);
    shake = Math.min(0.5, shake + 0.12);
    flashCount('hurt');
    if (squad.n <= 0) endRun(false);
  }
  function addCoins(c) { runCoins += c * stat('gold'); }

  function killEnemy(e, byShot) {
    e.alive = false;
    burst(e.x, 0.4 * e.sc, e.d, byShot ? 0xffffff : 0xff8c3a, e.brute ? 12 : 5, e.brute ? 5 : 3.2, e.brute ? 1.6 : 1);
    if (byShot) {
      burst(e.x, 0.4 * e.sc, e.d, 0xffb347, e.brute ? 6 : 2, 3, 1);
      runKills++; addCoins(e.coin); sfx.pop();
      if (e.brute) floatText('+' + Math.round(e.coin * stat('gold')), e.x, 1.6, e.d, 'gold');
    }
  }

  function applyGate(g) {
    g.used = true; g.pulse = 1;
    const cx = (g.x0 + g.x1) / 2;
    if (g.type === 'sub') {
      const k = Math.min(g.v, squad.n - 1);
      if (k > 0) loseUnits(k);
      sfx.bad();
      floatText('−' + g.v, cx, 2.4, g.d, 'bad big');
      return;
    }
    const k = g.type === 'mul' ? squad.n * (g.v - 1) : g.v;
    addUnits(k);
    sfx.gate(); buzz(10);
    floatText(gateText(g), cx, 2.4, g.d, (g.type === 'mul' ? 'gold' : 'good') + (g.row ? '' : ' big'));
    burst(squad.x, 0.6, squad.d, GATE_HEX[g.type], g.row ? 4 : 10, 3.5, 1);
  }

  function breakBarrier(b, byShot) {
    b.alive = false;
    b.mesh.visible = false;
    const cx = (b.x0 + b.x1) / 2;
    burst(cx, b.h * 0.6, b.d, b.reward ? 0xffd96b : 0xbfeaff, 18, 5.5, 1.5);
    burst(cx, b.h * 0.6, b.d, 0xffffff, 8, 4, 1.2);
    sfx.crack(); buzz(25);
    shake = Math.min(0.5, shake + 0.2);
    if (byShot && b.reward) {
      addUnits(b.reward);
      floatText('+' + b.reward, cx, 2.6, b.d, 'good big');
      sfx.gate();
    }
  }

  function showBanner(key) {
    if (silent) return;
    const el = $('banner');
    el.textContent = t(key);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function startFinale() {
    finale = true;
    // a squad far larger than planned for meets a tougher giant, so the last stand stays a fight
    if (squad.n > level.est) {
      const b = level.boss;
      b.hp = b.maxhp = Math.sqrt(level.est * squad.n) * RATE0 * level.hpE * level.bossT;
    }
    level.boss.active = true;
    level.enemies.forEach((e) => { if (e.wake < 0) e.awake = true; });
    showBanner('bFinale');
    sfx.roar();
    $('progress').hidden = true;
    $('bossbar').hidden = false;
  }

  function endRun(won) {
    if (state !== 'run') return;
    state = won ? 'won' : 'lost';
    endT = 0;
    $('hint').hidden = true;
    if (won) {
      const b = level.boss;
      addCoins((35 + 10 * level.L) * level.coinV);
      level.enemies.forEach((e) => { if (e.alive && e.awake) killEnemy(e, true); });
      for (let k = 0; k < 6; k++) burst(b.x + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, b.d, k % 2 ? 0xffc531 : 0xff5126, 14, 8, 2.2);
      shake = 0.8; buzz(120);
      sfx.crack(); sfx.win();
    } else {
      sfx.fail(); buzz(200);
    }
  }

  function showResult() {
    const earned = Math.round(runCoins);
    save.coins += earned;
    $('count').hidden = true;
    $('bossbar').hidden = true;
    if (state === 'won') {
      $('winSub').textContent = t('winSub', { n: level.L });
      $('winUnits').textContent = fmt(squad.n);
      $('winKills').textContent = fmt(runKills);
      $('winCoins').textContent = '+' + fmt(earned);
      save.level = level.L + 1;
      $('win').hidden = false;
    } else {
      const p = Math.round(clamp(squad.d / level.lineD, 0, 1) * 100);
      $('loseSub').textContent = t('loseSub', { p });
      $('loseKills').textContent = fmt(runKills);
      $('loseCoins').textContent = '+' + fmt(earned);
      $('lose').hidden = false;
    }
    persist();
    state = 'result';
    refreshHud(true);
  }

  /* ------------------------------------------------------------------ */
  /* Simulation step                                                     */
  /* ------------------------------------------------------------------ */
  const hits = [];
  function updateRun(dt) {
    const lv = level, boss = lv.boss;
    runT += dt;
    if (runT > 6 && !silent && !$('hint').hidden) $('hint').hidden = true;
    // steering
    boundsAt(squad.d, squad.x, bnd);
    squad.tx = clamp(squad.tx, bnd[0] + 0.5, bnd[1] - 0.5);
    squad.x += (squad.tx - squad.x) * Math.min(1, dt * 20);
    squad.x = clamp(squad.x, bnd[0] + 0.5, bnd[1] - 0.5);

    // forward motion
    if (!finale) {
      squad.speed = Math.min(lv.speed, squad.speed + dt * 14);
      squad.d += squad.speed * dt;
      if (squad.d >= lv.lineD) { squad.d = lv.lineD; startFinale(); }
    }
    while (bannerIdx < lv.banners.length && lv.banners[bannerIdx].d <= squad.d) showBanner(lv.banners[bannerIdx++].key);

    // gates
    while (gateIdx < lv.gates.length && lv.gates[gateIdx].d <= squad.d) {
      const g = lv.gates[gateIdx++];
      if (!g.used && squad.x >= g.x0 - 0.05 && squad.x <= g.x1 + 0.05) applyGate(g);
      if (state !== 'run') return;
    }

    // barriers (ramming)
    for (let i = 0; i < lv.barriers.length; i++) {
      const b = lv.barriers[i];
      if (!b.alive) continue;
      if (squad.d + 0.5 >= b.d - b.hd && squad.d < b.d + b.hd && squad.x > b.x0 - 0.3 && squad.x < b.x1 + 0.3) {
        const k = Math.min(squad.n - 1, Math.ceil(b.hp / stat('dmg')));
        breakBarrier(b, false);
        if (k > 0) { loseUnits(k); floatText('−' + k, squad.x, 2.4, squad.d, 'bad big'); }
      }
    }

    // lava pools
    for (let i = 0; i < lv.pools.length; i++) {
      const p = lv.pools[i], dx = squad.x - p.x, dd = squad.d - p.d;
      if (dx * dx + dd * dd < (p.r + 0.25) * (p.r + 0.25)) {
        poolAcc += dt * (6 + squad.n * 0.12);
        if (Math.random() < 0.5) burst(squad.x, 0.2, squad.d, 0xff8c3a, 1, 3, 1);
        if (poolAcc >= 1) {
          const k = Math.floor(poolAcc); poolAcc -= k;
          loseUnits(k);
          if (state !== 'run') return;
        }
      }
    }

    // shooting
    const nd = drawn();
    const shots = squad.n * stat('rate');
    const pps = Math.min(shots, 30);
    const perShot = (shots * stat('dmg')) / pps;
    const size = 1 + Math.min(1.4, Math.log10(Math.max(1, perShot / stat('dmg'))) * 0.9);
    fireAcc += dt * pps;
    while (fireAcc >= 1) {
      fireAcc -= 1;
      const i = Math.floor(Math.random() * nd);
      spawnProj(ux[i], squad.d + urd[i] + 0.35, perShot, size);
    }

    // enemies
    const en = lv.enemies;
    const rx = squadRx() + 0.3, rd = squadRd() + 0.3;
    let aliveAwake = 0;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.alive) continue;
      const rel = e.d - squad.d;
      if (!e.awake) { if (e.wake > 0 && rel < e.wake) e.awake = true; else continue; }
      aliveAwake++;
      e.d -= e.speed * dt;
      if (rel < 15) {
        const want = squad.x + e.off * (rx - 0.4), dx = want - e.x;
        const mv = 2.4 * dt;
        e.x += dx > mv ? mv : dx < -mv ? -mv : dx;
      }
      boundsAt(e.d, e.x, bnd);
      e.x = clamp(e.x, bnd[0] + e.r * 0.8, bnd[1] - e.r * 0.8);
      const ex = (e.x - squad.x) / (rx + e.r * 0.5), ed = (e.d - squad.d) / (rd + e.r * 0.5);
      if (ex * ex + ed * ed < 1) {
        killEnemy(e, false);
        loseUnits(e.kill);
        if (state !== 'run') return;
      } else if (rel < -7) e.alive = false;
    }

    // finale: reinforcements and the boss
    if (finale && boss.alive) {
      spawnAcc += dt * lv.spawnRate;
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        if (aliveAwake < 130 && en.length < 1400) {
          const brute = lv.L >= 2 && Math.random() < 0.06;
          en.push({
            x: (Math.random() * 2 - 1) * 4, d: lv.lineD + 40 + Math.random() * 3,
            hp: lv.hpE * (brute ? 10 : 1), r: brute ? 0.72 : 0.36, sc: brute ? 2.1 : 1,
            kill: brute ? 4 : 1, coin: (brute ? 5 : 1) * lv.coinV, brute,
            wake: 1, speed: brute ? 2.4 : 2.8 + Math.random(), awake: true, alive: true, ph: Math.random() * 6.28, off: Math.random() * 2 - 1, inc: 0, incT: -9,
          });
        }
      }
      const gap = boss.d - squad.d;
      if (gap > rd + 1.5) {
        boss.d -= boss.speed * dt;
        const dx = squad.x - boss.x, mv = 0.8 * dt;
        boss.x += dx > mv ? mv : dx < -mv ? -mv : dx;
      } else {
        boss.drain += dt * (6 + squad.n * 0.15);
        if (boss.drain >= 1) {
          const k = Math.floor(boss.drain); boss.drain -= k;
          sfx.boss();
          loseUnits(k);
          if (state !== 'run') return;
        }
      }
    }

    // projectiles
    const step = PSPEED * dt;
    const lo = squad.d - 2, hi = squad.d + PRANGE + 6;
    for (let i = 0; i < MAX_PROJ; i++) {
      if (!pAlive[i]) continue;
      const d0 = pd[i], d1 = d0 + step;
      let x = px[i];
      const tg = ptg[i];
      if (tg) { // keep curving towards the chosen target while it lives
        if (tg.alive && tg.d > d0) {
          pvx[i] = clamp((tg.x - x) / Math.max(0.03, (tg.d - d0) / (PSPEED + tg.speed * (tg.awake ? 1 : 0))), -16, 16);
        } else ptg[i] = null;
      }
      if (pvx[i] !== 0) {
        boundsAt(d1, x, bnd);
        x += pvx[i] * dt;
        if (x < bnd[0] || x > bnd[1]) { pAlive[i] = 0; burst(x, 0.5, d1, 0xffffff, 1, 2, 0.7); continue; }
        px[i] = x;
      }
      let blockD = Infinity, blockKind = 0, blockObj = null;
      for (let k = 0; k < lv.barriers.length; k++) {
        const b = lv.barriers[k];
        if (!b.alive) continue;
        const face = b.d - b.hd;
        if (x > b.x0 && x < b.x1 && face >= d0 - 0.3 && face <= d1 && face < blockD) { blockD = face; blockKind = 1; blockObj = b; }
      }
      for (let k = gateIdx; k < lv.gates.length; k++) {
        const g = lv.gates[k];
        if (g.d > d1) break;
        if (g.type === 'charge' && !g.used && g.d >= d0 && x > g.x0 && x < g.x1 && g.d < blockD) { blockD = g.d; blockKind = 2; blockObj = g; }
      }
      if (boss.alive) {
        const face = boss.d - boss.r * 0.8;
        if (Math.abs(x - boss.x) < boss.r && face >= d0 - 0.6 && face <= d1 && face < blockD) { blockD = face; blockKind = 3; blockObj = boss; }
      }
      hits.length = 0;
      for (let k = 0; k < en.length; k++) {
        const e = en[k];
        if (!e.alive || e.d < lo || e.d > hi) continue;
        const dx = e.x - x;
        if (dx < e.r + 0.22 && dx > -e.r - 0.22 && e.d >= d0 - e.r && e.d <= d1 + e.r && e.d < blockD) hits.push(e);
      }
      let dmg = pdm[i];
      if (hits.length > 1) hits.sort((a, b) => a.d - b.d);
      for (let k = 0; k < hits.length && dmg > 1e-6; k++) {
        const e = hits[k];
        const a = Math.min(dmg, e.hp);
        e.hp -= a; dmg -= a;
        if (e.hp <= 1e-6) killEnemy(e, true);
        else { sfx.thud(); burst(e.x, 0.5 * e.sc, e.d - e.r, 0xffffff, 1, 2, 0.8); }
      }
      if (dmg <= 1e-6) { pAlive[i] = 0; continue; }
      if (blockKind) {
        pAlive[i] = 0;
        if (blockKind === 1) {
          const b = blockObj;
          b.hp -= dmg; b.pulse = 1;
          sfx.thud();
          burst(x, b.h * 0.5, b.d - b.hd, 0xdff4ff, 1, 2.5, 0.8);
          if (b.hp <= 1e-6) breakBarrier(b, true);
          else if (Math.ceil(b.hp / stat('dmg') - 1e-6) !== b.shown) drawBarrier(b);
        } else if (blockKind === 2) {
          const g = blockObj;
          g.acc += dmg;
          const v = Math.min(g.max, g.base + Math.floor(g.acc / g.stepDmg) * g.inc);
          if (v !== g.v) { g.v = v; g.pulse = 1; drawGate(g); sfx.charge(v / g.inc); }
          burst(x, 1.1, g.d, 0xc9a8ff, 1, 2, 0.8);
        } else {
          boss.hp -= dmg; boss.flash = 1;
          burst(x, 1.5 + Math.random() * 2, boss.d - boss.r, 0xffffff, 1, 3, 1);
          sfx.thud();
          if (boss.hp <= 0) { boss.alive = false; endRun(true); return; }
        }
        continue;
      }
      pd[i] = d1;
      if (d1 - pd0[i] > PRANGE) pAlive[i] = 0;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame visuals                                                   */
  /* ------------------------------------------------------------------ */
  const dummy = new T.Object3D();
  function moveUnits(dt) { // formation follow; part of the simulation because shots leave from unit positions
    const n = drawn();
    boundsAt(squad.d, squad.x, bnd);
    const lo = bnd[0] + 0.24, hi = bnd[1] - 0.24;
    const k = Math.min(1, dt * 13);
    for (let i = 0; i < n; i++) {
      const tx = clamp(squad.x + fox[i], lo, hi);
      ux[i] += (tx - ux[i]) * k * (1 - i * 0.004);
      urd[i] += (fod[i] - urd[i]) * k;
      usc[i] += (1 - usc[i]) * Math.min(1, dt * 10);
    }
  }
  function updateUnits() {
    const n = drawn();
    const facing = state === 'home' || state === 'won' || (state === 'result' && squad.n > 0);
    const big = 1 + Math.min(0.3, Math.max(0, Math.log10(squad.n / MAX_DRAWN)) * 0.3);
    for (let i = 0; i < n; i++) {
      const ph = time * 11 + i * 1.7;
      let y = 0, tilt = 0;
      if (state === 'run' && !finale) { y = Math.abs(Math.sin(ph)) * 0.07; tilt = Math.sin(ph) * 0.13; }
      else if (state === 'won' || (state === 'result' && squad.n > 0)) { y = Math.abs(Math.sin(time * 7 + i)) * 0.45; }
      else { y = Math.abs(Math.sin(time * 3 + i)) * 0.03; tilt = Math.sin(time * 3 + i) * 0.05; }
      dummy.position.set(ux[i], y, -(squad.d + urd[i]));
      dummy.rotation.set(0, facing ? Math.PI : 0, tilt);
      dummy.scale.setScalar(usc[i] * 0.95 * big);
      dummy.updateMatrix();
      unitMesh.setMatrixAt(i, dummy.matrix);
    }
    unitMesh.count = n;
    unitMesh.instanceMatrix.needsUpdate = true;
  }

  function updateEnemiesVisual() {
    const en = level.enemies, arr = enemyMesh.instanceMatrix.array, col = enemyMesh.instanceColor.array;
    const lo = squad.d - 9, hi = squad.d + 118;
    let n = 0;
    for (let i = 0; i < en.length && n < MAX_EN_DRAWN; i++) {
      const e = en[i];
      if (!e.alive || e.d < lo || e.d > hi) continue;
      const hop = e.awake ? Math.abs(Math.sin(time * 9 + e.ph)) : Math.abs(Math.sin(time * 2.5 + e.ph)) * 0.3;
      const sw = Math.sin(time * 5 + e.ph) * 0.18;
      setInst(arr, n, e.x, hop * 0.14 * e.sc, -e.d, e.sc * (1 + hop * 0.06), e.sc * (1 - hop * 0.1 + 0.08), Math.cos(sw), Math.sin(sw));
      if (e.brute) { col[n * 3] = 0.62; col[n * 3 + 1] = 0.42; col[n * 3 + 2] = 1.0; }
      else { col[n * 3] = 1; col[n * 3 + 1] = 1; col[n * 3 + 2] = 1; }
      n++;
    }
    enemyMesh.count = n;
    enemyMesh.instanceMatrix.needsUpdate = true;
    enemyMesh.instanceColor.needsUpdate = true;

    const b = level.boss;
    if (b.alive) {
      bossMesh.visible = true;
      const stomp = b.active ? Math.abs(Math.sin(time * 3.2)) : 0;
      bossMesh.position.set(b.x, stomp * 0.35, -b.d);
      const s = 4.6;
      bossMesh.scale.set(s * (1 + stomp * 0.04), s * (1 - stomp * 0.05 + b.flash * 0.05), s);
      bossMesh.rotation.y = Math.sin(time * 1.6) * 0.12;
      bossMat.emissiveIntensity = b.flash * 0.55;
    } else bossMesh.visible = false;
  }

  function updateProjVisual() {
    const arr = projMesh.instanceMatrix.array;
    let n = 0;
    for (let i = 0; i < MAX_PROJ; i++) {
      if (!pAlive[i]) continue;
      const s = psz[i], o = n * 16;
      arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s * 2.4; arr[o + 11] = 0;
      arr[o + 12] = px[i]; arr[o + 13] = 0.55; arr[o + 14] = -pd[i]; arr[o + 15] = 1;
      n++;
    }
    projMesh.count = n;
    projMesh.instanceMatrix.needsUpdate = true;
  }

  function updateParticles(dt) {
    const arr = partMesh.instanceMatrix.array;
    for (let i = 0; i < MAX_PART; i++) {
      if (ql[i] > 0) {
        ql[i] -= dt;
        qvy[i] -= 14 * dt;
        qx[i] += qvx[i] * dt; qy[i] += qvy[i] * dt; qz[i] += qvz[i] * dt;
        if (qy[i] < 0.05) { qy[i] = 0.05; qvy[i] *= -0.4; }
        const s = ql[i] > 0 ? (ql[i] / qm[i]) * qs[i] : 0;
        setInst(arr, i, qx[i], qy[i], qz[i], s, s, 1, 0);
      } else if (arr[i * 16] !== 0) setInst(arr, i, 0, -50, 0, 0, 0, 1, 0);
    }
    partMesh.count = MAX_PART;
    partMesh.instanceMatrix.needsUpdate = true;
  }

  function updateProps(dt) {
    const lv = level;
    for (let i = 0; i < lv.gates.length; i++) {
      const g = lv.gates[i];
      if (g.pulse > 0) {
        g.pulse = Math.max(0, g.pulse - dt * (g.used ? 5 : 7));
        if (g.used) {
          g.mesh.scale.y = g.pulse; g.mesh.visible = g.pulse > 0.02;
        } else g.panel.scale.y = (g.row ? 1.55 : 1.9) * (1 + g.pulse * 0.12);
      }
    }
    for (let i = 0; i < lv.barriers.length; i++) {
      const b = lv.barriers[i];
      if (b.alive && b.pulse > 0) {
        b.pulse = Math.max(0, b.pulse - dt * 8);
        b.mesh.scale.set(1 + b.pulse * 0.04, 1 - b.pulse * 0.06, 1);
      }
    }
    for (let i = 0; i < lv.pools.length; i++) {
      const p = lv.pools[i], s = p.r * (0.6 + Math.sin(time * 3 + i) * 0.06);
      p.core.scale.set(s, s, 1);
    }
    if (lv.boss.flash > 0) lv.boss.flash = Math.max(0, lv.boss.flash - dt * 9);
  }

  const POSE = { home: { h: 6.4, b: 10.5, a: 1.5 }, run: { h: 12.5, b: 9.5, a: 12 }, fin: { h: 15, b: 11, a: 13 } };
  const cam = { h: POSE.home.h, b: POSE.home.b, a: POSE.home.a, x: 0 };
  function updateCamera(dt) {
    const p = state === 'home' ? POSE.home : finale ? POSE.fin : POSE.run;
    const k = Math.min(1, dt * 2.6);
    cam.h = lerp(cam.h, p.h, k); cam.b = lerp(cam.b, p.b, k); cam.a = lerp(cam.a, p.a, k);
    cam.x = lerp(cam.x, squad.x * 0.32, Math.min(1, dt * 6));
    shake = Math.max(0, shake - dt * 1.8);
    const sx = (Math.random() - 0.5) * shake * 0.5, sy = (Math.random() - 0.5) * shake * 0.5;
    camera.position.set(cam.x + sx, cam.h + sy, -squad.d + cam.b);
    camera.lookAt(cam.x, 0.6, -squad.d - cam.a);
  }

  function refreshHud(force) {
    const c = Math.floor(state === 'run' || state === 'won' || state === 'lost' ? save.coins + runCoins : save.coins);
    if (c !== coinShown || force) {
      if (coinShown >= 0 && c > coinShown && !force) {
        const pill = $('coinPill');
        pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
      }
      coinShown = c;
      $('coinNum').textContent = fmt(c);
    }
    if (state === 'run' || state === 'won' || state === 'lost') {
      if (!finale) $('progressFill').style.width = (clamp(squad.d / level.lineD, 0, 1) * 100).toFixed(1) + '%';
      else $('bossFill').style.width = (clamp(level.boss.hp / level.boss.maxhp, 0, 1) * 100).toFixed(1) + '%';
      if (squad.n > 0) {
        v3.set(squad.x, 1.9 + squadRd() * 0.25, -(squad.d + squadRd() * 0.5)).project(camera);
        countEl.style.transform = 'translate(' + ((v3.x * 0.5 + 0.5) * viewW).toFixed(1) + 'px,' + ((-v3.y * 0.5 + 0.5) * viewH).toFixed(1) + 'px) translate(-50%,-50%)';
        const s = fmt(squad.n);
        if (countEl.textContent !== s) countEl.textContent = s;
        countEl.hidden = false;
      } else countEl.hidden = true;
    }
  }

  function step(dt) {
    time += dt;
    moveUnits(dt);
    if (state === 'run') updateRun(dt);
    else if (state === 'won' || state === 'lost') {
      endT += dt;
      if (endT > (state === 'won' ? 1.9 : 1.1)) showResult();
    }
    // spent projectiles keep flying briefly after the run ends
    if (state !== 'run') {
      for (let i = 0; i < MAX_PROJ; i++) if (pAlive[i]) { pd[i] += PSPEED * dt; if (pd[i] - pd0[i] > PRANGE) pAlive[i] = 0; }
    }
  }
  function draw(dt) {
    updateUnits();
    updateEnemiesVisual();
    updateProjVisual();
    updateParticles(dt);
    updateProps(dt);
    updateCamera(dt);
    refreshHud(false);
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------------ */
  /* Screens and flow                                                    */
  /* ------------------------------------------------------------------ */
  function refreshUpgrades() {
    const defs = {
      start: ['uStart', 'uStartD', () => stat('start')],
      dmg: ['uDmg', 'uDmgD', () => stat('dmg').toFixed(2)],
      rate: ['uRate', 'uRateD', () => stat('rate').toFixed(2)],
      gold: ['uGold', 'uGoldD', () => stat('gold').toFixed(2)],
    };
    for (const k in defs) {
      const el = $('upg-' + k), d = defs[k], c = cost(k);
      el.querySelector('b').textContent = t(d[0]) + ' · ' + (save.upg[k] + 1);
      el.querySelector('em').textContent = t(d[1], { n: d[2]() });
      el.querySelector('.cost').textContent = fmt(c);
      el.classList.toggle('poor', save.coins < c);
    }
  }

  function resetRun() {
    finale = false; endT = 0; runCoins = 0; runKills = 0; runT = 0; dragged = 0;
    fireAcc = 0; poolAcc = 0; spawnAcc = 0; gateIdx = 0; bannerIdx = 0; shake = 0; combo = 0;
    squad.x = 0; squad.tx = 0; squad.d = 0; squad.speed = 0; squad.n = stat('start');
    pAlive.fill(0); ql.fill(0);
    const n = drawn();
    for (let i = 0; i < n; i++) { ux[i] = fox[i]; urd[i] = fod[i]; usc[i] = 1; }
  }

  function goHome() {
    buildLevel(save.level);
    resetRun();
    state = 'home';
    $('win').hidden = true; $('lose').hidden = true;
    $('home').hidden = false;
    $('progress').hidden = true; $('bossbar').hidden = true; $('count').hidden = true; $('hint').hidden = true;
    $('lvlNum').textContent = save.level;
    refreshUpgrades();
    refreshHud(true);
  }

  function startRun() {
    if (state !== 'home') return;
    audioInit();
    // the level was generated for the squad size at build time; rebuild if upgrades changed it
    if (level.builtStart !== stat('start')) { buildLevel(save.level); }
    resetRun();
    state = 'run';
    $('home').hidden = true;
    $('progress').hidden = false;
    $('progressFill').style.width = '0%';
    $('bossFill').style.width = '100%';
    if (save.seenHint < 2 && !silent) { $('hint').hidden = false; }
    showBanner('bGo');
    sfx.click();
  }

  document.querySelectorAll('.upg').forEach((el) => {
    el.addEventListener('click', () => {
      audioInit();
      const k = el.dataset.k, c = cost(k);
      if (save.coins < c) { sfx.nope(); return; }
      save.coins -= c;
      save.upg[k]++;
      persist();
      sfx.buy(); buzz(12);
      el.classList.remove('bought'); void el.offsetWidth; el.classList.add('bought');
      refreshUpgrades();
      refreshHud(true);
      if (k === 'start') {
        const before = drawn();
        squad.n = stat('start');
        for (let i = before; i < drawn(); i++) { ux[i] = fox[i]; urd[i] = fod[i]; usc[i] = 0.2; }
      }
      if (k === 'dmg') redrawLabels();
    });
  });
  $('play').addEventListener('click', startRun);
  $('winBtn').addEventListener('click', () => { audioInit(); sfx.click(); goHome(); });
  $('loseBtn').addEventListener('click', () => { audioInit(); sfx.click(); goHome(); });
  function syncMute() {
    $('muteWave').toggleAttribute('hidden', save.mute);
    $('muteX').toggleAttribute('hidden', !save.mute);
  }
  $('mute').addEventListener('click', () => { save.mute = !save.mute; persist(); syncMute(); audioInit(); sfx.click(); });
  syncMute();

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */
  let dragId = null, lastX = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (state !== 'run') return;
    dragId = e.pointerId; lastX = e.clientX;
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  stage.addEventListener('pointermove', (e) => {
    if (state !== 'run') return;
    if (dragId === null && e.pointerType === 'mouse' && e.buttons === 0) return;
    if (dragId !== null && e.pointerId !== dragId) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    squad.tx += (dx / viewW) * ROAD_HALF * 2 * 1.35;
    dragged += Math.abs(dx);
    if (dragged > 60 && !$('hint').hidden) { $('hint').hidden = true; save.seenHint++; persist(); }
  });
  const endDrag = (e) => { if (e.pointerId === dragId) dragId = null; };
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if ((e.key === ' ' || e.key === 'Enter') && state === 'home' && document.activeElement === document.body) startRun();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });
  function keySteer(dt) {
    if (state !== 'run') return;
    const dir = (keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0);
    if (dir) { squad.tx += dir * 11 * dt; if (!$('hint').hidden) { $('hint').hidden = true; } }
  }

  /* ------------------------------------------------------------------ */
  /* Main loop                                                           */
  /* ------------------------------------------------------------------ */
  let lastT = 0, paused = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    if (paused) return;
    keySteer(dt);
    if (dt > 0.025) { step(dt / 2); step(dt / 2); } else step(dt);
    draw(dt);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastT = performance.now(); });

  function redrawLabels() {
    if (!level) return;
    level.gates.forEach(drawGate);
    level.barriers.forEach((b) => { if (b.alive) drawBarrier(b); });
  }

  resize();
  goHome();
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka').then(redrawLabels).catch(() => {});
  }

  // Automation hooks used by the test bot (no effect on normal play).
  window.__kt = {
    get state() { return state; }, get level() { return level; }, get finale() { return finale; },
    squad, save, stat, cost,
    start: startRun, home: goHome,
    setSilent(v) { silent = !!v; },
    pause(v) { paused = !!v; },
    sim(seconds, bot) {
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n && state === 'run'; i++) { if (bot) bot(); step(1 / 60); }
      return state;
    },
    finish() { while (state === 'won' || state === 'lost') step(1 / 60); },
    run: { get coins() { return runCoins; }, get kills() { return runKills; } },
    setLevel(L) { save.level = L; goHome(); },
  };
})();
