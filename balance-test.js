/* =====================================================================
   Баланс и честность игры: виртуальный игрок с задержкой реакции.
   Проверяем, что на любой сложности смена остаётся проходимой,
   и что «невозможных» комбинаций принтеров не возникает.

   Запуск:  node tests/balance-test.js
   ===================================================================== */
'use strict';

const { FS, Game, App, I, els, frames, localStorageMock } = require('./harness.js');

function freshGame() {
  localStorageMock.setItem('fotosmile.record.v1', '0');
  Game.best = 0;
  els.startBtn.dispatch('click');
  frames(2.2);                    // отсчёт
  I.resetRound();
  Game.state = 'playing';
  Game.best = 0;
}

/* Внутриигровая симуляция: dt фиксированный, ввод с задержкой реакции.
   Политика игрока: целиться в самое «срочное» фото (ближайшее к центру),
   переключаться с задержкой reactionMs от момента, когда фото стало видно
   (то есть после выхода из принтера). */
function simulate(reactionMs, minutes, startScore) {
  freshGame();
  Game.score = startScore;
  Game.lives = 3;

  const dt = 1 / 60;
  const steps = Math.round((minutes * 60) / dt);
  let switchAt = -1, targetPose = null;
  let switches = 0, blockedTries = 0;

  for (let s = 0; s < steps; s++) {
    if (Game.state !== 'playing') break;

    // выбор цели: самое срочное фото (ближайшее к центру)
    let best = null, bestD = Infinity;
    for (let i = 0; i < Game.photos.length; i++) {
      const p = Game.photos[i];
      if (p.phase !== 'fly' && p.phase !== 'stall') continue;
      const d = Math.hypot(p.x - FS.W / 2, p.y - FS.H / 2);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      if (best.pose !== Game.pose && (switchAt < 0 || best.pose !== targetPose)) {
        targetPose = best.pose;
        // реакция отсчитывается от выхода фото из принтера (для stall — сразу)
        const alreadyFlying = best.phase !== 'spawn';
        switchAt = Game.time + (alreadyFlying ? Math.max(0, reactionMs - 120) / 1000 : reactionMs / 1000);
      } else if (switchAt < 0) {
        targetPose = best.pose;
        switchAt = Game.time + reactionMs / 1000;
      }
    }
    if (targetPose && Game.time >= switchAt) {
      const ok = I.setPose(targetPose, false);
      if (!ok && targetPose !== Game.pose) blockedTries++;
      switchAt = -1;
      targetPose = null;
      switches++;
    }

    I.gameUpdate(dt);
  }

  return {
    minutes: minutes,
    score: Game.score - startScore,
    missed: Game.stats.missed,
    lived: Game.lives,
    state: Game.state,
    switches: switches,
    blockedTries: blockedTries,
    maxStreak: Game.maxStreak
  };
}

let ok = 0, bad = 0;
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  \u2713 ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { bad++; console.log('  \u2717 ' + name + '  [' + extra + ']'); }
}

console.log('=== Честность и баланс сложности ===\n');
console.log('Игрок без задержки (идеальные рефлексы):');
const perfect = simulate(0, 5, 0);
console.log('   ' + JSON.stringify(perfect));
check('идеальный игрок не промахивается вообще (0-10 очков)', perfect.missed === 0, 'промахов: ' + perfect.missed);
check('идеальный игрок проходит смену без потерь', perfect.state === 'playing', perfect.state);
check('за 5 минут набрано > 90 очков', perfect.score > 90, 'очков: ' + perfect.score);

console.log('\nБыстрый человек (реакция 150 мс):');
[0, 30, 60, 100, 130].forEach((startScore) => {
  const r = simulate(150, 2, startScore);
  console.log('   старт ' + String(startScore).padStart(3) + ' → ' + JSON.stringify(r));
});

console.log('\nСредний человек (реакция 250 мс):');
[0, 60, 130].forEach((startScore) => {
  const r = simulate(250, 2, startScore);
  console.log('   старт ' + String(startScore).padStart(3) + ' → ' + JSON.stringify(r));
});

console.log('\nМедленный новичок (реакция 420 мс):');
const slow = simulate(420, 1.5, 0);
console.log('   старт   0 → ' + JSON.stringify(slow));
check('на старте даже медленный игрок почти не промахивается', slow.missed <= 1, 'промахов: ' + slow.missed);

const fast60 = simulate(150, 2, 60);
const fast130 = simulate(150, 2, 130);
check('с 60 очков быстрый игрок остаётся в игре (мало промахов)', fast60.missed <= 2, 'промахов: ' + fast60.missed);
check('на максимальной сложности игра сложна, но проходима', fast130.missed <= 4, 'промахов: ' + fast130.missed);

console.log('\n=== Проверка «заведомо невозможных» ситуаций ===');
freshGame();
Game.score = 300;
Game.lives = 9999;
let blockedEvents = 0;
let simultaneous = 0;
const dt = 1 / 60;
let maxActive = 0;
let minSwitchWindow = Infinity;
// имитируем мгновенного игрока и считаем интервалы между требованиями переключиться
let lastDemandTime = -Infinity;
for (let s = 0; s < 60 * 5 * 60; s++) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < Game.photos.length; i++) {
    const p = Game.photos[i];
    if (p.phase !== 'fly' && p.phase !== 'stall') continue;
    const d = Math.hypot(p.x - FS.W / 2, p.y - FS.H / 2);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) {
    if (best.pose !== Game.pose) {
      const attempt = I.setPose(best.pose, false);
      if (!attempt) blockedEvents++;
      if (Game.time - lastDemandTime < minSwitchWindow) minSwitchWindow = Game.time - lastDemandTime;
      lastDemandTime = Game.time;
    }
  }
  I.gameUpdate(dt);
  if (Game.photos.length > maxActive) maxActive = Game.photos.length;
  if (Game.photos.length >= 2) simultaneous++;
}
console.log('  мгновенный игрок на 300 очках: заблокированных переключений = ' + blockedEvents +
  ', максимум одновременных фото = ' + maxActive +
  ', минимальный интервал между переключениями = ' + minSwitchWindow.toFixed(2) + ' с');
check('на максимальной сложности ни одно переключение не заблокировано', blockedEvents === 0, String(blockedEvents));
check('одновременных фото не больше 4', maxActive <= 4, String(maxActive));
check('на максимальной сложности несколько принтеров печатают одновременно (>=3 в воздухе)',
  maxActive >= 3, 'максимум одновременно: ' + maxActive);
check('минимальный интервал между переключениями >= 0.20 с (реально успеть)', minSwitchWindow >= 0.2,
  minSwitchWindow.toFixed(2) + ' с');

console.log('\n------------------------------------------');
console.log('Пройдено: ' + ok + '   Провалено: ' + bad);
process.exit(bad ? 1 : 0);
