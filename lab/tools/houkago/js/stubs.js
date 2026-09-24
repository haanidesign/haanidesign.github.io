/* dev only: fills gaps while art/audio/data are incomplete */
(function () {
  if (!window.SND) window.SND = { init() {}, se() {}, bgm() {}, stopBgm() {}, setVolume() {} };
  const A = window.ART = window.ART || {};
  if (!A.bg) A.bg = (c, id) => { c.fillStyle = '#bfe6ff'; c.fillRect(0, 0, 640, 360); c.fillStyle = '#2b2d5c'; c.font = '16px monospace'; c.fillText(id, 10, 20); };
  if (!A.chibiFrames) A.chibiFrames = {};
  if (!window.DATA) window.DATA = {};
})();
