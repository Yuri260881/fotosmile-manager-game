/* =====================================================================
   Стенд для автотестов: мок DOM, Canvas 2D и виртуального времени.
   Загружает game.js в песочницу Node и отдаёт наружу API игры.
   ===================================================================== */
'use strict';

/* Общий стенд: мок DOM + Canvas + виртуальное время. Экспортирует всё, что нужно тестам. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* ------------------------------------------------------------------
   Виртуальные таймеры и часы
   ------------------------------------------------------------------ */
let clock = 0;
let timers = [];
let timerSeq = 1;

function vSetTimeout(fn, ms) {
  const id = timerSeq++;
  timers.push({ id: id, fn: fn, at: clock + (ms || 0) });
  return id;
}
function vClearTimeout(id) {
  timers = timers.filter((t) => t.id !== id);
}
function runDueTimers() {
  let again = true;
  while (again) {
    again = false;
    for (let i = 0; i < timers.length; i++) {
      if (timers[i].at <= clock) {
        const t = timers.splice(i, 1)[0];
        t.fn();
        again = true;
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------
   Мок canvas-контекста (все методы — пустышки)
   ------------------------------------------------------------------ */
let drawCalls = 0;
function makeCtx() {
  const stored = {};
  const gradient = { addColorStop: function () {} };
  const handler = {
    get: function (target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
        return function () { return gradient; };
      }
      if (prop === 'measureText') return function () { return { width: 10 }; };
      if (prop === 'canvas') return { width: 1000, height: 760 };
      if (typeof prop === 'symbol') return undefined;
      return function () { drawCalls++; };
    },
    set: function (target, prop, value) { target[prop] = value; return true; }
  };
  return new Proxy(stored, handler);
}

/* ------------------------------------------------------------------
   Мок DOM
   ------------------------------------------------------------------ */
function makeEl(tag, id) {
  const listeners = {};
  const el = {
    tagName: tag, id: id || '', style: {}, dataset: {}, children: [],
    textContent: '', title: '', offsetWidth: 100, clientWidth: 880, clientHeight: 660,
    _html: '',
    classList: {
      _s: {},
      add: function () { for (let i = 0; i < arguments.length; i++) this._s[arguments[i]] = 1; },
      remove: function () { for (let i = 0; i < arguments.length; i++) delete this._s[arguments[i]]; },
      contains: function (c) { return !!this._s[c]; },
      toggle: function (c, force) {
        const has = !!this._s[c];
        const want = (force === undefined) ? !has : !!force;
        if (want) this._s[c] = 1; else delete this._s[c];
        return want;
      }
    },
    addEventListener: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: function (type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter((f) => f !== fn);
    },
    dispatch: function (type, ev) {
      const list = listeners[type] || [];
      const e = Object.assign({ type: type, cancelable: true, preventDefault: function () {}, stopPropagation: function () {} }, ev || {});
      list.slice().forEach((f) => f(e));
      return list.length;
    },
    hasListener: function (type) { return !!(listeners[type] && listeners[type].length); },
    appendChild: function (c) { this.children.push(c); return c; },
    removeChild: function (c) { this.children = this.children.filter((x) => x !== c); },
    getAttribute: function (n) { return this.dataset[n] !== undefined ? this.dataset[n] : null; },
    setAttribute: function (n, v) { this.dataset[n] = v; },
    querySelectorAll: function () { return this.children; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 880, height: 668 }; }
  };
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return this._html; },
    set: function (html) {
      this._html = String(html);
      this.children = [];
      const re = /data-act="([a-z]+)"/g;
      let m;
      while ((m = re.exec(this._html)) !== null) {
        const act = m[1];
        const btn = makeEl('button');
        btn.dataset.act = act;
        btn.getAttribute = function (n) { return n === 'data-act' ? act : null; };
        this.children.push(btn);
      }
    }
  });
  return el;
}

function makeCanvasEl(id) {
  const el = makeEl('canvas', id);
  el.width = 1000; el.height = 760;
  el.getContext = function () { return el._ctx || (el._ctx = makeCtx()); };
  return el;
}

const IDS = ['brand', 'hud', 'board', 'scoreValue', 'lives', 'pauseBtn', 'pauseIcon',
  'soundBtn', 'soundIcon', 'startScreen', 'overlayScreen', 'overlayInner', 'recordValue',
  'startBtn', 'soundBtnMenu', 'soundIconMenu', 'soundTextMenu', 'stageToast', 'recordToast', 'foot'];

const els = {};
IDS.forEach((id) => { els[id] = makeEl('div', id); });
els.game = makeCanvasEl('game');

// сенсорные кнопки
const tbtns = ['tl', 'tr', 'bl', 'br'].map((pose) => {
  const b = makeEl('button');
  b.dataset.pose = pose;
  b.getAttribute = function (n) { return n === 'data-pose' ? pose : null; };
  return b;
});

const documentMock = {
  readyState: 'complete',
  hidden: false,
  body: makeEl('body'),
  documentElement: makeEl('html'),
  getElementById: function (id) { return els[id] || null; },
  createElement: function (tag) { return tag === 'canvas' ? makeCanvasEl('offscreen') : makeEl(tag); },
  querySelectorAll: function (sel) {
    if (sel === '.tbtn') return tbtns;
    if (sel === '[data-act]') return els.overlayInner.children;
    return [];
  },
  querySelector: function () { return null; },
  addEventListener: function () {},
  removeEventListener: function () {}
};

/* ------------------------------------------------------------------
   Мок localStorage и window
   ------------------------------------------------------------------ */
let lsData = {};
const localStorageMock = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(lsData, k) ? lsData[k] : null; },
  setItem: function (k, v) { lsData[k] = String(v); },
  removeItem: function (k) { delete lsData[k]; },
  clear: function () { lsData = {}; }
};

let rafQueue = [];
const windowMock = {
  devicePixelRatio: 2,
  performance: { now: function () { return clock; } },
  localStorage: localStorageMock,
  requestAnimationFrame: function (cb) { rafQueue.push(cb); return rafQueue.length; },
  cancelAnimationFrame: function () {},
  setTimeout: vSetTimeout,
  clearTimeout: vClearTimeout,
  addEventListener: function () {},
  AudioContext: undefined,
  webkitAudioContext: undefined
};

/* ------------------------------------------------------------------
   Загрузка игры
   ------------------------------------------------------------------ */
const code = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const sandbox = { window: windowMock, document: documentMock, console: console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'game.js' });

const FS = windowMock.FotoSmile;
if (!FS) { console.error('НЕ ЗАГРУЗИЛСЯ window.FotoSmile'); process.exit(1); }
const Game = FS.Game, App = FS.App, UI = FS.UI, Sound = FS.Sound, Store = FS.Store;
const I = FS._internal;
const W_ = FS.W, H_ = FS.H, CXv = W_ / 2, CYv = H_ / 2;
const POSE_ANG = { tl: -3 * Math.PI / 4, tr: -Math.PI / 4, bl: 3 * Math.PI / 4, br: Math.PI / 4 };

/* ------------------------------------------------------------------
   Прогон кадров
   ------------------------------------------------------------------ */
function frames(seconds, dtMs) {
  const step = dtMs || 16.7;
  const n = Math.round((seconds * 1000) / step);
  for (let i = 0; i < n; i++) {
    clock += step;
    runDueTimers();
    const q = rafQueue;
    rafQueue = [];
    for (let k = 0; k < q.length; k++) q[k](clock);
  }
}

function keydown(code) {
  // клавиатуру слушает window: подменяем обработчик напрямую
  const e = { code: code, repeat: false, cancelable: true, preventDefault: function () {} };
  FS.Input.onKeyDown(e);
}


module.exports = { FS, Game, App, UI, Sound, Store, I, W_, H_, CXv, CYv, POSE_ANG, els, tbtns, frames, keydown, getClock: () => clock, setClock: (v) => { clock = v; }, localStorageMock, rafQueue: () => rafQueue };
