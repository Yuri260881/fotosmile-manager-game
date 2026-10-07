/* =====================================================================
   Автотесты «Менеджер Фотосмайл» без браузера.
   Запуск:  node tests/headless-test.js
   ===================================================================== */
'use strict';

const harness = require('./harness.js');
const { FS, Game, App, UI, Sound, Store, I, W_, H_, CXv, CYv, POSE_ANG, els, tbtns, frames, keydown, localStorageMock } = harness;
/* ------------------------------------------------------------------
   Мини-фреймворк проверок
   ------------------------------------------------------------------ */
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else {
    fail++;
    failures.push(name + (extra ? ' — ' + extra : ''));
    console.log('  \u2717 ' + name + (extra ? '  (' + extra + ')' : ''));
  }
}
function section(title) { console.log('\n=== ' + title + ' ==='); }

/* ==================================================================
   1. СТАРТОВЫЙ ЭКРАН И РЕКОРД
   ================================================================== */
section('1. Загрузка, стартовый экран, рекорд');
check('игра в состоянии menu', Game.state === 'menu', Game.state);
check('стартовый экран показан', els.startScreen.classList.contains('is-active'));
check('HUD скрыт в меню', els.hud.classList.contains('is-hidden'));
check('рекорд прочитан из localStorage (0)', Game.best === 0 && els.recordValue.textContent === '0', els.recordValue.textContent);
check('сохранённый рекорд читается', (function () {
  localStorageMock.setItem('fotosmile.record.v1', '156');
  return Store.read() === 156;
})(), String(Store.read()));

/* ==================================================================
   2. ОТСЧЁТ И СТАРТ
   ================================================================== */
section('2. Кнопка «НАЧАТЬ СМЕНУ» и отсчёт 3-2-1');
els.startBtn.dispatch('click');
check('состояние countdown', Game.state === 'countdown', Game.state);
check('HUD стал видимым', !els.hud.classList.contains('is-hidden'));
check('стартовый экран скрыт', !els.startScreen.classList.contains('is-active'));
check('счёт сброшен на 0', Game.score === 0);
check('жизней 3', Game.lives === 3);
check('оверлей отсчёта активен', els.overlayScreen.classList.contains('is-active'));
frames(0.7);
check('идёт отсчёт (значение 2)', Game.countdownValue === 2, String(Game.countdownValue));
frames(1.3);
check('после отсчёта игра идёт', Game.state === 'playing', Game.state);
check('фон поля не тёмный (canvas есть)', els.game.width > 0);

/* ==================================================================
   3. ПРИНТЕРЫ ПЕЧАТАЮТ
   ================================================================== */
section('3. Все четыре принтера');
const spawnedPoses = {};
const savedLives = Game.lives;
Game.lives = 99;                       // чтобы смена не закончилась во время наблюдения
for (let i = 0; i < 120; i++) {
  frames(0.1);
  for (let k = 0; k < Game.photos.length; k++) spawnedPoses[Game.photos[k].pose] = true;
}
Game.lives = savedLives;
const observed = Object.keys(spawnedPoses).length;
check('за 12 секунд принтеры напечатали фотографии сами', observed >= 2, 'позиций: ' + observed);
// принудительно проверим все четыре позиции
FS.POSES.forEach((p) => {
  Game.photos.length = 0;
  const ph = I.spawnPhoto(p);
  const ok = !!ph && ph.pose === p;
  check('принтер ' + p + ' создаёт фотографию', ok);
});


/* ==================================================================
   4. ДВИЖЕНИЕ ФОТОГРАФИИ К ЦЕНТРУ
   ================================================================== */
section('4. Движение фотографии');
Game.photos.length = 0;
Game.score = 0;
Game.pose = 'tl';
const testPh = I.spawnPhoto('tl');
const startDist = Math.hypot(testPh.x - CXv, testPh.y - CYv);
frames(0.35); // спавн внутри принтера
const afterSpawn = testPh.phase;
frames(0.25); // половина полёта
const midDist = Math.hypot(testPh.x - CXv, testPh.y - CYv);
frames(0.25);
const lateDist = Math.hypot(testPh.x - CXv, testPh.y - CYv);
check('фаза «выходит из принтера»', afterSpawn === 'spawn' || afterSpawn === 'fly', afterSpawn);
check('фото приближается к центру', midDist < startDist && lateDist < midDist,
  [startDist | 0, midDist | 0, lateDist | 0].join(' -> '));
check('фаза полёта/последнего шанса', testPh.phase === 'fly' || testPh.phase === 'stall', testPh.phase);
Game.photos.length = 0;

/* ==================================================================
   5. ЛОВЛЯ ФОТОГРАФИЙ
   ================================================================== */
section('5. Ловля фотографий');
const TRAY = FS._internal.trayPoint;
FS.POSES.forEach((pose) => {
  const t = TRAY(pose);
  const a = POSE_ANG[pose];
  const endX = CXv + Math.cos(a) * 118;
  const endY = CYv + Math.sin(a) * 118;
  const d = Math.hypot(endX - t.x, endY - t.y);
  check('фото с ' + pose + ' долетает в зону ловли (d=' + d.toFixed(1) + ' < 66)', d < 66, d.toFixed(1));
});

Game.photos.length = 0;
Game.score = 0;
Game.lives = 3;
let caught = 0;
FS.POSES.forEach((pose) => {
  Game.photos.length = 0;
  Game.pose = pose === 'tl' ? 'br' : 'tl';   // заведомо не та позиция
  const ph = I.spawnPhoto(pose);
  frames(0.3);                                // фото вышло из принтера
  Game.pose = pose;                           // встали правильно
  let guard = 0;
  while (Game.photos.length > 0 && guard++ < 400) frames(0.05);
  if (Game.score > caught) caught = Game.score;
  check('фото с ' + pose + ' поймано', Game.score === caught && Game.score > 0, 'score=' + Game.score);
});

/* ==================================================================
   6. ПРОМАХИ И ЖИЗНИ
   ================================================================== */
section('6. Пропуск фотографии и потеря жизни');
Game.photos.length = 0;
Game.score = 0;
Game.lives = 3;
Game.stats.missed = 0;
const livesBefore = Game.lives;
Game.pose = 'tl';
const missPh = I.spawnPhoto('br');   // летит снизу-справа, менеджер слева-сверху
let guard2 = 0;
while (Game.photos.length > 0 && guard2++ < 400) frames(0.05);
check('жизнь потеряна', Game.lives === livesBefore - 1, Game.lives + ' из ' + livesBefore);
check('промах посчитан', Game.stats.missed === 1, String(Game.stats.missed));
check('здоровье отрисовано (одна жизнь потеряна)', els.lives.innerHTML.indexOf('is-lost') > -1);
check('фото удалено после падения', Game.photos.length === 0);

/* ==================================================================
   7. GAME OVER
   ================================================================== */
section('7. Три ошибки — смена окончена');
Game.lives = 1;
Game.photos.length = 0;
Game.pose = 'tl';
I.spawnPhoto('br');
guard2 = 0;
while (Game.state === 'playing' && guard2++ < 400) frames(0.05);
check('состояние over', Game.state === 'over', Game.state);
check('оверлей результата показан', els.overlayScreen.classList.contains('is-active'));
check('заголовок «Смена окончена!»', els.overlayInner.innerHTML.indexOf('Смена окончена') > -1);
check('показан результат «Обработано фотографий»', els.overlayInner.innerHTML.indexOf('Обработано фотографий') > -1);
check('есть кнопка «ИГРАТЬ СНОВА»', els.overlayInner.innerHTML.indexOf('data-act="again"') > -1);
check('есть кнопка «ГЛАВНОЕ МЕНЮ»', els.overlayInner.innerHTML.indexOf('data-act="menu"') > -1);
check('показан рекорд', els.overlayInner.innerHTML.indexOf('Рекорд') > -1);

/* ==================================================================
   8. ПЕРЕЗАПУСК И ГЛАВНОЕ МЕНЮ
   ================================================================== */
section('8. Кнопки «Играть снова» и «Главное меню»');
const againBtn = els.overlayInner.children.filter((c) => c.getAttribute('data-act') === 'again')[0];
check('кнопка перезапуска найдена', !!againBtn);
if (againBtn) againBtn.dispatch('click');
check('после «Играть снова» — отсчёт', Game.state === 'countdown', Game.state);
check('счёт обнулён', Game.score === 0);
check('жизни восстановлены', Game.lives === 3, String(Game.lives));
frames(2.2);
check('игра снова идёт', Game.state === 'playing', Game.state);

Game.state = 'paused';
UI.showPause();
const menuBtn = els.overlayInner.children.filter((c) => c.getAttribute('data-act') === 'menu')[0];
check('кнопка меню найдена', !!menuBtn);
if (menuBtn) menuBtn.dispatch('click');
check('вернулись в меню', Game.state === 'menu', Game.state);
check('стартовый экран показан', els.startScreen.classList.contains('is-active'));
check('фотографии очищены', Game.photos.length === 0);

/* ==================================================================
   9. ПАУЗА
   ================================================================== */
section('9. Пауза');
els.startBtn.dispatch('click');
frames(2.2);
check('игра идёт', Game.state === 'playing', Game.state);
Game.photos.length = 0;
const pPh = I.spawnPhoto('tl');
frames(0.4);
const posBeforePause = { x: pPh.x, y: pPh.y };
const timeBeforePause = Game.time;
App.togglePause();
check('состояние paused', Game.state === 'paused', Game.state);
check('оверлей паузы', els.overlayInner.innerHTML.indexOf('Пауза') > -1);
frames(2);
check('фото не двигается на паузе', pPh.x === posBeforePause.x && pPh.y === posBeforePause.y);
check('игровое время стоит', Game.time === timeBeforePause);
App.togglePause();
check('пауза снята', Game.state === 'playing', Game.state);
frames(0.3);
check('после паузы фото снова двигается', pPh.x !== posBeforePause.x || pPh.y !== posBeforePause.y);
check('нет рывка времени (dt ограничен)', Game.time - timeBeforePause < 1.5, (Game.time - timeBeforePause).toFixed(2));

/* ==================================================================
   10. СЛОЖНОСТЬ
   ================================================================== */
section('10. Рост сложности');
const D = FS.Difficulty;
const c0 = D.cfg(0), c10 = D.cfg(10), c25 = D.cfg(25), c50 = D.cfg(50),
  c80 = D.cfg(80), c120 = D.cfg(120), c300 = D.cfg(300);
check('скорость растёт монотонно',
  c0.photoSpeed < c10.photoSpeed && c10.photoSpeed < c25.photoSpeed && c25.photoSpeed < c50.photoSpeed &&
  c50.photoSpeed < c80.photoSpeed && c80.photoSpeed < c120.photoSpeed);
check('интервал уменьшается', c0.intervalMin > c50.intervalMin && c50.intervalMin > c120.intervalMin);
check('предупреждение принтера сокращается', c0.warningMax > c50.warningMax && c50.warningMax > c120.warningMax);
check('макс. активных фото растёт', c0.maxActivePhotos === 1 && c120.maxActivePhotos >= 4 && c0.maxActivePhotos <= c120.maxActivePhotos,
  [c0.maxActivePhotos, c25.maxActivePhotos, c50.maxActivePhotos, c80.maxActivePhotos, c120.maxActivePhotos].join(','));
check('скорость ограничена сверху (<=700)', c300.photoSpeed <= 700, String(c300.photoSpeed));
check('интервал ограничен снизу (>=0.27)', c300.intervalMin >= 0.269, String(c300.intervalMin));
check('старт спокойный (скорость < 200)', c0.photoSpeed < 200, String(c0.photoSpeed));
check('на 120+ действительно быстро (скорость > 640)', c120.photoSpeed > 640, String(c120.photoSpeed));
check('t растёт от 0 к 1', c0.t === 0 && c300.t > 0.99, c0.t + ' / ' + c300.t);

/* ==================================================================
   11. ЧЕСТНОСТЬ: НЕВОЗМОЖНЫХ СИТУАЦИЙ НЕТ
   ================================================================== */
section('11. Честность спавна');
Game.state = 'playing';
Game.score = 150;
Game.photos.length = 0;
// фото близко к центру => новые не спавнятся
const near = I.spawnPhoto('tl');
near.phase = 'fly';
near.x = CXv + 60; near.y = CYv + 60;
check('спавн заблокирован, пока фото у центра', I.spawningLocked() === true);
near.x = 40; near.y = 40;
check('спавн свободен, когда фото далеко', I.spawningLocked() === false);
Game.photos.length = 0;

// проверяем, что при максимальной сложности интервал >= времени прохода зоны блокировки
let minGap = Infinity;
for (let i = 0; i < 200; i++) {
  const c = D.cfg(300);
  minGap = Math.min(minGap, c.intervalMin);
}
const speedMax = D.cfg(300).photoSpeed;
const blockTime = 150 / speedMax;                  // время прохода запретной зоны
check('минимальный интервал > времени запретной зоны', minGap > blockTime,
  minGap.toFixed(2) + ' > ' + blockTime.toFixed(2));

/* ==================================================================
   12. ЗВУК
   ================================================================== */
section('12. Звук и кнопка 🔇');
const soundBefore = Sound.enabled;
App.toggleSound();
check('звук переключается', Sound.enabled !== soundBefore, String(Sound.enabled));
check('настройка звука сохраняется', Store.readSound() === Sound.enabled);
check('иконка звука обновилась (SVG)', els.soundIcon.innerHTML.indexOf('<svg') === 0 && els.soundIcon.innerHTML.indexOf('stroke') > -1,
  els.soundIcon.innerHTML.slice(0, 40));
App.toggleSound();
check('звук вернулся', Sound.enabled === soundBefore);
check('звук не падает без AudioContext (Web Audio опционален)', Sound.ctx === null || Sound.ctx);
Sound.init();
check('Sound.init без AudioContext не бросает ошибку', true);

/* ==================================================================
   13. УПРАВЛЕНИЕ: КЛАВИАТУРА
   ================================================================== */
section('13. Клавиатура: стрелки, WASD, NumPad');
Game.state = 'playing';
Game.photos.length = 0;
Game.pose = 'tl';
keydown('ArrowUp');    check('ArrowUp -> tl', Game.pose === 'tl', Game.pose);
keydown('ArrowRight'); check('ArrowRight -> tr', Game.pose === 'tr', Game.pose);
keydown('ArrowDown');  check('ArrowDown -> bl', Game.pose === 'bl', Game.pose);
keydown('KeyD');       check('D -> tr', Game.pose === 'tr', Game.pose);
keydown('KeyA');       check('A -> tl', Game.pose === 'tl', Game.pose);
keydown('KeyS');       check('S -> bl', Game.pose === 'bl', Game.pose);
keydown('KeyW');       check('W -> tl', Game.pose === 'tl', Game.pose);
keydown('Numpad7');    check('NumPad7 -> tl', Game.pose === 'tl', Game.pose);
keydown('Numpad9');    check('NumPad9 -> tr', Game.pose === 'tr', Game.pose);
keydown('Numpad1');    check('NumPad1 -> bl', Game.pose === 'bl', Game.pose);
keydown('Numpad3');    check('NumPad3 -> br', Game.pose === 'br', Game.pose);
keydown('KeyP');       check('P ставит паузу', Game.state === 'paused', Game.state);
keydown('KeyP');       check('P снимает паузу', Game.state === 'playing', Game.state);
keydown('Escape');     check('Esc ставит паузу', Game.state === 'paused', Game.state);
keydown('Escape');     check('Esc снимает паузу', Game.state === 'playing', Game.state);

/* ==================================================================
   14. УПРАВЛЕНИЕ: ТАЧ
   ================================================================== */
section('14. Сенсорные кнопки и свайпы');
Game.state = 'playing';
Game.photos.length = 0;
tbtns[0].dispatch('pointerdown', { pointerId: 1 });
check('тач-кнопка ↖ -> tl', Game.pose === 'tl', Game.pose);
tbtns[3].dispatch('pointerdown', { pointerId: 2 });
check('тач-кнопка ↘ -> br', Game.pose === 'br', Game.pose);
tbtns[1].dispatch('pointerdown', { pointerId: 3 });
check('тач-кнопка ↗ -> tr', Game.pose === 'tr', Game.pose);
tbtns[2].dispatch('pointerdown', { pointerId: 4 });
check('тач-кнопка ↙ -> bl', Game.pose === 'bl', Game.pose);
// свайп по полю
els.board.dispatch('pointerdown', { clientX: 400, clientY: 300, pointerId: 9 });
els.board.dispatch('pointerup', { clientX: 400, clientY: 120, pointerId: 9 });
check('свайп вверх -> tl', Game.pose === 'tl', Game.pose);
els.board.dispatch('pointerdown', { clientX: 400, clientY: 300, pointerId: 9 });
els.board.dispatch('pointerup', { clientX: 600, clientY: 300, pointerId: 9 });
check('свайп вправо -> tr', Game.pose === 'tr', Game.pose);
els.board.dispatch('pointerdown', { clientX: 400, clientY: 300, pointerId: 9 });
els.board.dispatch('pointerup', { clientX: 400, clientY: 500, pointerId: 9 });
check('свайп вниз -> bl', Game.pose === 'bl', Game.pose);
els.board.dispatch('pointerdown', { clientX: 400, clientY: 300, pointerId: 9 });
els.board.dispatch('pointerup', { clientX: 200, clientY: 300, pointerId: 9 });
check('свайп влево -> tl', Game.pose === 'tl', Game.pose);
// тап по четверти поля
els.board.dispatch('pointerdown', { clientX: 700, clientY: 500, pointerId: 11 });
els.board.dispatch('pointerup', { clientX: 700, clientY: 500, pointerId: 11 });
check('тап в правую нижнюю четверть -> br', Game.pose === 'br', Game.pose);
els.board.dispatch('pointerdown', { clientX: 200, clientY: 200, pointerId: 12 });
els.board.dispatch('pointerup', { clientX: 200, clientY: 200, pointerId: 12 });
check('тап в левую верхнюю четверть -> tl', Game.pose === 'tl', Game.pose);

/* ==================================================================
   15. ОЧКИ, ПАСХАЛКИ, РЕКОРД
   ================================================================== */
section('15. Очки, рубежи, рекорд, пасхалки');
localStorageMock.setItem('fotosmile.record.v1', '5');
Game.best = 5;
Game.prevBest = 5;
Game.recordBroken = false;
Game.score = 0;
Game.streak = 0;
Game.perfectShown = false;
Game.crownShown = false;
Game.milestonesShown = {};
Game.photos.length = 0;
Game.pose = 'tl';

// 1 очко за фотографию
const ph1 = I.spawnPhoto('tl');
ph1.phase = 'fly'; ph1.progress = 0.95;
ph1.x = CXv - 60; ph1.y = CYv - 60;
I.checkCatch();
check('+1 очко за пойманное фото', Game.score === 1, String(Game.score));
check('счёт в интерфейсе обновлён', els.scoreValue.textContent === '1', els.scoreValue.textContent);

// рост до 26 очков: рубеж «час пик»
for (let i = 0; i < 25; i++) {
  const ph = I.spawnPhoto('tl');
  ph.phase = 'fly'; ph.progress = 0.95;
  ph.x = CXv - 60; ph.y = CYv - 60;
  Game.pose = 'tl';
  I.checkCatch();
}
check('счёт вырос до 26', Game.score === 26, String(Game.score));
check('рубеж 25 очков сработал', Game.milestonesShown[25] === true);
check('новый рекорд зафиксирован', Game.best === 26, String(Game.best));
check('рекорд сохранён в localStorage', Store.read() === 26, String(Store.read()));
check('сообщение о новом рекорде показано', els.recordToast.classList.contains('is-show'));

// серия без ошибок: 50 и 100
Game.streak = 49;
const phS = I.spawnPhoto('tl');
phS.phase = 'fly'; phS.x = CXv - 60; phS.y = CYv - 60; phS.progress = 1;
Game.pose = 'tl';
I.checkCatch();
check('пасхалка «Идеальная смена!» на 50 подряд', Game.perfectShown === true && Game.starT > 0);
Game.streak = 99;
const phC = I.spawnPhoto('tl');
phC.phase = 'fly'; phC.x = CXv - 60; phC.y = CYv - 60; phC.progress = 1;
Game.pose = 'tl';
I.checkCatch();
check('пасхалка «корона» на 100 подряд', Game.crownShown === true && Game.crownT > 0);
check('лучшая серия записана', Game.maxStreak >= 100, String(Game.maxStreak));

Game.photos.length = 0;
Game.score = 0;
Game.streak = 0;
Game.perfectShown = false;   // заново
const phMiss = I.spawnPhoto('br');
phMiss.phase = 'fly'; phMiss.x = CXv + 60; phMiss.y = CYv + 60; phMiss.progress = 1;
Game.pose = 'tl';
I.onMiss(phMiss);
check('серия сбрасывается при промахе', Game.streak === 0);
check('«Идеальная смена» можно получить заново', Game.perfectShown === false);

/* ==================================================================
   16. ПРОИЗВОДИТЕЛЬНОСТЬ / УТЕЧКИ
   ================================================================== */
section('16. Отсутствие утечек и стабильность');
Game.state = 'playing';
Game.score = 90;
Game.lives = 999;
Game.photos.length = 0;
Game.effects.length = 0;
const t0 = Date.now();
frames(60);          // 60 секунд игры
const elapsed = Date.now() - t0;
check('фотографий не накапливается (>6)', Game.photos.length <= 6, String(Game.photos.length));
check('эффектов не накапливается (>60)', Game.effects.length <= 60, String(Game.effects.length));
check('время симуляции 60 сек отработало быстро (<8 сек)', elapsed < 8000, elapsed + ' мс');
check('счёт вырос в динамичной игре', Game.score > 90, String(Game.score));
const listeners = 0;
check('обработчики не добавляются каждый кадр (rAF-очередь не растёт)', harness.rafQueue().length <= 1, String(harness.rafQueue().length));

/* ==================================================================
   17. МЕНЮ / ПЕРЕЗАПУСК БЕЗ ПЕРЕЗАГРУЗКИ СТРАНИЦЫ
   ================================================================== */
section('17. Меню и повторные запуски');
App.toMenu();
check('меню', Game.state === 'menu');
els.startBtn.dispatch('click');
frames(2.2);
check('повторный запуск работает', Game.state === 'playing', Game.state);
for (let i = 0; i < 3; i++) {
  if (Game.state === 'playing') {
    Game.lives = 1; Game.photos.length = 0; Game.pose = 'tl';
    const p = I.spawnPhoto('br');
    p.phase = 'fly'; p.x = CXv + 60; p.y = CYv + 60; p.progress = 1;
    I.onMiss(p);
  }
}
check('game over после 3 промахов', Game.state === 'over', Game.state);
App.startCountdown();
frames(2.2);
check('ещё один перезапуск из экрана результата', Game.state === 'playing', Game.state);
check('счёт снова 0', Game.score === 0, String(Game.score));

/* ==================================================================
   ИТОГ
   ================================================================== */
console.log('\n------------------------------------------');
console.log('Пройдено: ' + pass + '   Провалено: ' + fail);
if (fail) {
  console.log('\nПроваленные проверки:');
  failures.forEach((f) => console.log('  - ' + f));
}
console.log('------------------------------------------');
process.exit(fail ? 1 : 0);
