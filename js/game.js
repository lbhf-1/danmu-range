import { DANMU_TYPES, EASY_POOL, ALL_POOL, pickType, CONFIG } from './data.js';

/* ------------------------------------------------------------------ *
 * 画布与坐标系：逻辑坐标 = CSS 像素，按 devicePixelRatio 放大后重绘
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (state.player) {
    state.player.x = clamp(state.player.x, state.player.w / 2 + 6, W - state.player.w / 2 - 6);
    state.player.y = H - bottomInset() - state.player.h / 2 - 10;
  }
}
const bottomInset = () => 30 + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */
const state = {
  running: false,
  over: false,
  t: 0,
  score: 0,
  kills: 0,
  combo: 0,
  bestCombo: 0,
  comboTimer: 0,
  energy: 0,
  fireTimer: 0,
  spawnTimer: 0.6,
  waveTimer: 14,
  player: null,
  bullets: [],
  danmus: [],
  missed: [],      // 糊屏：漏掉的弹幕会永久留在屏幕上，所以「漏掉的数量」就是糊屏值
  particles: [],
  floaters: [],
  shake: 0,
  flash: 0,
  lastText: '哈哈',
};

const dom = {
  hud: document.getElementById('hud'),
  score: document.getElementById('score'),
  combo: document.getElementById('combo'),
  dirtyPct: document.getElementById('dirtyPct'),
  dirtyFill: document.getElementById('dirtyFill'),
  energyPct: document.getElementById('energyPct'),
  energyFill: document.getElementById('energyFill'),
  ultBtn: document.getElementById('ultBtn'),
  startScreen: document.getElementById('startScreen'),
  overScreen: document.getElementById('overScreen'),
  overTitle: document.getElementById('overTitle'),
  deathText: document.getElementById('deathText'),
  stScore: document.getElementById('stScore'),
  stKill: document.getElementById('stKill'),
  stCombo: document.getElementById('stCombo'),
  stTime: document.getElementById('stTime'),
  dlLink: document.getElementById('dlLink'),
};

/* ------------------------------------------------------------------ *
 * 输入：拖动走位（手机）/ 方向键（桌面调试）
 * ------------------------------------------------------------------ */
const input = { targetX: null, keys: {} };

function pointerX(e) {
  const r = canvas.getBoundingClientRect();
  return (e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0) - r.left;
}
canvas.addEventListener('pointerdown', (e) => { input.targetX = pointerX(e); }, { passive: true });
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || e.pointerType === 'touch') input.targetX = pointerX(e);
}, { passive: true });
window.addEventListener('keydown', (e) => { input.keys[e.key] = true; });
window.addEventListener('keyup', (e) => { input.keys[e.key] = false; });
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ *
 * 生成弹幕
 * ------------------------------------------------------------------ */
function measure(text, size) {
  const m = ctx.measureText(text);
  return Math.max(34, m.width + 16);
}

function spawnDanmu(def, x, y, opts = {}) {
  ctx.font = `700 ${def.size}px -apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif`;
  const w = measure(def.text, def.size);
  const h = def.size + 16;
  const fallScale = 1 + 0.85 * Math.min(state.t / CONFIG.difficultyTime, 1);
  const d = {
    def,
    text: def.text,
    x: clamp(x, w / 2 + 8, W - w / 2 - 8),
    y,
    vx: opts.vx || 0,
    vy: CONFIG.baseFall * def.speed * fallScale,
    hp: opts.hp || def.hp,
    maxHp: opts.hp || def.hp,
    w: opts.long ? w * 1.5 : w,
    h,
    size: opts.size || def.size,
    t: 0,
    chaosTimer: 0,
    fakePhase: 0,
    reflected: false,
    hitFlash: 0,
    sway: rand(0, Math.PI * 2),
  };
  state.danmus.push(d);
  return d;
}

function spawnWave() {
  const progress = Math.min(state.t / CONFIG.difficultyTime, 1);
  const pool = state.t < 20 ? EASY_POOL : ALL_POOL;
  const def = pickType(pool);

  if (def.group) {
    const n = def.group;
    const gap = Math.min(def.groupSpread, (W - 80) / n);
    const startX = rand(50, Math.max(60, W - 50 - gap * (n - 1)));
    for (let i = 0; i < n; i++) spawnDanmu(def, startX + i * gap, -40 - i * 52);
    return;
  }
  spawnDanmu(def, rand(50, W - 50), -40);

  // 难度爬升：后期一次多冒几条，制造「救不过来」的压力
  const extra = [[0.3, 0.6], [0.55, 0.55], [0.78, 0.5]];
  for (const [th, chance] of extra) {
    if (progress > th && Math.random() < chance) {
      const d2 = pickType(pool);
      if (!d2.group) spawnDanmu(d2, rand(50, W - 50), -90 - Math.random() * 90);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 特效
 * ------------------------------------------------------------------ */
function burst(x, y, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(60, 260);
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(.25, .6), max: .6, color });
  }
}
function floater(x, y, text, color = '#fff') {
  state.floaters.push({ x, y, text, color, life: .8 });
}

/* ------------------------------------------------------------------ *
 * 击碎 / 漏掉
 * ------------------------------------------------------------------ */
function killDanmu(d, award = true) {
  if (award) {
    state.kills++;
    state.combo++;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.comboTimer = 1.6;
    const mult = 1 + Math.floor(state.combo / 10) * 0.5;
    const gain = Math.round(d.def.score * mult);
    state.score += gain;
    state.energy = Math.min(CONFIG.ultCost, state.energy + CONFIG.ultGain);
    burst(d.x, d.y, d.def.glow, d.def.hp > 2 ? 16 : 9);
    floater(d.x, d.y, `+${gain}`, d.def.color);
  }
  if (!award) burst(d.x, d.y, 'rgba(255,120,120,.7)', 8);

  // 哈哈哈哈哈哈：被打中分裂成三条小「哈」
  if (d.def.onDeath === 'split') {
    for (let i = 0; i < (d.def.splitCount || 3); i++) {
      const def = DANMU_TYPES.normal;
      const child = spawnDanmu({ ...def, text: '哈', size: 13, speed: 1.35, score: 5, color: d.def.color, glow: d.def.glow },
        d.x, d.y, { vx: (i - 1) * 130, size: 13 });
      child.hp = 1; child.maxHp = 1;
    }
  }
  if (d.def.drop) {
    state.energy = Math.min(CONFIG.ultCost, state.energy + 18);
    floater(d.x, d.y - 22, '已三连 +能量', '#ffd94a');
  }
}

function missDanmu(d) {
  // 漏掉的弹幕不会消失 —— 它变成半透明文字永久糊在屏幕上
  state.missed.push({ text: d.text, x: d.x, y: clamp(d.y, 40, H - 40), size: d.size, rot: rand(-.16, .16) });
  state.lastText = d.text;
  state.combo = 0;
  state.flash = Math.min(1, state.flash + .35);
  if (state.missed.length >= CONFIG.maxMiss) gameOver();
}

/* ------------------------------------------------------------------ *
 * 反弹大招
 * ------------------------------------------------------------------ */
function canUlt() { return state.running && state.energy >= CONFIG.ultCost; }
function fireUlt() {
  if (!canUlt()) return;
  state.energy = 0;
  state.shake = 16;
  state.flash = .8;
  for (const d of state.danmus) {
    d.reflected = true;
    d.vy = -Math.abs(d.vy) * 3.2 - 260;
    d.vx *= 1.7;
  }
  // 反弹把弹幕原路打回，屏幕也跟着清净一点
  state.missed.splice(0, Math.min(CONFIG.ultRelief, state.missed.length));
  floater(W / 2, H * 0.42, '反 弹 !', '#8fd0ff');
}
dom.ultBtn.addEventListener('click', fireUlt);

/* ------------------------------------------------------------------ *
 * 更新
 * ------------------------------------------------------------------ */
function update(dt) {
  state.t += dt;
  state.flash = Math.max(0, state.flash - dt * 3);
  state.shake = Math.max(0, state.shake - dt * 45);

  /* 玩家走位 */
  const p = state.player;
  let want = input.targetX;
  if (input.keys['ArrowLeft'] || input.keys['a']) want = p.x - 260 * dt * 3;
  if (input.keys['ArrowRight'] || input.keys['d']) want = p.x + 260 * dt * 3;
  if (want != null) {
    p.x += (clamp(want, p.w / 2 + 6, W - p.w / 2 - 6) - p.x) * Math.min(1, CONFIG.playerLerp * dt);
  }
  p.x = clamp(p.x, p.w / 2 + 6, W - p.w / 2 - 6);

  /* 自动开火 */
  state.fireTimer -= dt;
  if (state.fireTimer <= 0) {
    state.fireTimer = CONFIG.fireInterval;
    state.bullets.push({ x: p.x, y: p.y - p.h / 2, vx: 0, vy: -CONFIG.bulletSpeed });
  }

  /* 子弹 */
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.y += b.vy * dt;
    b.x += b.vx * dt;
    if (b.y < -30) state.bullets.splice(i, 1);
  }

  /* 连击衰减 */
  if (state.combo > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }

  /* 生成 */
  const progress = Math.min(state.t / CONFIG.difficultyTime, 1);
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnWave();
    state.spawnTimer = CONFIG.spawnStart + (CONFIG.spawnEnd - CONFIG.spawnStart) * Math.min(state.t / CONFIG.spawnRamp, 1);
  }
  state.waveTimer -= dt;
  if (state.waveTimer <= 0) {
    state.waveTimer = rand(13, 19);
    const def = DANMU_TYPES.qianpai;
    for (let i = 0; i < 5; i++) spawnDanmu(def, rand(60, W - 60), -40 - i * 40);
  }

  /* 弹幕行为 */
  for (let i = state.danmus.length - 1; i >= 0; i--) {
    const d = state.danmus[i];
    d.t += dt;
    d.y += d.vy * dt;

    if (!d.reflected) {
      // ？？？？：随机变向
      if (d.def.chaos) {
        d.chaosTimer -= dt;
        if (d.chaosTimer <= 0) {
          d.chaosTimer = rand(.25, .55);
          d.vx = rand(-d.def.chaosStrength, d.def.chaosStrength);
        }
      }
      // 就这？：主动闪避最近的子弹
      if (d.def.evade) {
        let nearest = null, nd = 1e9;
        for (const b of state.bullets) {
          if (b.y < d.y) continue;
          const dist = Math.hypot(b.x - d.x, b.y - d.y);
          if (dist < nd) { nd = dist; nearest = b; }
        }
        if (nearest && nd < 200) {
          d.vx += Math.sign(d.x - nearest.x || 1) * d.def.evadeStrength * dt * 3;
        }
        d.vx *= (1 - 1.6 * dt);
        d.x += Math.sin(d.t * 3.4 + d.sway) * 60 * dt;
      }
      // 下次一定：靠近后突然倒退逃跑
      if (d.def.fake) {
        if (d.fakePhase === 0 && d.y > H * 0.42) { d.fakePhase = 1; }
        if (d.fakePhase === 1) {
          d.y -= Math.abs(d.vy) * dt * 2.6;
          d.x += Math.sin(d.t * 5) * 130 * dt;
          if (d.y < H * 0.12) d.fakePhase = 2;
        }
      }
    } else {
      state.score += 1;
    }

    d.x += d.vx * dt;
    if (d.x < d.w / 2) { d.x = d.w / 2; d.vx = Math.abs(d.vx); }
    if (d.x > W - d.w / 2) { d.x = W - d.w / 2; d.vx = -Math.abs(d.vx); }
    d.hitFlash = Math.max(0, d.hitFlash - dt * 5);

    /* 反弹后的弹幕飞出顶部 —— 结算分数 */
    if (d.reflected) {
      if (d.y < -60) {
        state.score += Math.round(d.def.score * 1.5);
        state.danmus.splice(i, 1);
      }
      continue;
    }

    /* 命中判定 */
    let hit = false;
    for (let j = state.bullets.length - 1; j >= 0; j--) {
      const b = state.bullets[j];
      if (b.x > d.x - d.w / 2 && b.x < d.x + d.w / 2 && b.y > d.y - d.h / 2 && b.y < d.y + d.h / 2) {
        state.bullets.splice(j, 1);
        d.hp--;
        d.hitFlash = 1;
        hit = true;
        burst(b.x, b.y, d.def.glow, 4);
        break;
      }
    }
    if (hit && d.hp <= 0) {
      killDanmu(d, true);
      state.danmus.splice(i, 1);
      continue;
    }

    /* 漏掉：落到底部 */
    if (d.y - d.h / 2 > H - bottomInset()) {
      missDanmu(d);
      state.danmus.splice(i, 1);
    }
  }

  /* 粒子 / 飘字 */
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const q = state.particles[i];
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= (1 - 3 * dt); q.vy *= (1 - 3 * dt);
    q.life -= dt;
    if (q.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.floaters.length - 1; i >= 0; i--) {
    const f = state.floaters[i];
    f.y -= 52 * dt; f.life -= dt;
    if (f.life <= 0) state.floaters.splice(i, 1);
  }

  syncHud();
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */
const FONT = (s, w = 700) => `${w} ${s}px -apple-system,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif`;

function render() {
  ctx.save();
  if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake) * .4, rand(-state.shake, state.shake) * .4);

  // 背景
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d1220');
  g.addColorStop(.55, '#0a0e19');
  g.addColorStop(1, '#141026');
  ctx.fillStyle = g;
  ctx.fillRect(-40, -40, W + 80, H + 80);

  // 网格
  ctx.strokeStyle = 'rgba(120,160,255,.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // 底部危险线
  const baseY = H - bottomInset();
  ctx.strokeStyle = 'rgba(255,90,90,.30)';
  ctx.setLineDash([7, 9]);
  ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(W, baseY); ctx.stroke();
  ctx.setLineDash([]);

  /* 糊屏层：漏掉的弹幕永久糊在屏幕上，越糊越看不清 */
  const dirty = state.missed.length / CONFIG.maxMiss;
  for (let i = 0; i < state.missed.length; i++) {
    const m = state.missed[i];
    const a = 0.13 + dirty * 0.5;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.rot);
    ctx.globalAlpha = a;
    ctx.font = FONT(m.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9fb0d8';
    ctx.shadowColor = 'rgba(160,190,255,.5)';
    ctx.shadowBlur = 12;
    ctx.fillText(m.text, 0, 0);
    ctx.restore();
  }
  if (state.missed.length) {
    // 糊屏整体再蒙一层，强化「看不清」的压迫感
    ctx.fillStyle = `rgba(120,140,190,${dirty * 0.20})`;
    ctx.fillRect(0, 0, W, H);
  }

  /* 弹幕 */
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const d of state.danmus) {
    const alpha = d.reflected ? .95 : 1;
    ctx.globalAlpha = alpha;
    ctx.font = FONT(d.size);
    const w = d.w, h = d.h;
    // 底衬
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.reflected) ctx.rotate(Math.sin(d.t * 12) * .08);
    ctx.beginPath();
    const r = h / 2;
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fillStyle = d.hitFlash > 0 ? 'rgba(255,255,255,.9)'
      : d.def.gold ? 'rgba(70,55,10,.85)' : 'rgba(24,32,52,.78)';
    ctx.fill();
    ctx.lineWidth = d.reflected ? 2.4 : 1.4;
    ctx.strokeStyle = d.def.gold ? 'rgba(255,214,74,.95)'
      : d.reflected ? 'rgba(140,210,255,.95)' : 'rgba(255,255,255,.22)';
    ctx.stroke();

    ctx.fillStyle = d.hitFlash > 0 ? '#0b0e17' : d.def.color;
    ctx.shadowColor = d.def.glow;
    ctx.shadowBlur = d.def.gold || d.reflected ? 22 : 12;
    ctx.fillText(d.text, 0, 1);
    ctx.shadowBlur = 0;

    // 多血弹幕的血条
    if (d.maxHp > 1 && d.hp < d.maxHp) {
      const bw = w * .74;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(-bw / 2, h / 2 - 4, bw, 3.5);
      ctx.fillStyle = d.def.color;
      ctx.fillRect(-bw / 2, h / 2 - 4, bw * (d.hp / d.maxHp), 3.5);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  /* 子弹 */
  for (const b of state.bullets) {
    const bg = ctx.createLinearGradient(0, b.y - 22, 0, b.y + 8);
    bg.addColorStop(0, 'rgba(140,225,255,0)');
    bg.addColorStop(1, 'rgba(190,245,255,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(b.x - CONFIG.bulletW / 2, b.y - CONFIG.bulletH, CONFIG.bulletW, CONFIG.bulletH);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillRect(b.x - 1, b.y - 8, 2, 8);
  }

  /* 粒子 */
  for (const q of state.particles) {
    ctx.globalAlpha = Math.max(0, q.life / q.max);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  /* 玩家：一个朝上的炮台 */
  if (state.player) {
    const p = state.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowColor = 'rgba(110,170,255,.85)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(0, -p.h / 2);
    ctx.lineTo(p.w / 2, p.h / 2);
    ctx.lineTo(p.w / 4, p.h / 2 - 4);
    ctx.lineTo(-p.w / 4, p.h / 2 - 4);
    ctx.lineTo(-p.w / 2, p.h / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(120,180,255,.92)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(200,230,255,.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /* 飘字 */
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.min(1, f.life / .55);
    ctx.font = FONT(f.text.length > 6 ? 15 : 20, 800);
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 14;
    ctx.fillText(f.text, f.x, f.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  /* 反弹就绪时的屏幕边缘辉光 */
  if (canUlt()) {
    ctx.strokeStyle = `rgba(120,200,255,${.35 + Math.sin(state.t * 6) * .2})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, W - 4, H - 4);
  }

  /* 受击白闪 */
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,120,140,${state.flash * 0.30})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* ------------------------------------------------------------------ *
 * HUD
 * ------------------------------------------------------------------ */
function syncHud() {
  dom.score.textContent = state.score.toLocaleString('en-US');
  dom.combo.textContent = `连击 x${state.combo}` + (state.bestCombo > 0 ? `  ·  最高 ${state.bestCombo}` : '');
  const dirty = Math.round(state.missed.length / CONFIG.maxMiss * 100);
  const en = Math.round(state.energy / CONFIG.ultCost * 100);
  dom.dirtyPct.textContent = dirty + '%';
  dom.dirtyFill.style.width = dirty + '%';
  dom.energyPct.textContent = en + '%';
  dom.energyFill.style.width = en + '%';
  dom.ultBtn.classList.toggle('hidden', !canUlt());
}

/* ------------------------------------------------------------------ *
 * 主循环
 * ------------------------------------------------------------------ */
let last = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - last) / 1000 || 0, 1 / 24);
  last = ts;
  if (state.running) update(dt);
  render();
}

/* ------------------------------------------------------------------ *
 * 开始 / 结束
 * ------------------------------------------------------------------ */
function reset() {
  state.running = true;
  state.over = false;
  state.t = 0; state.score = 0; state.kills = 0; state.combo = 0; state.bestCombo = 0;
  state.comboTimer = 0; state.energy = 0; state.fireTimer = 0;
  state.spawnTimer = .6; state.waveTimer = 14;
  state.bullets = []; state.danmus = []; state.missed = [];
  state.particles = []; state.floaters = [];
  state.shake = 0; state.flash = 0; state.lastText = '哈哈';
  state.player = { x: W / 2, y: H - bottomInset() - CONFIG.playerH / 2 - 10, w: CONFIG.playerW, h: CONFIG.playerH };
  input.targetX = null;
  dom.dlLink.classList.add('hidden');
  syncHud();
}

function gameOver() {
  state.running = false;
  state.over = true;
  const mins = Math.floor(state.t / 60);
  const secs = Math.floor(state.t % 60);
  dom.overTitle.textContent = `你被 ${state.missed.length} 条弹幕淹没了`;
  dom.deathText.textContent = `你死于「${state.lastText}」`;
  dom.stScore.textContent = state.score.toLocaleString('en-US');
  dom.stKill.textContent = state.kills.toLocaleString('en-US');
  dom.stCombo.textContent = state.bestCombo;
  dom.stTime.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  dom.overScreen.classList.remove('hidden');
  dom.hud.classList.add('hidden');
  dom.ultBtn.classList.add('hidden');
  makeShareCard();
}

document.getElementById('startBtn').addEventListener('click', () => {
  dom.startScreen.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  reset();
});
document.getElementById('againBtn').addEventListener('click', () => {
  dom.overScreen.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  reset();
});

/* ------------------------------------------------------------------ *
 * 战绩图：结算页那行「你死于哪一条弹幕」天生适合截图传播
 * ------------------------------------------------------------------ */
function makeShareCard() {
  const cw = 720, ch = 1040;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');

  const bg = g.createLinearGradient(0, 0, cw, ch);
  bg.addColorStop(0, '#141a2e'); bg.addColorStop(.5, '#0c1120'); bg.addColorStop(1, '#1a1230');
  g.fillStyle = bg; g.fillRect(0, 0, cw, ch);

  g.strokeStyle = 'rgba(120,160,255,.14)';
  for (let x = 0; x < cw; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ch); g.stroke(); }
  for (let y = 0; y < ch; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); }

  g.textAlign = 'center'; g.textBaseline = 'middle';
  const CJK = '700 %spx -apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif';

  g.font = CJK.replace('%s', 56);
  const title = g.createLinearGradient(150, 0, 570, 0);
  title.addColorStop(0, '#5ee7ff'); title.addColorStop(.5, '#8a7cff'); title.addColorStop(1, '#ff6ad5');
  g.fillStyle = title;
  g.fillText('弹 幕 靶 场', cw / 2, 130);

  g.font = CJK.replace('%s', 24);
  g.fillStyle = 'rgba(200,215,255,.55)';
  g.fillText('你的评论区，就是我的靶场。', cw / 2, 196);

  g.font = CJK.replace('%s', 30);
  g.fillStyle = 'rgba(255,140,140,.9)';
  g.fillText(`你被 ${state.missed.length} 条弹幕淹没了`, cw / 2, 300);

  g.font = CJK.replace('%s', 62);
  g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(255,120,180,.75)'; g.shadowBlur = 34;
  g.fillText(`你死于「${state.lastText}」`, cw / 2, 392);
  g.shadowBlur = 0;

  const rows = [
    ['得分', state.score.toLocaleString('en-US')],
    ['击碎弹幕', state.kills.toLocaleString('en-US') + ' 条'],
    ['最高连击', String(state.bestCombo)],
    ['存活时间', `${Math.floor(state.t / 60)}:${String(Math.floor(state.t % 60)).padStart(2, '0')}`],
  ];
  g.strokeStyle = 'rgba(255,255,255,.13)';
  g.beginPath(); g.moveTo(70, 486); g.lineTo(cw - 70, 486); g.stroke();
  let y = 548;
  for (const [label, val] of rows) {
    g.textAlign = 'left';
    g.font = CJK.replace('%s', 26); g.fillStyle = 'rgba(190,205,240,.65)';
    g.fillText(label, 110, y);
    g.textAlign = 'right';
    g.font = CJK.replace('%s', 38); g.fillStyle = '#ffffff';
    g.fillText(val, cw - 110, y);
    y += 68;
  }
  g.beginPath(); g.moveTo(70, y - 30); g.lineTo(cw - 70, y - 30); g.stroke();

  // 糊屏的弹幕也印上去，一眼看懂玩法
  const sample = state.missed.slice(-7);
  g.textAlign = 'center';
  sample.forEach((m, i) => {
    g.save();
    g.globalAlpha = .30 + i * 0.07;
    g.font = CJK.replace('%s', 22);
    g.fillStyle = '#9fb0d8';
    g.translate(80 + (i % 2) * 430 + (i % 3) * 45, 812 + i * 22);
    g.rotate((i % 2 ? 1 : -1) * .07);
    g.fillText(m.text, 0, 0);
    g.restore();
  });

  g.font = CJK.replace('%s', 22);
  g.fillStyle = 'rgba(150,170,215,.5)';
  g.fillText('打碎评论区的弹幕，别让它糊住你', cw / 2, 994);

  dom.dlLink.href = c.toDataURL('image/png');
}

document.getElementById('saveBtn').addEventListener('click', () => {
  if (!dom.dlLink.href) makeShareCard();
  dom.dlLink.click();                      // 自动触发保存
  dom.dlLink.classList.remove('hidden');   // 万一被浏览器拦了，给个手动兜底
  dom.dlLink.textContent = '没自动保存？点这里';
});

/* 启动 */
resize();
requestAnimationFrame(loop);
