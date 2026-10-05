# はぁにデザイン（HAANI UI）

新しくツールやページを作るときは「**はぁにデザインで**」と言えばこれ。
Claude Code にはこのファイルのパスを渡せば伝わる → `C:/ai/haanidesign.github.io/DESIGN.md`

実物のお手本: サイトのトップ `index.html` と `site.css`（2026-10 版）。迷ったらこれを見る。

## ひとことで言うと

**生成りの紙にドットを敷いて、黒い太縁で囲んで、黄色を差す。影も押し込みもなし。文字は大きく読みやすく。**
文房具っぽい・角が丸い・平ら。飾りより「読める」を優先する。

## トークン（そのまま貼る）

```css
:root{
  --main:      #E1DD60;   /* メインの黄色。ナビ・ヒーロー・強調 */
  --main-deep: #B8B43F;   /* 濃いめ。hover・リンクの下線 */
  --main-soft: #F2F0BE;   /* 淡い。行のhover・入力中の欄 */
  --cream:     #FBFAEC;   /* 下地 */
  --paper:     #FFFEF7;   /* いちばん明るい面（カード・入力欄） */
  --ink:       #1E1C14;   /* 黒。縁と文字 */
  --ink-2:     #4F4A3B;   /* 本文の説明文 */
  --gray:      #6E6857;   /* 小さい注記・日付（これより薄くしない） */
  --pink:      #F2A0B8;   /* 差し色。バッジ・注意・第2状態 */
  --rule:      rgba(30,28,20,.22);  /* 点線の区切り */
  --bd: 2.5px solid var(--ink);
  --r: 12px;
  --wrap: 1080px;
}
```

## 守ること

1. **フォント** — `'M PLUS Rounded 1c'`（Google Fonts）。本文 500、見出し 800、ボタン・ラベル 700。
   数字の飾りだけ `'DotGothic16'`（`.dot`）。
2. **文字の大きさ** — 本文 `1rem`（16px）、行間 1.85。説明文も 0.95rem より小さくしない。
   注記でも 0.8rem まで。見出しは `clamp()` で大きく（ページ見出し 2〜2.8rem、区画見出し 1.6〜2.1rem）。
3. **縁** — 線はぜんぶ `--ink`、`2.5px`（小物は `2px`）。細い灰色の線は使わない。
   表や一覧の区切りは `2.5px dotted var(--rule)`、表の上下の端だけ実線。
4. **影なし・押し込みなし** — `box-shadow` も `:active` で沈む動きも使わない。
   hover は背景色を変えるだけ（`--main` / `--main-deep` / `--main-soft`）。
5. **角丸** — 12px 前後。ピル（`100px`）はタグ・バッジ・状態表示に。
6. **下地はドット** — `radial-gradient(circle, rgba(30,28,20,.13) 1.5px, transparent 1.6px)` を `16px 16px` で。
7. **数字** — 料金・PV・日付は `font-variant-numeric:tabular-nums`。大事な数字は大きく太く。

## ページの組み方

- 上に固定のナビ 1 本（`--main` の帯＋下に黒線）。左にサイト名、右にリンク数個と「ご依頼」ボタン。スマホではリンクを消してボタンだけ。
- 中身は幅 `1080px` の中に。区画の間は 4.5rem 前後あけて、窓枠で囲まない。
- 区画の見出しは大きい h2 ＋横に一言の説明。見出しの上に小さい英語ラベル（Works など）を付けない。
- **区画ごとに形を変える**。同じカードを並べ続けない。
  - 作品: 一番の作品を大きく 1 つ → 残りは 3 列
  - 料金: 表（名前と説明が左、値段が右）
  - 流れ: 番号つきの段を横に 3 つ（スマホは縦）
  - プロフィールとお知らせ: 横 2 段
- 下層ページ: ナビ → パンくず＋大きい h1 ＋一言 → 区画が続く → 黒いフッター。

## 部品

```css
/* ボタン（影なし） */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:.4rem;
  background:var(--paper);color:var(--ink);text-decoration:none;
  border:var(--bd);border-radius:var(--r);
  padding:.6rem 1.15rem;font:inherit;font-weight:700;font-size:.95rem;
  cursor:pointer;transition:background-color .15s;white-space:nowrap;
}
.btn:hover{background:var(--main);}
.btn:disabled{opacity:.55;cursor:default;}
.btn-y{background:var(--main);}            /* 主ボタン */
.btn-y:hover{background:var(--main-deep);}
.btn-g{background:var(--ink);color:var(--main);}  /* 反転。いちばん強い */
.btn-g:hover{color:var(--paper);}

/* タグ */
.tag{
  display:inline-block;font-size:.75rem;font-weight:700;
  background:var(--main);border:2px solid var(--ink);border-radius:100px;padding:0 .65rem;
}

/* カード */
.card{background:var(--paper);border:var(--bd);border-radius:var(--r);}

/* 文字リンク（ボタンにしない「くわしく →」） */
.textlink{
  font-weight:700;text-decoration:underline;text-decoration-thickness:2.5px;
  text-underline-offset:.3em;text-decoration-color:var(--main-deep);
}
.textlink:hover{text-decoration-color:var(--ink);}

/* 箇条書き：黄色い四角 */
.nlist li{position:relative;padding-left:1.3rem;color:var(--ink-2);}
.nlist li::before{
  content:'';position:absolute;left:0;top:.95em;width:.55rem;height:.55rem;
  background:var(--main);border:2px solid var(--ink);border-radius:2px;
}

/* キーボード操作の枠・選択色 */
:focus-visible{outline:3px solid var(--ink);outline-offset:3px;}
::selection{background:var(--main);color:var(--ink);}
```

## ツールを作るときの定番レイアウト

アプリ画面（ツール）は 4 区画に寄せると迷わない。色・縁・影なしのルールは上と同じ。

```
┌──────────────────────────────────────┐
│ タイトルバー（--main／黒縁下線／右にボタン群） │
├────┬─────┬──────────────┬────────┤
│ツール│レイヤー│  キャンバス   │プロパティ│
│レール│パネル  │（ドット下地）  │パネル   │
├────┴─────┴──────────────┴────────┤
│ タイムライン／下部の帯                      │
└──────────────────────────────────────┘
```

前の版（影あり・押し込みあり）で作ったツールは、そのままでよい。直すときに合わせる。
実装例: `lab/tools/mini-spine/`（影ありの旧版）

## やらないこと

- 影（ぼかしも、真下のベタ影も）、押すと沈む動き、跳ねる動き
- 灰色の細い境界線、グラデーション
- 青系・紫系のアクセント（差し色はピンクだけ）
- 小さすぎる文字（0.8rem 未満）、薄すぎる灰色の文字
- 見出しの斜体、見出し上の小さい英語ラベル
- 全部の区画を同じ窓枠・同じカードで囲む
- 作っていない数字（実績の数は本物だけ）
- ダークテーマ

## キャンバス内（Canvas 2D）に描くとき

DOM だけでなく `<canvas>` の中身も同じ色で塗る。
- アートボードの下地にも同じドットを `createPattern` で敷く
- 図形は必ず `--ink` で縁取る（塗りだけの図形を置かない）
- 状態の塗り分け: 選択=`--main` / 第2状態=`--pink` / 通常=`rgba(225,221,96,.5)`

## タブレット・スマホの つまみ

バー（スライダー）は 触った だけでは 動かさない。ドラッグ した 分だけ 動く。
置いた 場所へ 値が とぶ 動きは 使わない。例: `lab/tools/oekaki-kobo/js/rslider.js`

## スマホ

- 横にはみ出さない（`html,body{overflow-x:clip}`）。320 / 375 / 768px で確かめる
- グリッドは `minmax(0,1fr)`。2 列以上はスマホで 1 列に
- ボタン・リンクの文字は 2 行に折らない
