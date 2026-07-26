/* main.js — 启动引导 */
(function () {
  function start() {
    XQ.game.init();
    // 首次交互解锁 Web Audio
    var unlock = function () {
      XQ.Audio.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
