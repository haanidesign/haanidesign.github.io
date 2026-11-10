/* 🔍 画面の パーツの 大きさ。
   上の バー・左の 道具・下の タイムライン・設定の 画面・骨の 帯 を それぞれ 大きく／小さく する。
   ぜんぶ まとめての 大きさ も ある（かけ算で きく）。
   この 端末だけの 好み なので 作品には しまわない（localStorage）。 */
const KEY = 'sougou-kobo.ui';
export const UI_PARTS = [
  ['all', 'ぜんぶ'], ['top', '上の バー'], ['tools', '左の 道具'], ['list', 'タイムライン'],
  ['sheet', '設定の 画面'], ['hone', '骨の 帯']
];
let cur = {};
try{ cur = JSON.parse(localStorage.getItem(KEY)) || {}; }catch(_){ cur = {}; }

export const uiScale = (k) => (cur[k] > 0 ? cur[k] : 1);

export function applyUI(){
  const r = document.documentElement.style;
  UI_PARTS.forEach(([k]) => r.setProperty('--z-' + k, String(uiScale(k))));
}
export function setUI(k, v){
  cur[k] = Math.max(0.5, Math.min(1.5, v));
  try{ localStorage.setItem(KEY, JSON.stringify(cur)); }catch(_){}
  applyUI();
}
export function resetUI(){
  cur = {};
  try{ localStorage.removeItem(KEY); }catch(_){}
  applyUI();
}
applyUI();
