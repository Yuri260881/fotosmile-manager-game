/* =====================================================================
   МЕНЕДЖЕР ФОТОСМАЙЛ — game.js
   Полностью оригинальная браузерная мини-игра (HTML5 Canvas + Web Audio).
   Без внешних библиотек и файлов-ассетов: вся графика рисуется кодом,
   все звуки синтезируются Web Audio API.

   Разделы:
     1.  Константы и утилиты
     2.  Кривая сложности
     3.  Рекорд (localStorage)
     4.  Звук
     5.  Графика: фон, принтеры, фотографии, менеджер
     6.  Состояние игры
     7.  Создание и движение фотографий
     8.  Управление персонажем
     9.  Столкновения, очки, жизни, пасхалки
     10. Игровой цикл (requestAnimationFrame)
     11. Отрисовка кадра
     12. Интерфейс
     13. Ввод (клавиатура / NumPad / тач / свайпы)
     14. Запуск
   ===================================================================== */
(function () {
'use strict';

/* ===================================================================
   1. КОНСТАНТЫ И УТИЛИТЫ
   =================================================================== */
const W = 1000, H = 760;                 // логический размер игрового поля
const CX = W / 2, CY = H / 2;            // центр поля = рабочая зона менеджера
const POSES = ['tl', 'tr', 'bl', 'br'];  // 4 принтера по углам

/* Направление от центра к принтеру.
   ВАЖНО: в canvas ось Y направлена вниз, поэтому «вверх» — это sin < 0,
   а «влево» — cos < 0. */
const POSE_ANGLE = {
  tl: -3 * Math.PI / 4,   // ↖ верхний левый  (cos<0, sin<0)
  tr: -Math.PI / 4,       // ↗ верхний правый (cos>0, sin<0)
  bl:  3 * Math.PI / 4,   // ↙ нижний левый   (cos<0, sin>0)
  br:  Math.PI / 4        // ↘ нижний правый  (cos>0, sin>0)
};

const PHOTO_W = 118, PHOTO_H = 142;      // напечатанная фотография
const TRAY_X0 = CX;                      // «лоток» менеджера
const TRAY_Y0 = CY + 74 - 96;            // = 358
const TRAY_RX = 86, TRAY_RY = 80;        // вылет лотка в сторону позиции
const FLIGHT_TARGET_RADIUS = 118;        // куда долетает фотография
const CATCH_RADIUS = 66;                 // радиус захвата вокруг лотка
const STALL_TIME = 0.26;                 // «последний шанс» (сек)
const SWITCH_BLOCK_RADIUS = 150;         // менять позицию нельзя, если фото уже почти у центра

const COLORS = {
  ink: '#2c2a35',
  yellow: '#ffd166',
  yellowDeep: '#ffb020',
  orange: '#ff8a3d',
  pink: '#ff5f7e',
  sky: '#4fb6ff',
  skyDeep: '#2b8fd6',
  mint: '#5ec79a'
};


/* Инлайн-SVG для интерфейса: эмодзи есть не во всех системах, а SVG работает всегда */
const SVG_SOUND_ON =
  '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">' +
  '<path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4z" fill="currentColor"/>' +
  '<path d="M15.1 8.7a4.6 4.6 0 0 1 0 6.6M17.7 6.2a8 8 0 0 1 0 11.6" fill="none" ' +
  'stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
const SVG_SOUND_OFF =
  '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">' +
  '<path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4z" fill="currentColor"/>' +
  '<path d="M15.6 9.6l5 4.8M20.6 9.6l-5 4.8" fill="none" stroke="currentColor" ' +
  'stroke-width="1.9" stroke-linecap="round"/></svg>';
const SVG_TROPHY =
  '<svg viewBox="0 0 24 24" width="20" height="20" style="vertical-align:-3px" aria-hidden="true">' +
  '<path d="M7 3.5h10v5.2a5 5 0 0 1-10 0z" fill="#ffd166" stroke="#e0a112" stroke-width="1.2"/>' +
  '<path d="M7 5H4.6a2.5 2.5 0 0 0 2.4 5M17 5h2.4a2.5 2.5 0 0 1-2.4 5" fill="none" ' +
  'stroke="#e0a112" stroke-width="1.4"/>' +
  '<path d="M10.2 13.6h3.6l.5 2.9h-4.6z" fill="#e0a112"/>' +
  '<rect x="7" y="16.6" width="10" height="3.2" rx="1.5" fill="#ffb020"/></svg>';
const SVG_PAUSE_BIG =
  '<svg viewBox="0 0 48 48" width="54" height="54" aria-hidden="true">' +
  '<circle cx="24" cy="24" r="22" fill="#fff3cf" stroke="#ffd166" stroke-width="3"/>' +
  '<rect x="16.5" y="14" width="5.5" height="20" rx="2.6" fill="#ff8a3d"/>' +
  '<rect x="26" y="14" width="5.5" height="20" rx="2.6" fill="#ff8a3d"/></svg>';

const PHRASES = ['Отлично!', 'Готово!', 'Следующий заказ!', 'Супер!', 'Клиент доволен!', 'Кадр в дело!'];
const MILESTONES = [
  { at: 25,  text: 'Начался час пик!' },
  { at: 50,  text: 'Заказов всё больше!' },
  { at: 100, text: 'Настоящий профи!' }
];

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const pick  = (arr) => arr[(Math.random() * arr.length) | 0];

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/* ===================================================================
   2. КРИВАЯ СЛОЖНОСТИ
   Плавная логистическая кривая от 0 (спокойно) до 1 (максимум),
   плюс гарантия честности: блокировка спавна рядом с центром.
   =================================================================== */
const Difficulty = {
  CURVE_CENTER: 48,   // очков до «середины» сложности
  CURVE_SCALE: 24,
  cfg(score) {
    const s = Math.max(0, score);
    const raw = (x) => 1 / (1 + Math.exp(-(x - this.CURVE_CENTER) / this.CURVE_SCALE));
    const t = clamp((raw(s) - raw(0)) / (1 - raw(0)), 0, 1);

    return {
      t: t,
      photoSpeed:      lerp(180, 700, t),                              // px/сек
      intervalMin:     lerp(1.05, 0.27, t),                            // пауза между фото
      intervalMax:     lerp(1.90, 0.38, t),
      warningMin:      lerp(0.65, 0.16, t),                            // предупреждение принтера
      warningMax:      lerp(0.90, 0.22, t),
      maxActivePhotos: Math.round(lerp(1, 4, Math.pow(t, 0.85)))
    };
  }
};

/* ===================================================================
   3. РЕКОРД (localStorage)
   =================================================================== */
const Store = {
  KEY: 'fotosmile.record.v1',
  SOUND_KEY: 'fotosmile.sound.v1',
  read() {
    try {
      const v = parseInt(window.localStorage.getItem(this.KEY) || '0', 10);
      return (isFinite(v) && v > 0) ? v : 0;
    } catch (e) { return 0; }
  },
  write(v) {
    try { window.localStorage.setItem(this.KEY, String(v)); } catch (e) {}
  },
  readSound() {
    try { return window.localStorage.getItem(this.SOUND_KEY) !== 'off'; } catch (e) { return true; }
  },
  writeSound(on) {
    try { window.localStorage.setItem(this.SOUND_KEY, on ? 'on' : 'off'); } catch (e) {}
  }
};

/* ===================================================================
   4. ЗВУК — всё синтезируется на месте, файлов не нужно
   =================================================================== */
const Sound = {
  ctx: null,
  master: null,
  noise: null,
  enabled: Store.readSound(),
  _last: {},

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.4 : 0;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  },

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
  },

  setEnabled(on) {
    this.enabled = !!on;
    Store.writeSound(on);
    if (this.master && this.ctx) {
      try { this.master.gain.setTargetAtTime(on ? 0.4 : 0, this.ctx.currentTime, 0.02); }
      catch (e) { this.master.gain.value = on ? 0.4 : 0; }
    }
    if (on) this.resume();
    return this.enabled;
  },

  ok() { return !!(this.ctx && this.enabled); },

  throttle(key, ms) {
    const now = this.ctx ? this.ctx.currentTime * 1000 : Date.now();
    if (this._last[key] && now - this._last[key] < ms) return false;
    this._last[key] = now;
    return true;
  },

  tone(freq, dur, type, gain, delay, freqEnd) {
    if (!this.ok()) return;
    const ctx = this.ctx, t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
    const vol = (gain === undefined) ? 0.16 : gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  },

  noiseBurst(dur, freq, q, gain, delay, type) {
    if (!this.ok() || !this.noise) return;
    const ctx = this.ctx, t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.1, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  },

  /* --- игровые события --- */
  printer() {
    if (!this.throttle('printer', 110)) return;
    this.noiseBurst(0.30, 900, 1.1, 0.05);
    this.tone(150, 0.28, 'square', 0.028, 0, 118);
    this.tone(210, 0.09, 'square', 0.02, 0.12);
  },
  photoOut() {
    this.noiseBurst(0.16, 2400, 0.9, 0.055);
    this.tone(620, 0.11, 'triangle', 0.07, 0.02, 1150);
  },
  catchGood() {
    if (!this.throttle('catch', 60)) return;
    this.tone(660, 0.09, 'sine', 0.16, 0);
    this.tone(990, 0.13, 'sine', 0.14, 0.07);
    this.tone(1320, 0.10, 'triangle', 0.06, 0.13);
  },
  missSnd() {
    this.noiseBurst(0.22, 300, 0.7, 0.11, 0, 'lowpass');
    this.tone(260, 0.30, 'sawtooth', 0.10, 0.01, 70);
  },
  gameOver() {
    [523, 415, 330, 247].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.15, i * 0.17));
    this.tone(123, 0.9, 'sine', 0.09, 0.46);
  },
  recordSnd() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.12, i * 0.085));
  },
  milestone() {
    this.tone(784, 0.12, 'triangle', 0.12, 0);
    this.tone(1175, 0.16, 'triangle', 0.09, 0.10);
  },
  countdown(isGo) {
    if (isGo) { this.tone(880, 0.22, 'triangle', 0.15, 0); this.tone(1320, 0.20, 'triangle', 0.09, 0.03); }
    else this.tone(520, 0.12, 'square', 0.09, 0);
  },
  step() { this.tone(330, 0.045, 'sine', 0.035, 0); },
  blocked() { this.tone(150, 0.07, 'square', 0.05, 0); },
  click() { this.tone(420, 0.06, 'triangle', 0.08, 0); }
};

/* ===================================================================
   5. ГРАФИКА
   =================================================================== */

/* ---------- 5.1 Картинки внутри фотографий (8 вариантов) ---------- */
const ART_IDS = ['family', 'cat', 'sea', 'child', 'flowers', 'vacation', 'city', 'holiday'];

function facePortrait(ctx, w, h, skin, hairCol, shirtCol, size) {
  const cx = w / 2, r = size;
  ctx.fillStyle = shirtCol;
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.5, h);
  ctx.quadraticCurveTo(cx - r * 1.45, h - r * 1.9, cx, h - r * 1.85);
  ctx.quadraticCurveTo(cx + r * 1.45, h - r * 1.9, cx + r * 1.5, h);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = skin;
  ctx.fillRect(cx - r * 0.34, h - r * 2.15, r * 0.68, r * 0.55);
  ctx.beginPath(); ctx.arc(cx, h - r * 2.35, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hairCol;
  ctx.beginPath(); ctx.arc(cx, h - r * 2.55, r * 1.06, Math.PI * 1.04, Math.PI * 1.96); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx - r * 0.98, h - r * 2.05, r * 0.34, r * 0.86, 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r * 0.98, h - r * 2.05, r * 0.34, r * 0.86, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a3348';
  ctx.beginPath(); ctx.arc(cx - r * 0.36, h - r * 2.42, r * 0.125, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.36, h - r * 2.42, r * 0.125, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c9556b'; ctx.lineWidth = Math.max(1.5, r * 0.11); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, h - r * 2.25, r * 0.34, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,150,.35)';
  ctx.beginPath(); ctx.arc(cx - r * 0.66, h - r * 2.14, r * 0.20, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.66, h - r * 2.14, r * 0.20, 0, Math.PI * 2); ctx.fill();
}

function drawArt(ctx, id, w, h) {
  switch (id) {
    /* СЕМЬЯ */
    case 'family': {
      ctx.fillStyle = '#ffe9cf'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffd9a8'; ctx.fillRect(0, h * 0.66, w, h * 0.34);
      ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.07, h * 0.09, w * 0.17, h * 0.15);
      ctx.fillStyle = '#9fd6f5'; ctx.fillRect(w * 0.085, h * 0.105, w * 0.14, h * 0.115);
      const s = h * 0.30;
      facePortrait(ctx, w * 0.30, h, '#f7c9a3', '#5b4636', '#5ea9d8', s * 0.85);
      facePortrait(ctx, w * 0.68, h, '#f7c9a3', '#8a4b2a', '#e8739a', s * 0.85);
      facePortrait(ctx, w * 0.50, h * 0.99, '#ffd7b8', '#6b4a2f', '#ffd166', s * 0.48);
      const hx = w * 0.86, hy = h * 0.16, hs = Math.min(w, h) * 0.055;
      ctx.fillStyle = '#ff5f7e';
      ctx.beginPath();
      ctx.moveTo(hx, hy + hs);
      ctx.bezierCurveTo(hx - hs * 1.4, hy - hs * 0.4, hx - hs * 0.5, hy - hs * 1.4, hx, hy - hs * 0.35);
      ctx.bezierCurveTo(hx + hs * 0.5, hy - hs * 1.4, hx + hs * 1.4, hy - hs * 0.4, hx, hy + hs);
      ctx.fill();
      break;
    }
    /* КОТ */
    case 'cat': {
      ctx.fillStyle = '#fff1da'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffe2b8'; ctx.fillRect(0, h * 0.72, w, h * 0.28);
      const cx = w * 0.5, cy = h * 0.56, r = Math.min(w, h) * 0.26;
      ctx.fillStyle = '#ffa64d';
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.05, r, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffa64d'; ctx.lineWidth = r * 0.30; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + r * 0.9, cy + r * 1.2);
      ctx.quadraticCurveTo(cx + r * 1.85, cy + r * 0.9, cx + r * 1.5, cy - r * 0.1); ctx.stroke();
      ctx.fillStyle = '#ffa64d';
      ctx.beginPath(); ctx.moveTo(cx - r * 0.82, cy - r * 0.72); ctx.lineTo(cx - r * 0.42, cy - r * 1.5); ctx.lineTo(cx - r * 0.12, cy - r * 0.78); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + r * 0.82, cy - r * 0.72); ctx.lineTo(cx + r * 0.42, cy - r * 1.5); ctx.lineTo(cx + r * 0.12, cy - r * 0.78); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd0a8';
      ctx.beginPath(); ctx.moveTo(cx - r * 0.68, cy - r * 0.78); ctx.lineTo(cx - r * 0.44, cy - r * 1.24); ctx.lineTo(cx - r * 0.26, cy - r * 0.8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + r * 0.68, cy - r * 0.78); ctx.lineTo(cx + r * 0.44, cy - r * 1.24); ctx.lineTo(cx + r * 0.26, cy - r * 0.8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f2a3a';
      ctx.beginPath(); ctx.ellipse(cx - r * 0.36, cy - r * 0.10, r * 0.11, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + r * 0.36, cy - r * 0.10, r * 0.11, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff7f9c';
      ctx.beginPath(); ctx.moveTo(cx - r * 0.11, cy + r * 0.26); ctx.lineTo(cx + r * 0.11, cy + r * 0.26); ctx.lineTo(cx, cy + r * 0.40); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c96a4a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx - r * 0.16, cy + r * 0.44, r * 0.16, 0, Math.PI * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + r * 0.16, cy + r * 0.44, r * 0.16, Math.PI * 0.1, Math.PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,90,60,.5)'; ctx.lineWidth = 1.2;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath(); ctx.moveTo(cx - r * 0.2, cy + r * 0.36); ctx.lineTo(cx - r * 1.05, cy + r * 0.20 + k * r * 0.30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + r * 0.2, cy + r * 0.36); ctx.lineTo(cx + r * 1.05, cy + r * 0.20 + k * r * 0.30); ctx.stroke();
      }
      ctx.fillStyle = '#ffd0a8';
      ctx.beginPath(); ctx.ellipse(cx - r * 0.42, cy + r * 1.62, r * 0.28, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + r * 0.42, cy + r * 1.62, r * 0.28, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    /* МОРЕ */
    case 'sea': {
      ctx.fillStyle = '#bfe4ff'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(w * 0.78, h * 0.19, Math.min(w, h) * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3f9fd6'; ctx.fillRect(0, h * 0.52, w, h * 0.48);
      ctx.fillStyle = '#59b4e6'; ctx.fillRect(0, h * 0.52, w, h * 0.10);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (let row = 0; row < 4; row++) {
        const y = h * (0.64 + row * 0.10);
        ctx.beginPath();
        for (let x = -10; x < w + 10; x += 22) {
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 11, y - 7, x + 22, y);
        }
        ctx.stroke();
      }
      const bx = w * 0.34, by = h * 0.50;
      ctx.fillStyle = '#8a5a3b';
      ctx.beginPath(); ctx.moveTo(bx - w * 0.16, by); ctx.lineTo(bx + w * 0.16, by); ctx.lineTo(bx + w * 0.10, by + h * 0.06); ctx.lineTo(bx - w * 0.10, by + h * 0.06); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#6d452c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - h * 0.28); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(bx + 3, by - h * 0.27); ctx.lineTo(bx + w * 0.17, by - h * 0.04); ctx.lineTo(bx + 3, by - h * 0.04); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5f7e';
      ctx.beginPath(); ctx.moveTo(bx - 3, by - h * 0.24); ctx.lineTo(bx - w * 0.13, by - h * 0.04); ctx.lineTo(bx - 3, by - h * 0.04); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(w * 0.60, h * 0.14); ctx.quadraticCurveTo(w * 0.65, h * 0.08, w * 0.70, h * 0.14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.50, h * 0.24); ctx.quadraticCurveTo(w * 0.54, h * 0.19, w * 0.58, h * 0.24); ctx.stroke();
      break;
    }
    /* РЕБЁНОК */
    case 'child': {
      ctx.fillStyle = '#ffe6f0'; ctx.fillRect(0, 0, w, h);
      const r = Math.min(w, h) * 0.20;
      ctx.fillStyle = '#8ed081';
      ctx.beginPath(); ctx.arc(w * 0.82, h * 0.80, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w * 0.82, h * 0.80, r * 0.35, 0.2, 2.4); ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.ellipse(w * 0.44, h * 1.02, r * 1.25, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd7b8';
      ctx.beginPath(); ctx.arc(w * 0.44, h * 0.52, r * 1.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a9713c';
      [[-0.9, -0.45], [-0.5, -0.85], [0, -1.0], [0.5, -0.85], [0.9, -0.45]].forEach((c) => {
        ctx.beginPath();
        ctx.arc(w * 0.44 + c[0] * r, h * 0.52 + c[1] * r, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#3a3348';
      ctx.beginPath(); ctx.arc(w * 0.44 - r * 0.38, h * 0.54, r * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.44 + r * 0.38, h * 0.54, r * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9556b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w * 0.44, h * 0.68, r * 0.17, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,150,.4)';
      ctx.beginPath(); ctx.arc(w * 0.44 - r * 0.68, h * 0.62, r * 0.20, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.44 + r * 0.68, h * 0.62, r * 0.20, 0, Math.PI * 2); ctx.fill();
      break;
    }
    /* ЦВЕТЫ */
    case 'flowers': {
      ctx.fillStyle = '#eefbe4'; ctx.fillRect(0, 0, w, h);
      const petals = ['#ff8fb1', '#ffd166', '#c79bff', '#ff9f6e', '#7fd6ff'];
      [[0.22, 0.30], [0.52, 0.20], [0.78, 0.34], [0.34, 0.62], [0.64, 0.66]].forEach((p, i) => {
        const fx = w * p[0], fy = h * p[1], fr = Math.min(w, h) * 0.10;
        ctx.strokeStyle = '#6cb85f'; ctx.lineWidth = Math.max(2, fr * 0.28); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(fx, fy + fr * 0.8); ctx.lineTo(fx + fr * 0.25, h * 0.98); ctx.stroke();
        ctx.fillStyle = petals[i % petals.length];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(fx + Math.cos(a) * fr * 0.62, fy + Math.sin(a) * fr * 0.62, fr * 0.40, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath(); ctx.arc(fx, fy, fr * 0.34, 0, Math.PI * 2); ctx.fill();
      });
      break;
    }
    /* ОТПУСК */
    case 'vacation': {
      ctx.fillStyle = '#cbeaff'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9fd8ff'; ctx.fillRect(0, h * 0.44, w, h * 0.16);
      ctx.fillStyle = '#ffe6a8'; ctx.fillRect(0, h * 0.60, w, h * 0.40);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(w * 0.20, h * 0.19, Math.min(w, h) * 0.13, 0, Math.PI * 2); ctx.fill();
      const ux = w * 0.62, uy = h * 0.34, ur = Math.min(w, h) * 0.30;
      ctx.fillStyle = '#ff5f7e';
      ctx.beginPath(); ctx.arc(ux, uy, ur, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(ux, uy); ctx.arc(ux, uy, ur, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ux, uy); ctx.arc(ux, uy, ur, Math.PI * 1.75, Math.PI * 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c98a4b'; ctx.lineWidth = Math.max(2.4, ur * 0.10); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(ux, h * 0.86); ctx.stroke();
      ctx.fillStyle = '#7fd6ff';
      ctx.beginPath(); ctx.moveTo(w * 0.06, h * 0.80); ctx.lineTo(w * 0.42, h * 0.80); ctx.lineTo(w * 0.36, h * 0.94); ctx.lineTo(w * 0.02, h * 0.94); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.16, h * 0.80, w * 0.05, h * 0.14);
      ctx.fillStyle = '#8ed081';
      ctx.beginPath(); ctx.arc(w * 0.90, h * 0.86, Math.min(w, h) * 0.075, 0, Math.PI * 2); ctx.fill();
      break;
    }
    /* ГОРОД */
    case 'city': {
      ctx.fillStyle = '#cfeaff'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(w * 0.22, h * 0.16, Math.min(w, h) * 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.33, h * 0.19, Math.min(w, h) * 0.055, 0, Math.PI * 2); ctx.fill();
      [
        { x: 0.06, w: 0.20, h: 0.52, c: '#7f9fd6' },
        { x: 0.29, w: 0.16, h: 0.72, c: '#9e8cd8' },
        { x: 0.48, w: 0.22, h: 0.44, c: '#6fc0e8' },
        { x: 0.73, w: 0.21, h: 0.62, c: '#8fb8e0' }
      ].forEach((t) => {
        const bx = w * t.x, bw = w * t.w, bh = h * t.h, by = h - bh;
        ctx.fillStyle = t.c;
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        const cols = Math.max(2, Math.round(bw / 16));
        const rows = Math.max(2, Math.round(bh / 20));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            ctx.fillRect(bx + 4 + c * (bw - 8) / cols, by + 5 + r * (bh - 12) / rows, 5, 6);
          }
        }
      });
      ctx.fillStyle = '#8a94a8';
      ctx.fillRect(0, h * 0.94, w, h * 0.06);
      break;
    }
    /* ПРАЗДНИК */
    default: {
      ctx.fillStyle = '#ffd9e6'; ctx.fillRect(0, 0, w, h);
      [[0.26, 0.30, '#ff5f7e'], [0.52, 0.20, '#ffd166'], [0.76, 0.32, '#7fd6ff']].forEach((b) => {
        const bx = w * b[0], by = h * b[1], br = Math.min(w, h) * 0.13;
        ctx.strokeStyle = '#a08e6d'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(bx, by + br); ctx.quadraticCurveTo(bx + br * 0.5, by + br * 2, bx, by + br * 3.2); ctx.stroke();
        ctx.fillStyle = b[2];
        ctx.beginPath(); ctx.ellipse(bx, by, br * 0.86, br, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath(); ctx.ellipse(bx - br * 0.28, by - br * 0.30, br * 0.20, br * 0.28, -0.4, 0, Math.PI * 2); ctx.fill();
      });
      const conf = ['#ff8a3d', '#8ed081', '#c79bff', '#ffd166', '#4fb6ff', '#ff5f7e'];
      for (let i = 0; i < 22; i++) {
        const x = (i * 97) % w, y = (i * 61) % Math.floor(h * 0.75) + h * 0.10;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(i * 0.7);
        ctx.fillStyle = conf[i % conf.length];
        ctx.fillRect(-3, -5, 6, 10);
        ctx.restore();
      }
      ctx.fillStyle = '#fff';
      roundRect(ctx, w * 0.28, h * 0.72, w * 0.44, h * 0.16, 6); ctx.fill();
      ctx.fillStyle = '#ff9fc0';
      roundRect(ctx, w * 0.28, h * 0.72, w * 0.44, h * 0.05, 6); ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(w * 0.50, h * 0.60); ctx.lineTo(w * 0.47, h * 0.72); ctx.lineTo(w * 0.53, h * 0.72); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.arc(w * 0.50, h * 0.58, w * 0.022, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* Готовая фотография: белая карточка с полями и картинкой внутри */
function drawPhotoCard(ctx, art) {
  const w = PHOTO_W, h = PHOTO_H;
  ctx.fillStyle = 'rgba(60,50,30,.14)';
  roundRect(ctx, -w / 2 + 5, -h / 2 + 7, w, h, 11); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -w / 2, -h / 2, w, h, 11); ctx.fill();
  const iw = w - 20, ih = h - 44;
  ctx.save();
  roundRect(ctx, -w / 2 + 10, -h / 2 + 10, iw, ih, 5);
  ctx.clip();
  ctx.translate(-w / 2 + 10, -h / 2 + 10);
  drawArt(ctx, art, iw, ih);
  ctx.restore();
  ctx.strokeStyle = '#efe7d7'; ctx.lineWidth = 2;
  roundRect(ctx, -w / 2 + 10, -h / 2 + 10, iw, ih, 5); ctx.stroke();
  ctx.strokeStyle = '#e6dcc6'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-20, h / 2 - 15); ctx.lineTo(20, h / 2 - 15); ctx.stroke();
}

/* ---------- 5.2 Принтеры ---------- */
const PRINTER_W = 128, PRINTER_H = 122;
const PRINTERS = {
  tl: { x: 62,  y: 58,  spawn: { x: 210, y: 196 }, theme: COLORS.sky },
  tr: { x: 810, y: 58,  spawn: { x: 790, y: 196 }, theme: COLORS.yellowDeep },
  bl: { x: 62,  y: 500, spawn: { x: 210, y: 552 }, theme: COLORS.pink },
  br: { x: 810, y: 500, spawn: { x: 790, y: 552 }, theme: COLORS.mint }
};

function drawPrinter(ctx, pose, warn, head, time) {
  const p = PRINTERS[pose];
  const x = p.x, y = p.y, w = PRINTER_W, h = PRINTER_H;
  const pulse = warn ? (0.35 + 0.65 * Math.abs(Math.sin(time * 9))) : 0;

  // столик под принтером
  ctx.fillStyle = '#e7d6b4';
  roundRect(ctx, x - 10, y + h - 16, w + 20, 16, 7); ctx.fill();

  // корпус
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#f1f4f8');
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 14); ctx.fill();

  // подсветка при печати
  if (pulse > 0.02) {
    ctx.save();
    ctx.globalAlpha = 0.8 * pulse;
    ctx.fillStyle = p.theme;
    roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 11); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = pulse > 0.02 ? p.theme : '#dfd3b8';
  ctx.lineWidth = pulse > 0.02 ? 3.5 : 2.5;
  roundRect(ctx, x, y, w, h, 14); ctx.stroke();

  // щель выдачи
  ctx.fillStyle = '#cbd2dc';
  roundRect(ctx, x - 6, y + h - 44, w + 12, 15, 7); ctx.fill();
  ctx.fillStyle = '#8f98a6';
  roundRect(ctx, x - 4, y + h - 41, w + 8, 8, 4); ctx.fill();

  // панель управления
  ctx.fillStyle = '#e9eef5';
  roundRect(ctx, x + 12, y + 14, w - 24, 30, 8); ctx.fill();
  const glow = warn ? (0.4 + 0.6 * Math.abs(Math.sin(time * 10))) : (head ? 0.9 : 0.25);
  ctx.fillStyle = warn ? '#ff8a3d' : (head ? '#5ec79a' : '#cfd6e0');
  ctx.beginPath(); ctx.arc(x + 26, y + 29, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.3 * glow;
  ctx.beginPath(); ctx.arc(x + 26, y + 29, 13, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#cfd6e0';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 54 + i * 16, y + 29, 4.2, 0, Math.PI * 2); ctx.fill(); }

  // надписи
  ctx.fillStyle = p.theme;
  ctx.font = 'bold 13px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ФОТОПРИНТ', x + w / 2, y + 62);
  ctx.fillStyle = '#bfb9a8';
  ctx.font = 'bold 11px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText(pose.toUpperCase(), x + w / 2, y + 80);

  // восклицательный знак при предупреждении
  if (warn) {
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 11);
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.arc(x + w / 2, y - 22, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 21px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText('!', x + w / 2, y - 21);
    ctx.restore();
  }

  // пунктирная «трасса» от принтера к центру
  const a = POSE_ANGLE[pose];
  const dx = Math.cos(a), dy = Math.sin(a);
  ctx.save();
  ctx.globalAlpha = warn ? 0.75 : 0.2;
  ctx.strokeStyle = p.theme;
  ctx.lineWidth = warn ? 4 : 3;
  ctx.setLineDash([7, 9]);
  ctx.beginPath();
  ctx.moveTo(p.spawn.x - dx * 34, p.spawn.y - dy * 34);
  ctx.lineTo(CX + dx * 168, CY + dy * 168);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ---------- 5.3 Фон: фотозал «Фотосмайл» ---------- */
function drawWallFrame(ctx, x, y, w, h, sky, sun) {
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = '#efe2c4'; ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, 8); ctx.stroke();
  ctx.save();
  roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 4); ctx.clip();
  ctx.fillStyle = sky; ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
  ctx.fillStyle = sun;
  ctx.beginPath(); ctx.arc(x + w * 0.34, y + h * 0.34, Math.min(w, h) * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath();
  ctx.moveTo(x + 8, y + h - 8);
  ctx.lineTo(x + w * 0.45, y + h * 0.45);
  ctx.lineTo(x + w * 0.72, y + h - 8);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawStack(ctx, x, y, tint) {
  for (let i = 4; i >= 0; i--) {
    ctx.save();
    ctx.translate(x + i * 3, y - i * 6);
    ctx.rotate((i - 2) * 0.03);
    ctx.fillStyle = i === 0 ? '#ffffff' : tint;
    roundRect(ctx, 0, 0, 92, 62, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(200,180,140,.5)'; ctx.lineWidth = 2;
    roundRect(ctx, 0, 0, 92, 62, 6); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x + 8, y - 38);
  ctx.fillStyle = '#bfe4ff';
  roundRect(ctx, 0, 0, 82, 54, 5); ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.arc(24, 20, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8ed081';
  ctx.beginPath(); ctx.moveTo(0, 54); ctx.lineTo(34, 26); ctx.lineTo(60, 54); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawAlbum(ctx, x, y, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(60,50,30,.10)';
  roundRect(ctx, 4, 6, 110, 74, 8); ctx.fill();
  ctx.fillStyle = col;
  roundRect(ctx, 0, 0, 110, 74, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  roundRect(ctx, 10, 10, 74, 54, 5); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(34, 32, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe6a8';
  ctx.fillRect(18, 46, 52, 8);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  roundRect(ctx, 0, 0, 14, 74, 8); ctx.fill();
  ctx.restore();
}

function drawCamera(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#e7d6b4';
  roundRect(ctx, -6, 26, 12, 74, 5); ctx.fill();
  ctx.fillStyle = 'rgba(60,50,30,.12)';
  roundRect(ctx, -34, -20, 76, 54, 10); ctx.fill();
  ctx.fillStyle = '#5b5f6b';
  roundRect(ctx, -38, -26, 76, 54, 10); ctx.fill();
  ctx.fillStyle = '#7c8290';
  roundRect(ctx, -38, -26, 76, 16, 8); ctx.fill();
  ctx.fillStyle = '#cbd2dc';
  roundRect(ctx, -30, -22, 14, 8, 4); ctx.fill();
  ctx.fillStyle = '#2f333c';
  ctx.beginPath(); ctx.arc(0, 4, 19, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9fd6f5';
  ctx.beginPath(); ctx.arc(0, 4, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.beginPath(); ctx.arc(-4, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5f7e';
  ctx.beginPath(); ctx.arc(-26, 0, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlant(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  const leaves = ['#7fbf6a', '#94d17e', '#6cae59'];
  for (let i = 0; i < 7; i++) {
    ctx.save();
    ctx.rotate(-Math.PI / 2 + (i - 3) * 0.34);
    ctx.fillStyle = leaves[i % 3];
    ctx.beginPath();
    ctx.ellipse(0, -46, 15, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#f2a65a';
  roundRect(ctx, -30, 6, 60, 46, 10); ctx.fill();
  ctx.fillStyle = '#e08f45';
  roundRect(ctx, -34, 0, 68, 14, 7); ctx.fill();
  ctx.restore();
}

function drawBackdrop(ctx) {
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#fffaf0');
  wall.addColorStop(0.55, '#fff4dd');
  wall.addColorStop(1, '#ffeed0');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  // пол
  ctx.fillStyle = '#f7e7c9';
  ctx.fillRect(0, CY + 150, W, H - (CY + 150));
  ctx.strokeStyle = 'rgba(214,190,150,.55)';
  ctx.lineWidth = 2;
  for (let x = -200; x < W + 200; x += 74) {
    ctx.beginPath();
    ctx.moveTo(CX + (x - CX) * 0.25, CY + 150);
    ctx.lineTo(CX + (x - CX) * 1.35, H);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, CY + 150); ctx.lineTo(W, CY + 150); ctx.stroke();

  // ковёр в центре
  const rug = ctx.createRadialGradient(CX, CY + 60, 40, CX, CY + 60, 320);
  rug.addColorStop(0, '#fff8e4');
  rug.addColorStop(0.75, '#ffeeba');
  rug.addColorStop(1, 'rgba(255,225,160,0)');
  ctx.fillStyle = rug;
  ctx.beginPath(); ctx.ellipse(CX, CY + 70, 330, 250, 0, 0, Math.PI * 2); ctx.fill();

  // бордюр на стене
  ctx.fillStyle = 'rgba(255,209,102,.45)';
  ctx.fillRect(0, CY - 262, W, 14);

  // рамки и постер
  drawWallFrame(ctx, 176, 34, 108, 84, '#9fd6f5', '#ffd166');
  drawWallFrame(ctx, 300, 44, 84, 66, '#ffc2d6', '#ffffff');
  drawWallFrame(ctx, 700, 34, 108, 84, '#c9e8c0', '#ff8a3d');
  drawWallFrame(ctx, 830, 48, 84, 66, '#ffe6a8', '#ffffff');

  ctx.save();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, CX - 130, 24, 260, 62, 12); ctx.fill();
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4;
  roundRect(ctx, CX - 130, 24, 260, 62, 12); ctx.stroke();
  ctx.fillStyle = '#ff8a3d';
  ctx.font = 'bold 26px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ФОТОСМАЙЛ', CX, 48);
  ctx.fillStyle = '#a08e6d';
  ctx.font = 'bold 12px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText('ДОКУМЕНТЫ · ПЕЧАТЬ · СУВЕНИРЫ', CX, 70);
  ctx.restore();

  // витрины: стопки фотографий и фотоальбомы
  drawStack(ctx, 150, CY + 176, '#fff');
  drawStack(ctx, 196, CY + 190, '#eaf7ff');
  drawAlbum(ctx, 806, CY + 178, '#ff8a3d');
  drawAlbum(ctx, 852, CY + 194, '#4fb6ff');

  // камера и растение
  drawCamera(ctx, 900, CY - 150);
  drawPlant(ctx, 96, CY - 130);

  // «бумажная пыль»
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let i = 0; i < 26; i++) {
    const x = (i * 137) % W, y = (i * 211) % H;
    ctx.beginPath(); ctx.arc(x, y, 1.6 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
}

/* ---------- 5.4 Менеджер «Фотосмайл» ---------- */
function drawCharacter(ctx, o) {
  const dirA = POSE_ANGLE[o.pose];
  const dx = Math.cos(dirA), dy = Math.sin(dirA);
  const time = o.time;
  const baseX = CX, baseY = CY + 74;
  const sway = Math.sin(time * 2.1) * 2.2;
  const leanX = dx * 8, leanY = dy * 6;
  const reachMul = 1 + o.reached * 0.5 + o.reachKick * 0.16;

  ctx.save();

  // тень на полу
  ctx.fillStyle = 'rgba(150,120,70,.18)';
  ctx.beginPath(); ctx.ellipse(baseX, baseY + 10, 82, 22, 0, 0, Math.PI * 2); ctx.fill();

  // корона (пасхалка за 100 фото подряд)
  if (o.crownT > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(o.crownT, 0, 1);
    const cxk = baseX + leanX, cyk = baseY - 182 + Math.sin(time * 3) * 2;
    ctx.fillStyle = '#ffd166';
    ctx.strokeStyle = '#e0a112'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cxk - 30, cyk + 18);
    ctx.lineTo(cxk - 30, cyk);
    ctx.lineTo(cxk - 15, cyk + 10);
    ctx.lineTo(cxk, cyk - 6);
    ctx.lineTo(cxk + 15, cyk + 10);
    ctx.lineTo(cxk + 30, cyk);
    ctx.lineTo(cxk + 30, cyk + 18);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff5f7e';
    ctx.beginPath(); ctx.arc(cxk, cyk + 12, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ноги и обувь
  ctx.strokeStyle = '#f4c8a8';
  ctx.lineCap = 'round';
  ctx.lineWidth = 22;
  ctx.beginPath(); ctx.moveTo(baseX - 26, baseY - 62); ctx.lineTo(baseX - 30 + dx * 6, baseY - 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(baseX + 26, baseY - 62); ctx.lineTo(baseX + 30 + dx * 6, baseY - 4); ctx.stroke();
  ctx.fillStyle = '#e05d7a';
  roundRect(ctx, baseX - 46 + dx * 6, baseY - 12, 36, 16, 8); ctx.fill();
  roundRect(ctx, baseX + 14 + dx * 6, baseY - 12, 36, 16, 8); ctx.fill();

  // корпус в фирменной футболке с фартуком
  const bodyX = baseX + leanX * 0.5 + sway * 0.4;
  const bodyY = baseY - 130 + leanY * 0.5;
  ctx.save();
  ctx.translate(bodyX, bodyY);
  ctx.rotate(dx * 0.05);
  ctx.fillStyle = '#ff9f43';
  roundRect(ctx, -54, -6, 108, 82, 26); ctx.fill();
  ctx.fillStyle = '#ffcf8a';
  roundRect(ctx, -20, -8, 40, 16, 8); ctx.fill();
  ctx.fillStyle = '#fffdf7';
  roundRect(ctx, -40, 8, 80, 68, 14); ctx.fill();
  ctx.strokeStyle = '#ffe6a8'; ctx.lineWidth = 3;
  roundRect(ctx, -40, 8, 80, 68, 14); ctx.stroke();
  // бейджик
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 16, 12, 22, 28, 5); ctx.fill();
  ctx.strokeStyle = '#d9d2c2'; ctx.lineWidth = 1.6;
  roundRect(ctx, 16, 12, 22, 28, 5); ctx.stroke();
  ctx.fillStyle = '#4fb6ff';
  ctx.beginPath(); ctx.arc(27, 20, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd166'; ctx.fillRect(20, 27, 14, 3);
  ctx.fillStyle = '#ff8a3d'; ctx.fillRect(20, 32, 11, 3);
  // эмблема
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.arc(-18, 34, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e08906';
  ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Ф', -18, 35);
  ctx.restore();

  /* Руки и лоток.
     Рука со стороны выбранной позиции идёт «через грудь» (как держат поднос),
     дальняя рука прижата к корпусу и частично скрыта за фартуком. */
  const trayX = TRAY_X0 + dx * TRAY_RX * reachMul;
  const trayY = TRAY_Y0 + dy * TRAY_RY * reachMul;
  const nearSign = (dx >= 0) ? 1 : -1;                 // какая рука ближе к позиции
  const shNearX = bodyX + nearSign * 44, shNearY = bodyY + 12;
  const shFarX = bodyX - nearSign * 44, shFarY = bodyY + 16;

  ctx.strokeStyle = '#f4c8a8';
  ctx.lineWidth = 13.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // дальняя рука: плечо → локоть у бедра → ручка лотка (скрыта за фартуком)
  ctx.beginPath();
  ctx.moveTo(shFarX, shFarY);
  ctx.lineTo(bodyX - nearSign * 30, bodyY + 54);
  ctx.lineTo(trayX - nearSign * 40, trayY - 3);
  ctx.stroke();

  // ближняя рука: плечо → локоть у груди → ручка лотка
  ctx.beginPath();
  ctx.moveTo(shNearX, shNearY);
  ctx.lineTo(lerp(shNearX, trayX, 0.42) + nearSign * 12, bodyY + 48);
  ctx.lineTo(trayX + nearSign * 30, trayY - 3);
  ctx.stroke();

  // кисти
  ctx.fillStyle = '#f4c8a8';
  ctx.beginPath(); ctx.arc(trayX - 30, trayY - 3, 9.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(trayX + 30, trayY - 3, 9.5, 0, Math.PI * 2); ctx.fill();

  // лоток
  ctx.save();
  ctx.translate(trayX, trayY);
  ctx.fillStyle = 'rgba(60,50,30,.12)';
  roundRect(ctx, -58, 6, 116, 16, 8); ctx.fill();
  ctx.fillStyle = '#ffd166';
  roundRect(ctx, -58, -8, 116, 18, 9); ctx.fill();
  ctx.fillStyle = '#fff3cf';
  roundRect(ctx, -52, -6, 104, 12, 6); ctx.fill();
  ctx.strokeStyle = '#e0a112'; ctx.lineWidth = 2;
  roundRect(ctx, -58, -8, 116, 18, 9); ctx.stroke();
  ctx.restore();

  // голова (слегка наклоняется в сторону выбранной позиции)
  const headX = bodyX + leanX * 0.6;
  const headY = bodyY - 62 + leanY * 0.6;
  const hr = 40;
  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(dx * 0.09);
  ctx.translate(-headX, -headY);
  ctx.fillStyle = '#f4c8a8';
  ctx.fillRect(headX - 12, headY + 26, 24, 20);
  ctx.fillStyle = '#6b4a2f';
  ctx.beginPath(); ctx.ellipse(headX, headY + 6, hr * 1.16, hr * 1.30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(headX - hr * 1.05, headY + 20, hr * 0.36, hr * 0.72, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(headX + hr * 1.05, headY + 20, hr * 0.36, hr * 0.72, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd7b8';
  ctx.beginPath(); ctx.ellipse(headX, headY, hr * 0.92, hr, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b4a2f';
  ctx.beginPath(); ctx.ellipse(headX, headY - hr * 0.62, hr * 1.02, hr * 0.56, 0, Math.PI, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(headX - hr * 0.55, headY - hr * 0.28, hr * 0.44, hr * 0.34, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(headX + hr * 0.58, headY - hr * 0.30, hr * 0.40, hr * 0.32, 0.5, 0, Math.PI * 2); ctx.fill();
  // заколка-цветочек
  ctx.fillStyle = '#ff5f7e';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(headX - hr * 0.78 + Math.cos(a) * 6, headY - hr * 0.58 + Math.sin(a) * 6, 4.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.arc(headX - hr * 0.78, headY - hr * 0.58, 3.4, 0, Math.PI * 2); ctx.fill();

  // мимика
  const blink = (Math.sin(time * 1.7) > 0.982);
  const eyeY = headY - hr * 0.05;
  const eyeDX = hr * 0.34;
  ctx.strokeStyle = '#3a3348';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.4;

  if (o.mood === 'happy' || o.mood === 'star') {
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.arc(headX + s * eyeDX, eyeY + 3, hr * 0.20, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    });
    ctx.fillStyle = '#c9556b';
    ctx.beginPath();
    ctx.arc(headX, headY + hr * 0.34, hr * 0.24, 0.05 * Math.PI, 0.95 * Math.PI);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(headX, headY + hr * 0.50, hr * 0.14, hr * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  } else if (o.mood === 'sad') {
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(headX + s * eyeDX - 8, eyeY - 6);
      ctx.lineTo(headX + s * eyeDX + 8, eyeY + 6);
      ctx.moveTo(headX + s * eyeDX + 8, eyeY - 6);
      ctx.lineTo(headX + s * eyeDX - 8, eyeY + 6);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(headX, headY + hr * 0.62, hr * 0.22, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.fillStyle = '#7fd6ff';
    ctx.beginPath();
    ctx.arc(headX + hr * 0.74, headY + hr * 0.05 + (o.lostT % 0.55) * 16, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#3a3348';
    if (blink) {
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.moveTo(headX + s * eyeDX - 7, eyeY);
        ctx.lineTo(headX + s * eyeDX + 7, eyeY);
        ctx.stroke();
      });
    } else {
      ctx.beginPath(); ctx.ellipse(headX - eyeDX, eyeY, hr * 0.115, hr * 0.155, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(headX + eyeDX, eyeY, hr * 0.115, hr * 0.155, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(headX - eyeDX + 2.5, eyeY - 3, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(headX + eyeDX + 2.5, eyeY - 3, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#c9556b'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(headX, headY + hr * 0.28, hr * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,120,150,.30)';
  ctx.beginPath(); ctx.ellipse(headX - hr * 0.56, headY + hr * 0.26, hr * 0.18, hr * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(headX + hr * 0.56, headY + hr * 0.26, hr * 0.18, hr * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();   // конец наклона головы

  // звёздочки-пасхалка
  const starAmount = Math.max(o.starT > 0 ? 1 : 0, o.crownT > 0 ? 0.8 : 0);
  if (starAmount > 0) {
    ctx.save();
    ctx.globalAlpha = starAmount;
    for (let i = 0; i < 8; i++) {
      const a = time * 1.6 + (i / 8) * Math.PI * 2;
      const rr = 118 + Math.sin(time * 3 + i) * 8;
      const sx = baseX + Math.cos(a) * rr;
      const sy = baseY - 92 + Math.sin(a) * rr * 0.6;
      const big = (i % 2 === 0);
      ctx.fillStyle = big ? '#ffd166' : '#fff3cf';
      const sc = big ? 1 : 0.55;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const aa = (k / 8) * Math.PI * 2;
        const rad = ((k % 2) ? 3.5 : 9.5) * sc;
        const px = sx + Math.cos(aa) * rad, py = sy + Math.sin(aa) * rad;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // подсказка: слишком поздно менять позицию (фото уже у самого центра)
  if (Game.blockedFlash > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(Game.blockedFlash * 3, 0, 1);
    const bx = baseX + dx * 30, by = baseY - 120;
    ctx.fillStyle = '#ff5f7e';
    ctx.beginPath(); ctx.arc(bx, by, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 23px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', bx, by - 1);
    ctx.restore();
  }

  // мягкое кольцо зоны ловли вокруг лотка
  ctx.save();
  ctx.globalAlpha = 0.26 + 0.14 * Math.sin(time * 4);
  ctx.strokeStyle = COLORS.orange;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.arc(TRAY_X0 + dx * TRAY_RX, TRAY_Y0 + dy * TRAY_RY, CATCH_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.restore();
}

/* ===================================================================
   6. СОСТОЯНИЕ ИГРЫ
   =================================================================== */
const Game = {
  state: 'menu',            // menu | countdown | playing | paused | over
  score: 0,
  best: 0,
  prevBest: 0,
  lives: 3,
  maxLives: 3,
  time: 0,
  photos: [],
  effects: [],
  spawnTimer: 0,
  pose: 'tl',
  reachKick: 0,
  mood: 'idle',
  moodTimer: 0,
  starT: 0,
  crownT: 0,
  lostT: 0,
  catchT: 0,
  missT: 0,
  streak: 0,
  maxStreak: 0,
  perfectShown: false,
  crownShown: false,
  milestonesShown: {},
  recordBroken: false,
  isNewBest: false,
  phraseCooldown: 0,
  switchCount: 0,
  countdownValue: 3,
  countdownTimer: 0,
  blockedFlash: 0,
  stats: { caught: 0, missed: 0, poses: { tl: 0, tr: 0, bl: 0, br: 0 } }
};

function resetRound() {
  Game.score = 0;
  Game.lives = Game.maxLives;
  Game.time = 0;
  Game.photos.length = 0;
  Game.effects.length = 0;
  Game.spawnTimer = 0.8;
  Game.pose = 'tl';
  Game.reachKick = 0;
  Game.mood = 'idle';
  Game.moodTimer = 0;
  Game.starT = 0;
  Game.crownT = 0;
  Game.lostT = 0;
  Game.catchT = 0;
  Game.missT = 0;
  Game.streak = 0;
  Game.maxStreak = 0;
  Game.perfectShown = false;
  Game.crownShown = false;
  Game.milestonesShown = {};
  Game.recordBroken = false;
  Game.isNewBest = false;
  Game.phraseCooldown = 2.5;
  Game.switchCount = 0;
  Game.blockedFlash = 0;
  Game.prevBest = Game.best;
  Game.stats = { caught: 0, missed: 0, poses: { tl: 0, tr: 0, bl: 0, br: 0 } };
  POSES.forEach((p) => { PRINTERS[p].head = null; });
}

/* ===================================================================
   7. ФОТОГРАФИИ: ПОЯВЛЕНИЕ И ДВИЖЕНИЕ
   =================================================================== */
/* Менеджер обязан успевать: пока какое-то фото ближе 150 px к центру,
   новые принтеры не начинают печать. Заведомо непроходимых ситуаций нет. */
function spawningLocked() {
  for (let i = 0; i < Game.photos.length; i++) {
    const ph = Game.photos[i];
    if (ph.phase === 'spawn' || ph.phase === 'fall') continue;
    if (Math.hypot(ph.x - CX, ph.y - CY) < SWITCH_BLOCK_RADIUS) return true;
  }
  return false;
}

function printerBusy(pose) {
  for (let i = 0; i < Game.photos.length; i++) {
    const ph = Game.photos[i];
    if (ph.pose === pose && ph.phase !== 'fall') return true;
  }
  return false;
}

function spawnPhoto(pose) {
  const p = PRINTERS[pose];
  const a = POSE_ANGLE[pose];
  const dx = Math.cos(a), dy = Math.sin(a);
  const ph = {
    pose: pose,
    art: pick(ART_IDS),
    phase: 'spawn',
    t: 0,
    spawnDur: 0.26,
    sx: p.spawn.x, sy: p.spawn.y,
    x: p.spawn.x, y: p.spawn.y,
    from: { x: p.spawn.x, y: p.spawn.y },
    tx: CX + dx * FLIGHT_TARGET_RADIUS,
    ty: CY + dy * FLIGHT_TARGET_RADIUS,
    progress: 0,
    speed: 200,
    rot: dx * 0.24,
    dir: { x: dx, y: dy },
    fallV: 0,
    fallRot: 0
  };
  Game.photos.push(ph);
  return ph;
}

function currentPhotoSpeed() {
  const cfg = Difficulty.cfg(Game.score);
  return cfg.photoSpeed * rand(0.94, 1.09);
}

function updatePhotos(dt) {
  for (let i = Game.photos.length - 1; i >= 0; i--) {
    const ph = Game.photos[i];
    ph.t += dt;

    if (ph.phase === 'spawn') {
      if (ph.t >= ph.spawnDur) {
        ph.phase = 'fly';
        ph.t = 0;
        ph.progress = 0;
        ph.speed = currentPhotoSpeed();
        ph.from = { x: ph.sx, y: ph.sy };
        ph.x = ph.sx; ph.y = ph.sy;
      }
      continue;
    }

    if (ph.phase === 'fly') {
      const total = Math.max(1, Math.hypot(ph.tx - ph.from.x, ph.ty - ph.from.y));
      ph.progress = clamp(ph.progress + (ph.speed * dt) / total, 0, 1);
      const k = ph.progress;
      ph.x = lerp(ph.from.x, ph.tx, k);
      ph.y = lerp(ph.from.y, ph.ty, k) + Math.sin(k * Math.PI) * 12 * ph.dir.x;
      if (ph.progress >= 1) { ph.phase = 'stall'; ph.t = 0; }
      continue;
    }

    if (ph.phase === 'stall') {
      if (ph.t >= STALL_TIME) {
        ph.phase = 'fall';
        ph.t = 0;
        ph.fallV = 60;
        onMiss(ph);
      }
      continue;
    }

    if (ph.phase === 'fall') {
      ph.fallV += 1800 * dt;
      ph.y += ph.fallV * dt;
      ph.fallRot += dt * 2.6;
      if (ph.y > H + 240 || ph.t > 3) Game.photos.splice(i, 1);
    }
  }
}

/* ===================================================================
   8. УПРАВЛЕНИЕ ПЕРСОНАЖЕМ
   =================================================================== */
function setPose(pose, force) {
  if (POSES.indexOf(pose) === -1) return false;
  if (Game.state !== 'playing' && !force) return false;
  if (pose === Game.pose && !force) return false;

  if (!force && spawningLocked()) {
    Game.blockedFlash = 0.25;
    Sound.blocked();
    return false;
  }

  Game.pose = pose;
  Game.reachKick = 1;                 // короткий «выброс» лотка в новую сторону
  Game.stats.poses[pose] = (Game.stats.poses[pose] || 0) + 1;
  Game.switchCount++;
  if (Game.state === 'playing') Sound.step();
  UI.syncPoseButtons();
  if (Game.state === 'playing') checkCatch();   // ловим мгновенно, без ожидания кадра
  return true;
}

function trayPoint(pose) {
  const a = POSE_ANGLE[pose];
  return {
    x: TRAY_X0 + Math.cos(a) * TRAY_RX,
    y: TRAY_Y0 + Math.sin(a) * TRAY_RY
  };
}

/* ===================================================================
   9. ЛОВЛЯ, ОЧКИ, ЖИЗНИ, ПАСХАЛКИ
   =================================================================== */
function checkCatch() {
  for (let i = Game.photos.length - 1; i >= 0; i--) {
    const ph = Game.photos[i];
    if (ph.phase !== 'fly' && ph.phase !== 'stall') continue;
    if (ph.pose !== Game.pose) continue;
    const t = trayPoint(Game.pose);
    if (Math.hypot(ph.x - t.x, ph.y - t.y) <= CATCH_RADIUS) {
      catchPhoto(ph, i);
      return true;
    }
  }
  return false;
}

function addEffect(e) {
  if (Game.effects.length > 60) Game.effects.shift();
  Game.effects.push(e);
}

function catchPhoto(ph, index) {
  if (index !== undefined) Game.photos.splice(index, 1);
  else {
    const j = Game.photos.indexOf(ph);
    if (j >= 0) Game.photos.splice(j, 1);
  }

  Game.score++;
  Game.stats.caught++;
  Game.streak++;
  if (Game.streak > Game.maxStreak) Game.maxStreak = Game.streak;
  Game.catchT = 0.36;
  Game.mood = 'happy';
  Game.moodTimer = 0.75;
  Sound.catchGood();

  const t = trayPoint(ph.pose);
  const side = (t.x >= CX) ? 1 : -1;                 // «+1» уводим от головы персонажа
  addEffect({ type: 'ring', x: t.x, y: t.y, t: 0, dur: 0.5, color: COLORS.yellow });
  addEffect({
    type: 'plus', x: t.x + side * 46, y: t.y - 30, t: 0, dur: 0.9,
    text: '+1', color: COLORS.orange
  });
  for (let i = 0; i < 7; i++) {
    addEffect({
      type: 'spark', t: 0, dur: rand(0.35, 0.65),
      x: t.x + side * (18 + i * 7) + rand(-5, 5), y: t.y - rand(6, 26),
      vx: side * rand(10, 70), vy: rand(-150, -40),
      color: pick(['#ffd166', '#ff8a3d', '#4fb6ff', '#ff5f7e'])
    });
  }

  // редкие позитивные фразы (не после каждой фотографии)
  if (Game.phraseCooldown <= 0 && Math.random() < 0.3) {
    UI.toast(pick(PHRASES), 1100);
    Game.phraseCooldown = rand(4.5, 8);
  }

  // рубежи
  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i];
    if (Game.score === m.at && !Game.milestonesShown[m.at]) {
      Game.milestonesShown[m.at] = true;
      UI.toast(m.text, 1600);
      Sound.milestone();
    }
  }

  // пасхалки
  if (Game.streak >= 50 && !Game.perfectShown) {
    Game.perfectShown = true;
    Game.starT = 3.4;
    UI.toast('Идеальная смена!', 1700);
    Sound.recordSnd();
  }
  if (Game.streak >= 100 && !Game.crownShown) {
    Game.crownShown = true;
    Game.crownT = 4.5;
    UI.toast('Менеджер надел корону!', 1800);
    Sound.recordSnd();
  }

  // рекорд
  if (Game.score > Game.best) {
    Game.best = Game.score;
    Store.write(Game.best);
    UI.setBest(Game.best);
    if (Game.prevBest > 0 && !Game.recordBroken) {
      Game.recordBroken = true;
      UI.recordToast();
      Sound.recordSnd();
    }
  }

  UI.setScore(Game.score, true);
}

function onMiss(ph) {
  Game.stats.missed++;
  Game.streak = 0;
  Game.perfectShown = false;      // «идеальная смена» считается заново
  Game.lives--;
  Game.mood = 'sad';
  Game.moodTimer = 0.95;
  Game.lostT = 0;
  Game.missT = 0.5;
  Sound.missSnd();
  UI.setLives(Game.lives, true);
  UI.shake();
  addEffect({ type: 'ring', x: ph.x, y: ph.y, t: 0, dur: 0.45, color: COLORS.pink });
  addEffect({ type: 'label', x: ph.x, y: ph.y - 34, t: 0, dur: 0.75, text: 'Мимо!', color: COLORS.pink });
  if (Game.lives <= 0) endGame();
}

function updateEffects(dt) {
  for (let i = Game.effects.length - 1; i >= 0; i--) {
    const e = Game.effects[i];
    e.t += dt;
    if (e.type === 'spark') {
      e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 320 * dt;
    } else if (e.type === 'plus') {
      e.y -= 46 * dt;
    }
    if (e.t >= e.dur) Game.effects.splice(i, 1);
  }
}

/* ===================================================================
   10. ИГРОВОЙ ЦИКЛ
   =================================================================== */
function gameUpdate(dt) {
  Game.time += dt;

  Game.moodTimer = Math.max(0, Game.moodTimer - dt);
  Game.catchT = Math.max(0, Game.catchT - dt);
  Game.missT = Math.max(0, Game.missT - dt);
  Game.starT = Math.max(0, Game.starT - dt);
  Game.crownT = Math.max(0, Game.crownT - dt);
  Game.phraseCooldown = Math.max(0, Game.phraseCooldown - dt);
  Game.blockedFlash = Math.max(0, Game.blockedFlash - dt);
  Game.reachKick = Math.max(0, Game.reachKick - dt * 5);
  Game.lostT += dt;

  if (Game.moodTimer <= 0) Game.mood = Game.starT > 0 ? 'star' : 'idle';

  // принтеры печатают: предупреждение → выход фотографии
  for (let i = 0; i < POSES.length; i++) {
    const pr = PRINTERS[POSES[i]];
    if (!pr.head) continue;
    pr.head.t += dt;
    if (pr.head.t >= pr.head.dur) {
      pr.head = null;
      if (spawnPhoto(POSES[i])) Sound.photoOut();
    }
  }

  // планировщик новых заказов
  const cfg = Difficulty.cfg(Game.score);
  Game.spawnTimer -= dt;
  if (Game.spawnTimer <= 0) {
    let started = false;
    if (Game.photos.length < cfg.maxActivePhotos && !spawningLocked()) {
      const free = POSES.filter((p) => !PRINTERS[p].head && !printerBusy(p));
      if (free.length) {
        const pose = pick(free);
        PRINTERS[pose].head = { t: 0, dur: rand(cfg.warningMin, cfg.warningMax) };
        Sound.printer();
        started = true;
      }
    }
    // если помешала блокировка у центра или лимит — короткая пауза и новая попытка
    Game.spawnTimer = started ? rand(cfg.intervalMin, cfg.intervalMax) : rand(0.10, 0.18);
  }

  updatePhotos(dt);
  checkCatch();
  updateEffects(dt);
  UI.setScore(Game.score);
}

let rafId = 0;
let lastT = 0;
let goTimer = 0;

function loop(now) {
  rafId = window.requestAnimationFrame(loop);
  const t = (typeof now === 'number') ? now / 1000
    : (window.performance ? window.performance.now() : Date.now()) / 1000;
  if (!lastT) lastT = t;
  const dt = t - lastT;
  lastT = t;

  if (Game.state === 'countdown') {
    updateCountdown(dt);
  } else if (Game.state === 'playing') {
    gameUpdate(Math.min(dt, 0.05));
  }
  render();
}

function updateCountdown(dt) {
  Game.countdownTimer -= dt;
  if (Game.countdownTimer > 0) return;
  Game.countdownValue--;
  if (Game.countdownValue > 0) {
    UI.showCountdown(Game.countdownValue);
    Game.countdownTimer = 0.62;
    Sound.countdown(false);
  } else {
    // «Поехали!» — игра уже идёт, надпись не мешает управлению
    Game.state = 'playing';
    lastT = 0;
    UI.showGo();
    Sound.countdown(true);
    window.clearTimeout(goTimer);
    goTimer = window.setTimeout(() => { UI.hideGo(); }, 620);
  }
}

/* ===================================================================
   11. ОТРИСОВКА КАДРА
   =================================================================== */
let canvas = null, ctx2d = null, backdrop = null, scaleFactor = 1;

function render() {
  if (!ctx2d) return;
  const s = scaleFactor;
  ctx2d.setTransform(s, 0, 0, s, 0, 0);
  ctx2d.clearRect(0, 0, W, H);

  if (backdrop) ctx2d.drawImage(backdrop, 0, 0, W, H);

  // вспышка при промахе
  if (Game.missT > 0) {
    ctx2d.save();
    ctx2d.globalAlpha = clamp(Game.missT * 0.5, 0, 0.35);
    ctx2d.fillStyle = '#ff5f7e';
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.restore();
  }

  for (let i = 0; i < POSES.length; i++) {
    const pose = POSES[i];
    const head = PRINTERS[pose].head;
    const warn = !!(head && Game.state === 'playing' && (head.dur - head.t) < 0.6);
    drawPrinter(ctx2d, pose, warn, head, Game.time);
  }

  for (let i = 0; i < Game.photos.length; i++) drawPhoto(ctx2d, Game.photos[i]);

  if (Game.state !== 'menu') {
    drawCharacter(ctx2d, {
      pose: Game.pose,
      time: Game.time,
      reached: Game.catchT > 0 ? (Game.catchT / 0.36) : 0,
      reachKick: Game.reachKick,
      mood: Game.mood,
      starT: Game.starT,
      crownT: Game.crownT,
      lostT: Game.lostT
    });
  }

  drawEffects(ctx2d);

  if (Game.missT > 0.2) {
    ctx2d.save();
    ctx2d.globalAlpha = clamp((Game.missT - 0.2) * 2.2, 0, 0.85);
    ctx2d.strokeStyle = '#ff5f7e';
    ctx2d.lineWidth = 14;
    ctx2d.strokeRect(7, 7, W - 14, H - 14);
    ctx2d.restore();
  }
}

function drawPhoto(ctx, ph) {
  if (ph.phase === 'spawn') {
    const p = PRINTERS[ph.pose];
    const k = clamp(ph.t / ph.spawnDur, 0, 1);
    // фотография «выезжает» из корпуса принтера в сторону менеджера
    const slide = PHOTO_H * 0.55 * (1 - k);
    const px = p.spawn.x + ph.dir.x * slide;
    const py = p.spawn.y + ph.dir.y * slide;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x - 12, p.y - 12, PRINTER_W + 24, PRINTER_H + 28);
    ctx.clip();
    ctx.translate(px, py);
    ctx.rotate(ph.rot * k);
    drawPhotoCard(ctx, ph.art);
    ctx.restore();
    return;
  }
  let px = ph.x, py = ph.y, rot = ph.rot;
  if (ph.phase === 'fall') rot = ph.rot + ph.fallRot;
  else if (ph.phase === 'stall') px += Math.sin(ph.t * 62) * 2.4;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(rot);
  drawPhotoCard(ctx, ph.art);
  ctx.restore();
}

function drawEffects(ctx) {
  for (let i = 0; i < Game.effects.length; i++) {
    const e = Game.effects[i];
    const k = clamp(e.t / e.dur, 0, 1);
    if (e.type === 'ring') {
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 6 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 18 + k * 54, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (e.type === 'plus' || e.type === 'label') {
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = e.color;
      ctx.font = 'bold ' + (e.type === 'plus' ? 38 : 30) + 'px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.strokeText(e.text, e.x, e.y);
      ctx.fillText(e.text, e.x, e.y);
      ctx.restore();
    } else if (e.type === 'spark') {
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 5 * (1 - k) + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function buildBackdrop() {
  if (!canvas || !document.createElement) return;
  const bc = document.createElement('canvas');
  bc.width = canvas.width;
  bc.height = canvas.height;
  const bctx = bc.getContext && bc.getContext('2d');
  if (!bctx) return;
  const s = canvas.width / W;
  bctx.setTransform(s, 0, 0, s, 0, 0);
  drawBackdrop(bctx);
  backdrop = bc;
}

function resizeCanvas() {
  if (!canvas || !canvas.getBoundingClientRect) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = rect.width || canvas.clientWidth || 800;
  const w = Math.max(320, Math.round(cssW * dpr));
  const h = Math.round(w * (H / W));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  scaleFactor = canvas.width / W;
  buildBackdrop();
}

/* ===================================================================
   12. ИНТЕРФЕЙС
   =================================================================== */
const UI = {
  el: {},
  livesShown: -1,
  lastScoreShown: -1,
  _toastTimer: 0,
  _recTimer: 0,
  _tbtns: null,

  init() {
    const ids = ['brand', 'hud', 'board', 'scoreValue', 'lives', 'pauseBtn', 'pauseIcon',
      'soundBtn', 'soundIcon', 'startScreen', 'overlayScreen', 'overlayInner', 'recordValue',
      'startBtn', 'soundBtnMenu', 'soundIconMenu', 'soundTextMenu', 'stageToast', 'recordToast', 'foot'];
    ids.forEach((id) => { this.el[id] = document.getElementById(id); });

    if (this.el.startBtn) this.el.startBtn.addEventListener('click', () => { Sound.resume(); Sound.click(); App.startCountdown(); });
    if (this.el.pauseBtn) this.el.pauseBtn.addEventListener('click', () => { Sound.click(); App.togglePause(); });
    if (this.el.soundBtn) this.el.soundBtn.addEventListener('click', () => { App.toggleSound(); });
    if (this.el.soundBtnMenu) this.el.soundBtnMenu.addEventListener('click', () => { App.toggleSound(); });

    this.renderLives(Game.maxLives);
    this.livesShown = Game.maxLives;
  },

  setBest(v) {
    if (this.el.recordValue) this.el.recordValue.textContent = String(v);
  },

  setScore(v, pop) {
    if (v === this.lastScoreShown) return;
    this.lastScoreShown = v;
    if (this.el.scoreValue) {
      this.el.scoreValue.textContent = String(v);
      if (pop) {
        const e = this.el.scoreValue;
        e.classList.remove('is-pop');
        void e.offsetWidth;
        e.classList.add('is-pop');
      }
    }
  },

  renderLives(n) {
    if (!this.el.lives) return;
    let html = '';
    for (let i = 0; i < Game.maxLives; i++) {
      const lost = i >= n;
      html += '<span class="life' + (lost ? ' is-lost' : '') + '">' +
        '<svg viewBox="0 0 24 24"><path d="M12 21s-7.4-4.6-9.2-9.1C1.2 8.2 3.1 4.7 6.6 4.2c2-.3 3.9.7 5.4 2.4 1.5-1.7 3.4-2.7 5.4-2.4 3.5.5 5.4 4 4 7.7C19.4 16.4 12 21 12 21z" fill="' +
        (lost ? '#efd9e0' : '#ff5f7e') + '" stroke="#fff" stroke-width="1.6"/></svg></span>';
    }
    this.el.lives.innerHTML = html;
  },

  setLives(n, animate) {
    const prev = this.livesShown;
    this.livesShown = n;
    this.renderLives(n);
    if (animate && prev > n && this.el.lives && this.el.lives.children[n]) {
      this.el.lives.children[n].classList.add('is-broken');
    }
  },

  setPlayingUI(on) {
    if (this.el.hud) this.el.hud.classList.toggle('is-hidden', !on);
    document.body.classList.toggle('playing', on);
  },

  showStart() {
    this.hideOverlay();
    this.setPlayingUI(false);
    if (this.el.startScreen) this.el.startScreen.classList.add('is-active');
  },

  hideStart() {
    if (this.el.startScreen) this.el.startScreen.classList.remove('is-active');
  },

  showOverlay(html) {
    if (!this.el.overlayScreen) return;
    this.el.overlayInner.innerHTML = html;
    this.el.overlayScreen.classList.remove('go-flash');
    this.el.overlayScreen.classList.add('is-active');
  },

  hideOverlay() {
    if (!this.el.overlayScreen) return;
    this.el.overlayScreen.classList.remove('is-active');
    this.el.overlayScreen.classList.remove('go-flash');
  },

  showCountdown(n) {
    this.showOverlay('<div class="countdown">' + n + '</div>');
  },

  showGo() {
    if (!this.el.overlayScreen) return;
    this.el.overlayInner.innerHTML = '<div class="countdown is-go">Поехали!</div>';
    this.el.overlayScreen.classList.add('is-active');
    this.el.overlayScreen.classList.add('go-flash');   // не перехватывает касания
  },

  /* Убирает ТОЛЬКО надпись «Поехали!». Если игрок успел поставить паузу
     или смена уже закончилась, чужой экран не трогаем. */
  hideGo() {
    if (!this.el.overlayScreen) return;
    if (!this.el.overlayScreen.classList.contains('go-flash')) return;
    if (Game.state !== 'playing') return;
    this.hideOverlay();
  },

  showPause() {
    this.showOverlay(
      '<div class="pause-emblem">' + SVG_PAUSE_BIG + '</div>' +
      '<h3 class="ov-title">Пауза</h3>' +
      '<p class="ov-text">Смена приостановлена. Принтеры терпеливо ждут.</p>' +
      '<div class="result-actions">' +
      '<button class="btn btn-primary" data-act="resume" type="button">ПРОДОЛЖИТЬ</button>' +
      '<button class="btn btn-ghost" data-act="menu" type="button">ГЛАВНОЕ МЕНЮ</button>' +
      '</div>'
    );
    this.bindOverlay();
  },

  showResult() {
    const s = Game.stats;
    const isRecord = (Game.recordBroken || Game.isNewBest) && Game.score > 0;
    this.showOverlay(
      '<h3 class="ov-title">Смена окончена!</h3>' +
      '<p class="ov-text">' + (isRecord ? SVG_TROPHY + ' Это новый рекорд фотосалона!' : 'Приходите за новыми кадрами!') + '</p>' +
      '<div class="result-grid">' +
      '<div class="result-row"><span>Обработано фотографий</span><strong>' + Game.score + '</strong></div>' +
      '<div class="result-row is-best"><span>Рекорд</span><strong>' + Game.best + '</strong></div>' +
      '<div class="result-row"><span>Лучшая серия</span><strong>' + Game.maxStreak + '</strong></div>' +
      '<div class="result-row"><span>Пропущено фото</span><strong>' + s.missed + '</strong></div>' +
      '</div>' +
      '<div class="result-actions">' +
      '<button class="btn btn-primary" data-act="again" type="button">ИГРАТЬ СНОВА</button>' +
      '<button class="btn btn-secondary" data-act="menu" type="button">ГЛАВНОЕ МЕНЮ</button>' +
      '</div>'
    );
    this.bindOverlay();
  },

  bindOverlay() {
    if (!this.el.overlayInner || !this.el.overlayInner.querySelectorAll) return;
    const btns = this.el.overlayInner.querySelectorAll('[data-act]');
    Array.prototype.forEach.call(btns, (b) => {
      b.addEventListener('click', () => {
        const act = b.getAttribute('data-act');
        Sound.click();
        if (act === 'resume') App.resume();
        else if (act === 'again') App.startCountdown();
        else if (act === 'menu') App.toMenu();
      });
    });
  },

  toast(text, ms) {
    if (!this.el.stageToast) return;
    this.el.stageToast.textContent = text;
    this.el.stageToast.classList.add('is-show');
    window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      this.el.stageToast.classList.remove('is-show');
    }, ms || 1200);
  },

  recordToast() {
    if (!this.el.recordToast) return;
    this.el.recordToast.classList.add('is-show');
    window.clearTimeout(this._recTimer);
    this._recTimer = window.setTimeout(() => {
      this.el.recordToast.classList.remove('is-show');
    }, 1700);
  },

  shake() {
    const b = this.el.board;
    if (!b) return;
    b.classList.remove('is-shake');
    void b.offsetWidth;
    b.classList.add('is-shake');
    window.setTimeout(() => b.classList.remove('is-shake'), 420);
  },

  syncPoseButtons() {
    if (!this._tbtns) this._tbtns = document.querySelectorAll('.tbtn');
    if (!this._tbtns) return;
    Array.prototype.forEach.call(this._tbtns, (b) => {
      b.classList.toggle('is-active', b.getAttribute('data-pose') === Game.pose);
    });
  },

  syncSound() {
    const on = Sound.enabled;
    const svg = on ? SVG_SOUND_ON : SVG_SOUND_OFF;
    if (this.el.soundIcon) this.el.soundIcon.innerHTML = svg;
    if (this.el.soundIconMenu) this.el.soundIconMenu.innerHTML = svg;
    if (this.el.soundTextMenu) this.el.soundTextMenu.textContent = on ? 'Звук включён' : 'Звук выключен';
    if (this.el.soundBtn) {
      this.el.soundBtn.classList.toggle('is-off', !on);
      this.el.soundBtn.title = on ? 'Звук включён (M)' : 'Звук выключен (M)';
    }
  },

  syncPauseIcon() {
    const paused = (Game.state === 'paused');
    if (this.el.pauseIcon) this.el.pauseIcon.textContent = paused ? '▶' : '❚❚';
    if (this.el.pauseBtn) this.el.pauseBtn.title = paused ? 'Продолжить (P)' : 'Пауза (P)';
  }
};

/* ---------- Смена состояний ---------- */
const App = {
  startCountdown() {
    Sound.resume();
    resetRound();
    UI.hideStart();
    UI.hideOverlay();
    UI.setPlayingUI(true);
    UI.setScore(0);
    UI.lastScoreShown = 0;
    UI.setLives(Game.maxLives);
    UI.setBest(Game.best);
    UI.syncPoseButtons();
    Game.state = 'countdown';
    Game.countdownValue = 3;
    Game.countdownTimer = 0.62;
    UI.showCountdown(3);
    Sound.countdown(false);
    lastT = 0;
    UI.syncPauseIcon();
    resizeCanvas();
  },

  togglePause() {
    if (Game.state === 'playing') {
      Game.state = 'paused';
      UI.showPause();
      UI.syncPauseIcon();
    } else if (Game.state === 'paused') {
      this.resume();
    }
  },

  resume() {
    if (Game.state !== 'paused') return;
    UI.hideOverlay();
    Game.state = 'playing';
    lastT = 0;
    UI.syncPauseIcon();
    resizeCanvas();
  },

  toggleSound() {
    const on = Sound.setEnabled(!Sound.enabled);
    if (on) Sound.click();
    UI.syncSound();
  },

  toMenu() {
    Game.state = 'menu';
    Game.photos.length = 0;
    Game.effects.length = 0;
    POSES.forEach((p) => { PRINTERS[p].head = null; });
    UI.hideOverlay();
    UI.hideStart();
    UI.setPlayingUI(false);
    UI.showStart();
    UI.setBest(Game.best);
    UI.syncPauseIcon();
    UI.syncPoseButtons();
    resizeCanvas();
  }
};

function endGame() {
  Game.state = 'over';
  Game.photos.length = 0;
  Sound.gameOver();
  // новый личный рекорд? (первая смена тоже считается — рекорд-то установлен)
  Game.isNewBest = (Game.score > 0 && Game.score > Game.prevBest);
  if (Game.score > Game.best) { Game.best = Game.score; Store.write(Game.best); }
  UI.setBest(Game.best);
  UI.setPlayingUI(true);
  UI.showResult();
  UI.syncPauseIcon();
}

/* ===================================================================
   13. ВВОД
   Раскладка позиций (2×2) и клавиши:
        ↖ W / ↑ / 7 (Q)      ↗ D / → / 9 (E)
        ↙ A / ← / 1 (Z)      ↘ S / ↓ / 3 (C)
   =================================================================== */
const KEYMAP = {
  ArrowUp: 'tl', ArrowLeft: 'tl', KeyW: 'tl', KeyA: 'tl', KeyQ: 'tl',
  Numpad7: 'tl', Numpad8: 'tl', Numpad4: 'tl', Digit7: 'tl',
  ArrowRight: 'tr', KeyD: 'tr', KeyE: 'tr',
  Numpad9: 'tr', Numpad6: 'tr', Digit9: 'tr',
  ArrowDown: 'bl', KeyS: 'bl', KeyZ: 'bl',
  Numpad1: 'bl', Numpad2: 'bl', Digit1: 'bl',
  KeyC: 'br', Numpad3: 'br', Numpad5: 'br', Digit3: 'br'
};

const Input = {
  swipe: null,
  init() {
    const opts = { passive: false };
    window.addEventListener('keydown', this.onKeyDown, false);

    // сенсорные кнопки
    const btns = document.querySelectorAll('.tbtn');
    Array.prototype.forEach.call(btns, (btn) => {
      const pose = btn.getAttribute('data-pose');
      const down = (e) => {
        if (e.cancelable) e.preventDefault();
        Sound.resume();
        btn.classList.add('is-active');
        if (Game.state === 'playing') setPose(pose);
        else if (Game.state === 'menu' || Game.state === 'over') { /* подсказка жестом */ }
      };
      const up = () => { btn.classList.remove('is-active'); UI.syncPoseButtons(); };
      btn.addEventListener('pointerdown', down, opts);
      btn.addEventListener('pointerup', up, false);
      btn.addEventListener('pointercancel', up, false);
      btn.addEventListener('pointerleave', up, false);
      btn.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, opts);
      btn.addEventListener('contextmenu', (e) => e.preventDefault(), false);
    });

    // поле: свайп одним пальцем и тап по четверти
    const board = document.getElementById('board');
    if (board) {
      board.addEventListener('pointerdown', (e) => {
        Sound.resume();
        this.swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }, opts);
      board.addEventListener('pointerup', (e) => {
        if (!this.swipe || this.swipe.id !== e.pointerId) return;
        const dx = e.clientX - this.swipe.x;
        const dy = e.clientY - this.swipe.y;
        this.swipe = null;
        if (Game.state !== 'playing') return;
        const rect = board.getBoundingClientRect ? board.getBoundingClientRect() : { left: 0, top: 0, width: W, height: H };
        if (Math.hypot(dx, dy) < 26) {
          const rx = (e.clientX - rect.left) / (rect.width || W);
          const ry = (e.clientY - rect.top) / (rect.height || H);
          setPose((ry < 0.5 ? 't' : 'b') + (rx < 0.5 ? 'l' : 'r'));
        } else if (Math.abs(dx) > Math.abs(dy)) {
          setPose(dx < 0 ? 'tl' : 'tr');
        } else {
          setPose(dy < 0 ? 'tl' : 'bl');
        }
      }, false);
      board.addEventListener('pointercancel', () => { this.swipe = null; }, false);
      board.addEventListener('contextmenu', (e) => e.preventDefault(), false);
    }

    // автопауза при уходе со вкладки
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
    }, false);
    window.addEventListener('blur', () => { this.autoPause(); }, false);
    window.addEventListener('resize', () => { resizeCanvas(); }, false);
    window.addEventListener('orientationchange', () => { window.setTimeout(resizeCanvas, 250); }, false);
  },

  autoPause() {
    if (Game.state === 'playing') {
      Game.state = 'paused';
      UI.showPause();
      UI.syncPauseIcon();
    }
  },

  onKeyDown(e) {
    const code = e.code || '';
    if (code === 'KeyP' || code === 'Escape' || code === 'Space') {
      if (Game.state === 'playing' || Game.state === 'paused') {
        if (e.cancelable) e.preventDefault();
        App.togglePause();
      } else if (code === 'Space' && Game.state === 'menu') {
        if (e.cancelable) e.preventDefault();
        Sound.resume();
        App.startCountdown();
      }
      return;
    }
    if (code === 'Enter') {
      if (Game.state === 'menu' || Game.state === 'over') { if (e.cancelable) e.preventDefault(); Sound.resume(); App.startCountdown(); }
      else if (Game.state === 'paused') { if (e.cancelable) e.preventDefault(); App.resume(); }
      return;
    }
    if (code === 'KeyM') { App.toggleSound(); return; }

    const pose = KEYMAP[code];
    if (!pose) return;
    if (e.cancelable) e.preventDefault();
    if (e.repeat) return;
    Sound.resume();
    if (Game.state === 'playing') setPose(pose);
  }
};

/* ===================================================================
   14. ЗАПУСК
   =================================================================== */
function boot() {
  canvas = document.getElementById('game');
  if (canvas && canvas.getContext) {
    try { ctx2d = canvas.getContext('2d'); } catch (e) { ctx2d = null; }
  }
  Game.best = Store.read();
  UI.init();
  UI.setBest(Game.best);
  UI.syncSound();
  UI.syncPauseIcon();
  UI.syncPoseButtons();
  Input.init();
  resizeCanvas();
  window.requestAnimationFrame(() => resizeCanvas());
  UI.showStart();
  Game.state = 'menu';
  rafId = window.requestAnimationFrame(loop);
}

/* Экспорт для отладки и автотестов */
window.FotoSmile = {
  Game: Game, App: App, UI: UI, Input: Input, Sound: Sound, Store: Store,
  Difficulty: Difficulty, render: render, loop: loop, KEYMAP: KEYMAP,
  W: W, H: H, POSES: POSES, PRINTERS: PRINTERS, ART_IDS: ART_IDS,
  _internal: {
    resetRound: resetRound, setPose: setPose, spawnPhoto: spawnPhoto, catchPhoto: catchPhoto,
    onMiss: onMiss, gameUpdate: gameUpdate, trayPoint: trayPoint, endGame: endGame,
    resizeCanvas: resizeCanvas, buildBackdrop: buildBackdrop, checkCatch: checkCatch,
    spawningLocked: spawningLocked, updatePhotos: updatePhotos, drawPhotoCard: drawPhotoCard,
    drawArt: drawArt, ui: UI, app: App, input: Input
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, false);
} else {
  boot();
}

})();
