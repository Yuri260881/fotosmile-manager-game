/* =====================================================================
   Сборка одностраничной версии игры.
   Собирает index.html + style.css + game.js в один файл
   fotosmile-standalone.html — его можно открыть двойным щелчком,
   отправить по почте или положить на любой хостинг одним файлом.

   Запуск:  node build.js
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');

let out = html
  .replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
  .replace('<script src="game.js"></script>', '<script>\n' + js + '\n</script>');

out = out.replace('<title>', '<!-- Автосборка build.js: единый файл, зависимостей нет -->\n<title>');

const target = path.join(dir, 'fotosmile-standalone.html');
fs.writeFileSync(target, out);

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log('Готово: fotosmile-standalone.html (' + kb + ' КБ) — один файл, работает офлайн.');
