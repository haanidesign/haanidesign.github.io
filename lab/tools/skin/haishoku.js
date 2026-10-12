/* 配色の 見本帳（動く背景・動画工房で つかう）
   ひとつ = [名前, なかま, 背景3色(上・下・まんなか), かざり3色, 文字の色, 文字のふち] */
const RAW = [
  // かわいい
  ['ゆめかわ', 'かわいい', '#ffd6ec', '#c9d8ff', '#fff4fb', '#ffffff', '#ff9ccf', '#a9c8ff', '#ffffff', '#ff7fbf'],
  ['いちごミルク', 'かわいい', '#ffe3ea', '#ffc2d1', '#fff7f9', '#ffffff', '#ff6f91', '#ffd166', '#ff5c8a', '#ffffff'],
  ['ラムネ', 'かわいい', '#bdf0ff', '#e6fbff', '#ffffff', '#ffffff', '#5ccfff', '#b8f2c9', '#1f9fd6', '#ffffff'],
  ['マカロン', 'かわいい', '#ffe9d6', '#e2f0cb', '#fdf6ec', '#ffb5a7', '#b5ead7', '#c7ceea', '#7a5c61', '#ffffff'],
  ['ラベンダー', 'かわいい', '#e6dcff', '#fbe4ff', '#ffffff', '#ffffff', '#b79cff', '#ffb3e6', '#7b5cd6', '#ffffff'],
  ['クリームソーダ', 'かわいい', '#c8f5d8', '#fff8dc', '#ffffff', '#ffffff', '#ff5c7a', '#56d68a', '#ffffff', '#2fae68'],
  // ネオン
  ['サイバー', 'ネオン', '#0a0a1f', '#2a0f4f', '#14143a', '#3bd9ff', '#ff3bd4', '#a66bff', '#ffffff', '#ff3bd4'],
  ['ヴェイパー', 'ネオン', '#241443', '#ff6fd8', '#4a2a7a', '#5be7ff', '#ff6fd8', '#fff0fb', '#fff0fb', '#5b2a9e'],
  ['シンセ80s', 'ネオン', '#140a33', '#ff2d95', '#3a1466', '#00f0ff', '#ff2d95', '#ffe14d', '#ffe14d', '#ff2d95'],
  ['アシッド', 'ネオン', '#0d0d0d', '#1f2b00', '#111111', '#c8ff00', '#00ff85', '#ff00c8', '#c8ff00', '#0d0d0d'],
  ['夜の街', 'ネオン', '#05060f', '#1a1240', '#0c0c22', '#ffd23f', '#ff4f6d', '#4fd1ff', '#ffffff', '#ff4f6d'],
  // レトロ
  ['昭和レトロ', 'レトロ', '#f4e4c1', '#e8b86d', '#f9efd9', '#e2543d', '#2f7e79', '#f2b134', '#e2543d', '#fff6e0'],
  ['喫茶店', 'レトロ', '#3b2418', '#7a4a2a', '#5a3522', '#f2d0a4', '#c8553d', '#e9c46a', '#f8e6c8', '#3b2418'],
  ['70s', 'レトロ', '#f6d6a8', '#e07a3f', '#f3c38b', '#d1495b', '#edae49', '#00798c', '#fff3dc', '#8a3b12'],
  ['ゲームボーイ', 'レトロ', '#0f380f', '#306230', '#1d4d1d', '#8bac0f', '#9bbc0f', '#c4dc6a', '#9bbc0f', '#0f380f'],
  ['ポップアート', 'レトロ', '#ffe500', '#ff4f9a', '#ffffff', '#00b3ff', '#ff3b30', '#111111', '#ffffff', '#111111'],
  // 和
  ['桜', '和', '#fbe2e8', '#fff5f7', '#ffffff', '#f4a6bd', '#ffffff', '#e8798f', '#d0476a', '#ffffff'],
  ['藍と金', '和', '#0d1b3e', '#24386b', '#16264f', '#e8c25a', '#ffffff', '#7c9ad6', '#f4dc8a', '#0d1b3e'],
  ['墨と朱', '和', '#f4efe3', '#ded6c4', '#fbf8f0', '#c0392b', '#16110d', '#c9a96a', '#16110d', '#f4efe3'],
  ['抹茶', '和', '#dfe8c8', '#a9bf7c', '#eef3df', '#5d7a32', '#f2e6c9', '#c97b84', '#3d5221', '#ffffff'],
  ['紅葉', '和', '#5a1f12', '#c2491d', '#8a2f16', '#ffb03b', '#e2543d', '#ffe3a3', '#fff1d6', '#5a1f12'],
  // 季節
  ['夏の空', '季節', '#3fa7ff', '#bfe6ff', '#86c9ff', '#ffffff', '#ffe066', '#ff7b54', '#ffffff', '#1f6fd6'],
  ['海辺', '季節', '#0f4c6b', '#43c6db', '#1f87a8', '#ffffff', '#ffe7a8', '#7ae0c3', '#ffffff', '#0f4c6b'],
  ['ゆうやけ', '季節', '#4a1b35', '#ff9a52', '#c2405a', '#ffc93c', '#ff7a45', '#ffffff', '#fff3e6', '#4a1b35'],
  ['ハロウィン', '季節', '#1a0f2e', '#4b1f6f', '#2b1747', '#ff8a1e', '#b8ff3b', '#ffffff', '#ff8a1e', '#1a0f2e'],
  ['クリスマス', '季節', '#0f3d2e', '#b3122e', '#145a43', '#ffffff', '#ffd23f', '#ff4f4f', '#ffffff', '#b3122e'],
  ['雪の夜', '季節', '#0e1a33', '#3a5683', '#1e3256', '#ffffff', '#cfe3ff', '#fff4c9', '#ffffff', '#0e1a33'],
  // しっとり
  ['くすみ', 'しっとり', '#e9e1d8', '#c9b8a8', '#f4efe9', '#a3867a', '#8aa29e', '#e3c5b5', '#5b4a42', '#ffffff'],
  ['ミルクティー', 'しっとり', '#f3e5d0', '#d9b99b', '#faf3e8', '#ffffff', '#b08463', '#f7d9c4', '#6e4b33', '#ffffff'],
  ['北欧', 'しっとり', '#f5f1e8', '#d6e2e0', '#ffffff', '#e8a87c', '#5f8f8b', '#f2d07a', '#2f3e46', '#ffffff'],
  ['夜カフェ', 'しっとり', '#1c1b22', '#3b3542', '#2a2731', '#e9c46a', '#d8a7b1', '#ffffff', '#f6efe0', '#1c1b22'],
  ['モノクロ', 'しっとり', '#161616', '#3a3a3a', '#262626', '#ffffff', '#b0b0b0', '#707070', '#ffffff', '#111111'],
  // ドラマチック
  ['宇宙', 'ドラマ', '#05030f', '#2a1a5e', '#120a33', '#ffffff', '#9ec5ff', '#ffb8f2', '#ffffff', '#3a2a8a'],
  ['炎', 'ドラマ', '#1a0400', '#ff3d00', '#7a1500', '#ffd23f', '#ff6a00', '#ffffff', '#fff1b5', '#a01800'],
  ['金と黒', 'ドラマ', '#0f0c06', '#3a2c12', '#1d160a', '#e8c25a', '#fff6dc', '#b8862b', '#f4dc8a', '#0f0c06'],
  ['深海', 'ドラマ', '#02080f', '#0b2b47', '#04121f', '#2fe0c8', '#5b8cff', '#e8f6ff', '#e8f6ff', '#0b2b47'],
  ['ホラー', 'ドラマ', '#0a0505', '#3d0a0a', '#1a0707', '#ff2a2a', '#ffffff', '#7a0000', '#ffffff', '#8a0000'],
];

export const HAISHOKU = RAW.map(r => ({
  name: r[0], cat: r[1], bg: r.slice(2, 5), acc: r.slice(5, 8), text: r[8], stroke: r[9],
}));
export const HAISHOKU_CATS = [...new Set(RAW.map(r => r[1]))];

let lastCat = HAISHOKU_CATS[0];  // 作りなおしても 同じ なかまを 出す

/* 見本帳の 部品。えらぶと onPick(配色) */
export function haishokuPicker(onPick) {
  if (!document.getElementById('hs-css')) {
    const st = document.createElement('style'); st.id = 'hs-css';
    st.textContent = `
.hs-cats{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.hs-cat{appearance:none;font:inherit;font-size:.85rem;font-weight:700;padding:.15rem .7rem;border:2px solid #1E1C14;border-radius:100px;background:#FFFEF7;color:#1E1C14;cursor:pointer}
.hs-cat:hover,.hs-cat.on{background:#E1DD60}
.hs-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;margin:6px 0}
.hs-p{appearance:none;font:inherit;display:block;text-align:left;padding:0;border:2.5px solid #1E1C14;border-radius:10px;background:#FFFEF7;color:#1E1C14;cursor:pointer;overflow:hidden}
.hs-p:hover{outline:3px solid #E1DD60}
.hs-sw{display:flex;height:30px}.hs-sw i{flex:1}
.hs-p b{display:block;font-size:.85rem;font-weight:700;padding:3px 8px;border-top:2px solid #1E1C14}`;
    document.head.append(st);
  }
  const box = document.createElement('div');
  const cats = document.createElement('div'); cats.className = 'hs-cats';
  const list = document.createElement('div'); list.className = 'hs-list';
  let cur = lastCat;
  const draw = () => {
    cats.innerHTML = ''; list.innerHTML = '';
    for (const c of HAISHOKU_CATS) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'hs-cat' + (c === cur ? ' on' : ''); b.textContent = c;
      b.onclick = () => { cur = lastCat = c; draw(); }; cats.append(b);
    }
    for (const p of HAISHOKU.filter(p => p.cat === cur)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'hs-p'; b.title = p.name;
      b.innerHTML = '<span class="hs-sw">' + [...p.bg.slice(0, 2), ...p.acc].map(c => `<i style="background:${c}"></i>`).join('') +
        `</span><b>${p.name}</b>`;
      b.onclick = () => onPick(p); list.append(b);
    }
  };
  draw(); box.append(cats, list);
  return box;
}
