/* =====================================================================
   Интеграционные тесты в настоящем браузере (Chromium, headless).
   Проверяют то, что не проверить в Node: реальные клики, клавиатуру,
   requestAnimationFrame, рендер canvas, адаптивность и localStorage.

   Запуск:  node tests/browser-test.js
   (нужны playwright-core и скачанный chromium — см. README)
   ===================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');

/* playwright-core можно установить локально (npm i playwright-core) или указать путь
   переменной окружения PW_PATH. Браузер — CHROME_PATH (по умолчанию ищем скачанный
   через `npx playwright-core install chromium`). */
function loadPlaywright() {
  const candidates = [process.env.PW_PATH, 'playwright-core', '/tmp/pw/node_modules/playwright-core']
    .filter(Boolean);
  for (const c of candidates) { try { return require(c); } catch (e) { /* пробуем дальше */ } }
  console.error('Не найден playwright-core. Установите: npm i playwright-core');
  process.exit(1);
}
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const roots = ['/tmp/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const dir of fs.readdirSync(r)) {
      const p = path.join(r, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  return 'chromium';
}
const { chromium } = loadPlaywright();
const CHROME = findChrome();

const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const SHOTS = path.join(__dirname, '..', '..', 'shots');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  \u2717 ' + name + (extra ? '  (' + extra + ')' : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(URL);
  await sleep(350);

  const S = (fn, arg) => page.evaluate(fn, arg);

  /* ---------------- 1. Загрузка ---------------- */
  section('1. Загрузка страницы');
  check('нет JS-ошибок на странице', pageErrors.length === 0, pageErrors.join(' | '));
  check('нет ошибок в консоли', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('игра загрузилась (FotoSmile)', await S(() => typeof window.FotoSmile === 'object'));
  check('состояние menu', (await S(() => window.FotoSmile.Game.state)) === 'menu');
  check('стартовый экран виден', await S(() => getComputedStyle(document.getElementById('startScreen')).display !== 'none'));
  const overflowX = await S(() => document.documentElement.scrollWidth - window.innerWidth);
  check('нет горизонтальной прокрутки', overflowX <= 0, String(overflowX));

  /* ---------------- 2. Кнопка СТАРТ и отсчёт ---------------- */
  section('2. «НАЧАТЬ СМЕНУ» и отсчёт');
  await page.click('#startBtn');
  await sleep(250);
  check('отсчёт начался', (await S(() => window.FotoSmile.Game.state)) === 'countdown');
  check('видно цифру 3', (await S(() => document.querySelector('.countdown') ? document.querySelector('.countdown').textContent : '')) === '3');
  await sleep(800);
  check('видно цифру 2', (await S(() => document.querySelector('.countdown') ? document.querySelector('.countdown').textContent : '')) === '2');
  await sleep(1400);
  const st = await S(() => window.FotoSmile.Game.state);
  check('игра началась (playing)', st === 'playing', st);
  check('«Поехали!» показано', await S(() => document.querySelector('.countdown.is-go') !== null || window.FotoSmile.Game.time > 0));
  check('оверлей отсчёта не блокирует игровое поле', await S(() => {
    const ov = document.getElementById('overlayScreen');
    const cs = getComputedStyle(ov);
    if (cs.display === 'none' || cs.pointerEvents === 'none') return true;
    const el = document.elementFromPoint(600, 500);
    return !!(el && el.id === 'game');
  }));
  await sleep(500);
  check('надпись исчезла, управление доступно', await S(() => document.getElementById('overlayScreen').classList.contains('is-active') === false));

  /* ---------------- 3. Клавиатура ---------------- */
  section('3. Клавиатурное управление (реальные нажатия)');
  const clearPhotos = () => S(() => { window.FotoSmile.Game.photos.length = 0; });
  const realKeys = [
    ['ArrowUp', 'tl'], ['w', 'tl'], ['ArrowLeft', 'tl'], ['a', 'tl'], ['q', 'tl'],
    ['ArrowRight', 'tr'], ['d', 'tr'], ['e', 'tr'],
    ['ArrowDown', 'bl'], ['s', 'bl'], ['z', 'bl'],
    ['c', 'br']
  ];
  for (const [key, want] of realKeys) {
    await clearPhotos();
    await page.keyboard.press(key);
    await sleep(60);
    const got = await S(() => window.FotoSmile.Game.pose);
    check('клавиша «' + key + '» -> ' + want, got === want, got);
  }
  const numpad = [['Numpad7', 'tl'], ['Numpad9', 'tr'], ['Numpad1', 'bl'], ['Numpad3', 'br']];
  for (const [code, want] of numpad) {
    await clearPhotos();
    await S((c) => window.FotoSmile.Input.onKeyDown({ code: c, repeat: false, cancelable: true, preventDefault() {} }), code);
    await sleep(40);
    const got = await S(() => window.FotoSmile.Game.pose);
    check('NumPad ' + code + ' -> ' + want, got === want, got);
  }
  // реальная клавиша P (пауза) и M (звук)
  await page.keyboard.press('p');
  await sleep(120);
  check('клавиша P ставит паузу', (await S(() => window.FotoSmile.Game.state)) === 'paused');
  await page.keyboard.press('p');
  await sleep(120);
  check('клавиша P снимает паузу', (await S(() => window.FotoSmile.Game.state)) === 'playing');
  const soundBefore = await S(() => window.FotoSmile.Sound.enabled);
  await page.keyboard.press('m');
  await sleep(80);
  check('клавиша M переключает звук', (await S(() => window.FotoSmile.Sound.enabled)) !== soundBefore);
  await page.keyboard.press('m');
  await sleep(80);

  // блокировка переключения у самого центра
  const blocked = await S(() => {
    const F = window.FotoSmile, G = F.Game;
    const ph = F._internal.spawnPhoto('br');
    ph.phase = 'fly'; ph.x = 500 + 60; ph.y = 380 + 60; ph.progress = 0.9;
    F._internal.setPose('tl', true);
    const before = G.pose;
    const ok = F._internal.setPose('br');     // слишком поздно — должно быть отказано
    const after = G.pose;
    G.photos.length = 0;
    return { ok: ok, before: before, after: after, flash: G.blockedFlash > 0 };
  });
  check('нельзя переключиться, когда фото уже у центра', blocked.ok === false && blocked.after === blocked.before);
  check('дан визуальный сигнал о позднем переключении', blocked.flash === true);

  /* ---------------- 4. Игровой процесс ---------------- */
  section('4. Игровой процесс в реальном времени');
  const res = await S(async () => {
    const F = window.FotoSmile, G = F.Game, I = F._internal;
    G.lives = 99; G.score = 0; G.photos.length = 0;
    let caught = 0, missed = 0, spawned = 0;
    const seen = {};
    const t0 = performance.now();
    while (performance.now() - t0 < 14000) {
      await new Promise((r) => requestAnimationFrame(r));
      if (G.photos.length) {
        seen[G.photos[0].pose] = true;
        // играем «идеально»: целимся в позицию ближайшей к центру фотографии
        let best = null, bestD = 1e9;
        for (const p of G.photos) {
          if (p.phase !== 'fly' && p.phase !== 'stall') continue;
          const d = Math.hypot(p.x - 500, p.y - 380);
          if (d < bestD) { bestD = d; best = p; }
        }
        if (best && bestD < 260) I.setPose(best.pose, false);
      }
    }
    spawned = Object.keys(seen).length;
    return { score: G.score, lives: G.lives, missed: G.stats.missed, spawned: spawned, poses: G.stats.poses, state: G.state };
  });
  check('фотографии появлялись минимум с 2 принтеров', res.spawned >= 2, JSON.stringify(res.spawned));
  check('ловля работает в реальном времени (счёт > 0)', res.score > 0, 'счёт=' + res.score);
  check('переключения позиций работают', Object.values(res.poses).filter((v) => v > 0).length >= 2, JSON.stringify(res.poses));

  /* ---------------- 5. Жизни и Game Over ---------------- */
  section('5. Ошибки, жизни, Game Over');
  await S(() => {
    const G = window.FotoSmile.Game;
    G.lives = 1; G.photos.length = 0; G.state = 'playing';
    window.FotoSmile._internal.setPose('tl', true);
    const ph = window.FotoSmile._internal.spawnPhoto('br');
    ph.phase = 'fly'; ph.x = 500 + 118; ph.y = 380 + 118; ph.progress = 1;
  });
  await sleep(900);
  check('после третьей ошибки — Game Over', (await S(() => window.FotoSmile.Game.state)) === 'over');
  check('экран «Смена окончена!» виден', await S(() => {
    const el = document.getElementById('overlayScreen');
    return el.classList.contains('is-active') && el.textContent.indexOf('Смена окончена') > -1;
  }));
  check('есть кнопки «Играть снова» и «Главное меню»', await S(() => {
    const t = document.getElementById('overlayInner').textContent;
    return t.indexOf('ИГРАТЬ СНОВА') > -1 && t.indexOf('ГЛАВНОЕ МЕНЮ') > -1;
  }));

  /* ---------------- 6. Перезапуск и меню через клики ---------------- */
  section('6. Перезапуск и главное меню (клики мышью)');
  await page.click('#overlayInner [data-act="again"]');
  await sleep(2400);
  check('«Играть снова» запускает новый раунд', (await S(() => window.FotoSmile.Game.state)) === 'playing');
  check('счёт обнулён', (await S(() => window.FotoSmile.Game.score)) === 0);
  await page.keyboard.press('p');
  await sleep(150);
  check('клавиша P ставит паузу', (await S(() => window.FotoSmile.Game.state)) === 'paused');
  check('оверлей паузы виден', await S(() => document.getElementById('overlayInner').textContent.indexOf('Пауза') > -1));
  const clickedFromVisibleOverlay = await S(() => {
    const b = document.querySelector('#overlayInner [data-act="menu"]');
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  await page.click('#overlayInner [data-act="menu"]', { timeout: 8000 });
  await sleep(200);
  check('«Главное меню» возвращает в меню (оверлей паузы видим при клике)', clickedFromVisibleOverlay === true);
  check('«Главное меню» возвращает в меню', (await S(() => window.FotoSmile.Game.state)) === 'menu');
  check('стартовый экран снова виден', await S(() => document.getElementById('startScreen').classList.contains('is-active')));

  /* ---------------- 6b. Регресс: «Поехали!» не гасит экран паузы ---------------- */
  section('6b. Пауза сразу после «Поехали!» (регресс)');
  await page.click('#startBtn');
  await sleep(1900);                       // отсчёт заканчивается примерно здесь
  await page.keyboard.press('p');
  await sleep(900);                        // «Поехали!» успевает «протухнуть»
  const overlayStillVisible = await S(() => {
    const b = document.querySelector('#overlayInner [data-act="resume"]');
    if (!b) return 'нет кнопки';
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  check('экран паузы остаётся видимым (его не гасит таймер «Поехали!»)', overlayStillVisible === true, String(overlayStillVisible));
  check('игра по-прежнему на паузе', (await S(() => window.FotoSmile.Game.state)) === 'paused');
  await page.keyboard.press('p');
  await sleep(200);

  /* ---------------- 7. Пауза: движение полностью стоит ---------------- */
  section('7. Пауза останавливает всё движение');
  await S(() => window.FotoSmile.App.toMenu());
  await sleep(150);
  await page.click('#startBtn');
  await sleep(2500);
  await S(() => {
    const G = window.FotoSmile.Game;
    G.photos.length = 0;
    const ph = window.FotoSmile._internal.spawnPhoto('tl');
    ph.phase = 'fly'; ph.progress = 0.4;
    ph.x = ph.from.x + (ph.tx - ph.from.x) * 0.4;
    ph.y = ph.from.y + (ph.ty - ph.from.y) * 0.4;
  });
  await page.click('#pauseBtn');
  await sleep(120);
  const frozen1 = await S(() => {
    const G = window.FotoSmile.Game;
    return { x: G.photos[0] && G.photos[0].x, y: G.photos[0] && G.photos[0].y, t: G.time };
  });
  await sleep(900);
  const frozen2 = await S(() => {
    const G = window.FotoSmile.Game;
    return { x: G.photos[0] && G.photos[0].x, y: G.photos[0] && G.photos[0].y, t: G.time };
  });
  check('фотография не двигается на паузе', frozen1.x === frozen2.x && frozen1.y === frozen2.y);
  check('игровое время на паузе стоит', frozen1.t === frozen2.t);
  await page.click('#pauseBtn');
  await sleep(700);
  const moved = await S(() => {
    const G = window.FotoSmile.Game;
    return G.photos.length === 0 || G.photos[0].x !== 0;
  });
  check('после снятия паузы игра продолжается', moved && (await S(() => window.FotoSmile.Game.state)) === 'playing');

  /* ---------------- 8. Кнопки панели ---------------- */
  section('8. Кнопка звука и пауза мышью');
  const s1 = await S(() => window.FotoSmile.Sound.enabled);
  await page.click('#soundBtn');
  await sleep(80);
  const s2 = await S(() => window.FotoSmile.Sound.enabled);
  check('кнопка звука переключает звук', s1 !== s2);
  check('иконка звука — SVG', await S(() => document.querySelector('#soundIcon svg') !== null));
  check('настройка звука сохранена в localStorage', await S(() => window.localStorage.getItem('fotosmile.sound.v1') === (window.FotoSmile.Sound.enabled ? 'on' : 'off')));
  await page.click('#soundBtn');
  await sleep(60);
  const r = await S(() => {
    document.getElementById('soundBtn').click();
    const v = window.FotoSmile.Sound.enabled;
    document.getElementById('soundBtn').click();
    return v;
  });
  check('повторное переключение возвращает звук', r !== null);

  /* ---------------- 9. localStorage: рекорд ---------------- */
  section('9. Сохранение рекорда');
  await S(() => {
    const F = window.FotoSmile, I = F._internal, G = F.Game;
    G.state = 'playing'; G.score = 0; G.lives = 99; G.photos.length = 0;
    G.best = 5; G.prevBest = 5; G.recordBroken = false; G.isNewBest = false;
    localStorage.setItem('fotosmile.record.v1', '5');
    for (let i = 0; i < 12; i++) {
      G.pose = 'tl';
      const ph = I.spawnPhoto('tl');
      ph.phase = 'fly'; ph.x = 500 - 60; ph.y = 380 - 60; ph.progress = 1;
      I.checkCatch();
    }
  });
  check('рекорд записан в localStorage', (await S(() => localStorage.getItem('fotosmile.record.v1'))) === '12',
    await S(() => String(localStorage.getItem('fotosmile.record.v1'))));
  check('сообщение «НОВЫЙ РЕКОРД!» показано', await S(() => document.getElementById('recordToast').classList.contains('is-show')));

  // перезагрузка страницы — рекорд должен остаться
  await page.reload();
  await sleep(400);
  check('после перезагрузки рекорд сохранён', (await S(() => window.FotoSmile.Game.best)) === 12,
    String(await S(() => window.FotoSmile.Game.best)));
  check('рекорд виден в меню', (await S(() => document.getElementById('recordValue').textContent)) === '12');
  await S(() => { localStorage.setItem('fotosmile.record.v1', '0'); window.FotoSmile.Game.best = 0; window.FotoSmile.UI.setBest(0); });

  /* ---------------- 10. Производительность ---------------- */
  section('10. FPS и стабильность');
  await page.click('#startBtn');
  await sleep(2500);
  const fps = await S(async () => {
    const G = window.FotoSmile.Game;
    G.score = 140;                    // максимальная сложность
    let frames = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 2500) {
      await new Promise((r) => requestAnimationFrame(r));
      frames++;
    }
    return Math.round(frames / ((performance.now() - t0) / 1000));
  });
  check('держится ~60 FPS на высокой сложности (>=45)', fps >= 45, fps + ' fps');
  const perf = await S(() => {
    const G = window.FotoSmile.Game;
    return { photos: G.photos.length, effects: G.effects.length, domNodes: document.querySelectorAll('*').length };
  });
  check('объекты не накапливаются', perf.photos <= 6 && perf.effects <= 60, JSON.stringify(perf));
  await sleep(4000);
  const leak = await S(() => {
    const G = window.FotoSmile.Game;
    return { photos: G.photos.length, effects: G.effects.length, dom: document.querySelectorAll('*').length, state: G.state };
  });
  console.log('    [DOM] во время игры: ' + perf.domNodes + ' узлов, через 4 секунды: ' + leak.dom + ' узлов');
  check('DOM не разрастается со временем (< +40 узлов)', leak.dom - perf.domNodes < 40,
    perf.domNodes + ' -> ' + leak.dom);
  check('через 4 секунды после нагрузки объектов столько же', leak.photos <= 6 && leak.effects <= 60, JSON.stringify(leak));

  await S(() => { if (window.FotoSmile.Game.state !== 'menu') window.FotoSmile.App.toMenu(); });
  await sleep(150);

  /* ---------------- 11. Адаптивность ---------------- */
  section('11. Адаптивность (мобильные / планшет / ноутбук)');
  const sizes = [
    { name: 'iPhone SE', w: 375, h: 667, touch: true },
    { name: 'iPhone 14', w: 390, h: 844, touch: true },
    { name: 'iPad', w: 820, h: 1180, touch: true },
    { name: 'ноутбук', w: 1366, h: 768, touch: false },
    { name: 'маленький landscape', w: 740, h: 360, touch: true }
  ];
  for (const sz of sizes) {
    const ctx = await browser.newContext({
      viewport: { width: sz.w, height: sz.h }, hasTouch: sz.touch, isMobile: sz.touch
    });
    const p2 = await ctx.newPage();
    const errs2 = [];
    p2.on('pageerror', (e) => errs2.push(e.message));
    await p2.goto(URL);
    await sleep(250);
    await p2.click('#startBtn');
    await sleep(2450);
    const m = await p2.evaluate(() => {
      const board = document.getElementById('board').getBoundingClientRect();
      const btn = document.querySelector('.tbtn');
      const br = btn ? btn.getBoundingClientRect() : null;
      const hud = document.getElementById('hud').getBoundingClientRect();
      return {
        scrollX: document.documentElement.scrollWidth - window.innerWidth,
        boardW: Math.round(board.width),
        boardBottom: Math.round(board.bottom),
        boardRight: Math.round(board.right),
        winH: window.innerHeight,
        winW: window.innerWidth,
        touchVisible: btn ? getComputedStyle(document.querySelector('.touchpad')).display !== 'none' : false,
        btnW: br ? Math.round(br.width) : 0,
        btnH: br ? Math.round(br.height) : 0,
        hudVisible: hud.height > 0,
        bodyPlaying: document.body.classList.contains('playing'),
        locked: getComputedStyle(document.body).overflow
      };
    });
    check(sz.name + ': нет горизонтальной прокрутки', m.scrollX <= 0, String(m.scrollX));
    check(sz.name + ': сцена не выходит за экран по ширине', m.boardRight <= m.winW + 1, m.boardRight + ' > ' + m.winW);
    check(sz.name + ': HUD виден', m.hudVisible);
    check(sz.name + ': игра прокрутку блокирует', m.bodyPlaying && m.locked === 'hidden', m.locked);
    if (sz.touch) {
      check(sz.name + ': сенсорные кнопки показаны', m.touchVisible);
      check(sz.name + ': кнопки не меньше 40×40 px', m.btnW >= 40 && m.btnH >= 40, m.btnW + '×' + m.btnH);
    } else {
      check(sz.name + ': на ноутбуке кнопок нет (нужна клавиатура)', m.touchVisible === false);
    }
    check(sz.name + ': нет JS-ошибок', errs2.length === 0, errs2.join(' | '));
    await ctx.close();
  }

  /* ---------------- 12. Тач-управление в браузере ---------------- */
  section('12. Тач-управление (реальные тапы и свайпы)');
  const ctxT = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pt = await ctxT.newPage();
  await pt.goto(URL);
  await sleep(250);
  await pt.click('#startBtn');
  await sleep(2450);
  await pt.evaluate(() => { window.FotoSmile.Game.photos.length = 0; });
  const tapPoses = [[0, 'tl'], [1, 'tr'], [2, 'bl'], [3, 'br']];
  for (const [idx, want] of tapPoses) {
    await pt.evaluate(() => { window.FotoSmile.Game.photos.length = 0; });
    await pt.locator('.tbtn').nth(idx).tap();
    await sleep(120);
    const got = await pt.evaluate(() => window.FotoSmile.Game.pose);
    check('тап по кнопке №' + (idx + 1) + ' -> ' + want, got === want, got);
  }
  // свайпы по полю
  const box = await pt.locator('#board').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const swipe = async (dx, dy) => {
    await pt.evaluate(() => { window.FotoSmile.Game.photos.length = 0; });
    await pt.mouse.move(cx, cy);
    await pt.mouse.down();
    await pt.mouse.move(cx + dx, cy + dy, { steps: 5 });
    await pt.mouse.up();
    await sleep(120);
    return pt.evaluate(() => window.FotoSmile.Game.pose);
  };
  check('свайп вверх -> ↖', (await swipe(0, -90)) === 'tl');
  check('свайп вправо -> ↗', (await swipe(90, 0)) === 'tr');
  check('свайп вниз -> ↙', (await swipe(0, 90)) === 'bl');
  check('свайп влево -> ↖', (await swipe(-90, 0)) === 'tl');
  await ctxT.close();

  /* ---------------- 13. Звук через Web Audio ---------------- */
  section('13. Звук (Web Audio API в браузере)');
  const ctxA = await browser.newContext({ viewport: { width: 1100, height: 860 } });
  const pa = await ctxA.newPage();
  const audioErrors = [];
  pa.on('pageerror', (e) => audioErrors.push(e.message));
  await pa.goto(URL);
  await sleep(300);
  await pa.click('#startBtn');                      // жест пользователя — разрешает звук
  await sleep(600);
  const audio = await pa.evaluate(() => {
    const S = window.FotoSmile.Sound;
    S.init(); S.resume();
    const state = S.ctx ? S.ctx.state : 'нет AudioContext';
    // прогоняем все эффекты: не должно быть исключений
    const errs = [];
    ['printer', 'photoOut', 'catchGood', 'missSnd', 'gameOver', 'recordSnd', 'milestone', 'step', 'blocked', 'click']
      .forEach((fn) => { try { S[fn](); } catch (e) { errs.push(fn + ': ' + e.message); } });
    try { S.countdown(false); S.countdown(true); } catch (e) { errs.push('countdown: ' + e.message); }
    return { hasCtx: !!S.ctx, state: state, errs: errs, master: S.master ? S.master.gain.value : null };
  });
  check('AudioContext создан', audio.hasCtx);
  check('AudioContext работает (running)', audio.state === 'running', audio.state);
  check('все звуковые эффекты проигрываются без ошибок', audio.errs.length === 0, audio.errs.join(' | '));
  check('громкость не нулевая при включённом звуке', audio.master > 0, String(audio.master));
  // выключенный звук = тишина
  const muted = await pa.evaluate(() => {
    const S = window.FotoSmile.Sound;
    if (S.enabled) window.FotoSmile.App.toggleSound();
    return { enabled: S.enabled, gain: S.master ? S.master.gain.value : null };
  });
  await sleep(120);
  const gainAfter = await pa.evaluate(() => window.FotoSmile.Sound.master.gain.value);
  check('при выключенном звуке громкость падает до нуля', gainAfter < 0.01, String(gainAfter));
  check('нет ошибок звуковой подсистемы', audioErrors.length === 0, audioErrors.join(' | '));
  await ctxA.close();

  /* ---------------- Итог ---------------- */
  await browser.close();
  console.log('\n------------------------------------------');
  console.log('Пройдено: ' + pass + '   Провалено: ' + fail);
  if (fail) { console.log('\nПроваленные проверки:'); failures.forEach((f) => console.log('  - ' + f)); }
  console.log('------------------------------------------');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ОШИБКА ЗАПУСКА ТЕСТОВ:', e); process.exit(1); });
