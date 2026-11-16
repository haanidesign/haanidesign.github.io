# はぁにデザイン（HAANI UI）

新しくツールやページを作るときは「**はぁにデザインで**」と言えばこれ。
Claude Code にはこのファイルのパスを渡せば伝わる → `C:/ai/haanidesign.github.io/DESIGN.md`

実物のお手本: サイトの `index.html`・`price.html` と `site.css`・`site.js`（2026-11 版）。迷ったらこれを見る。

## ひとことで言うと

**黄色と黒の2色で強く。大きな英字と丸い日本語を組み合わせて、細い線で区切る。動きはなめらかに少しだけ。**
雑誌っぽい・余白が広い・角は丸い。それでも「読める」を優先する。

## トークン（そのまま貼る）

```css
:root{
  --main:      #E1DD60;   /* メインの黄色。ヒーロー・強調・ボタンの文字 */
  --main-deep: #B8B43F;   /* 濃いめ。黄色の上での強調 */
  --main-soft: #F2F0BE;   /* 淡い。行の hover・開閉の hover */
  --cream:     #FBFAEC;   /* 下地 */
  --paper:     #FFFEF7;   /* いちばん明るい面（入力欄・浮いたナビ） */
  --ink:       #1E1C14;   /* 黒。文字・主ボタン・黒い区画 */
  --ink-2:     #4F4A3B;   /* 説明文 */
  --gray:      #6E6857;   /* 小さい注記・日付（これより薄くしない） */
  --pink:      #F2A0B8;   /* 差し色。バッジ・帯の飾り */
  --line:      rgba(30,28,20,.16);   /* 行の区切り（細線） */
  --en: 'Unbounded', sans-serif;                       /* 英字・数字 */
  --ja: 'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif;  /* 日本語 */
  --wrap: 1200px;
  --ease: cubic-bezier(.2,.8,.2,1);
}
```

Google Fonts:
`https://fonts.googleapis.com/css2?family=Unbounded:wght@500;800;900&family=Zen+Maru+Gothic:wght@500;700;900&display=swap`

## 守ること

1. **フォント** — 日本語は Zen Maru Gothic（本文 500、ラベル 700、見出し 900）。
   英字の見出し・番号・値段・日付は Unbounded（800〜900）。日本語の文を Unbounded にしない。
2. **文字の大きさ** — 本文 `1rem`、行間 1.9。説明文も 0.95rem より小さくしない。注記でも 0.75rem まで。
   英字の見出しは思い切り大きく（`clamp(3.2rem,10vw,8rem)`、行間 .9、字間 -.045em）。
3. **線** — 区画の頭は `1.5px solid var(--ink)`、行の区切りは `1px solid var(--line)`。
   太い黒縁（2.5px）や点線の区切りは使わない。
4. **影なし** — `box-shadow` で浮かせない（入力欄のフォーカスの輪だけ例外）。
   hover は色の入れかえ（黒⇄黄）・少し右へずらす・画像を 1.04〜1.05 倍、のどれか。
5. **角丸** — ボタン・タグ・ナビはピル（`100px`）。画像は 16〜20px。大きな区画のふちは 40px（スマホ 28px）。
6. **下地** — `--cream` に紙のざらつき（SVG のノイズを `opacity:.07` で全面に）。ドット柄は使わない。
7. **数字** — 料金・PV・日付は Unbounded ＋ `tabular-nums`。単位（〜・／1P）は日本語で小さく。
8. **動き** — `--ease` で 0.3〜1 秒。スクロールで下から 40px ふわっと出す（`.rv` → `.in`）。
   `prefers-reduced-motion` のときは全部止める。

## ページの組み方

- ナビは上に浮いたピル（すりガラス `rgba(255,254,247,.72)`＋`backdrop-filter:blur(14px)`）。
  左に「**HAANI** はぁにデザイン工房」、右にリンク（頭に小さい番号 01〜）と黒い「ご依頼 →」。スマホはリンクを消す。
- 区画の見出しは「丸枠の番号（01）＋大きい英字（Works）＋下に日本語の一言」、下に黒線。
- **区画ごとに形と地の色を変える**。
  - ヒーロー: 黄色の全画面。大きな見出しを1行ずつせり上げる。背景に縁取りだけの巨大英字
  - 黒い帯: 少し傾けて英字を横に流す（marquee）
  - 作品: 一番の作品を大きく 1 つ → 残りは 3 列を段違い（2列目 4rem、3列目 8rem 下げる）
  - 料金: 黒地の区画。値段は黄色の大きい英字
  - 流れ: 縁取りだけの大きい番号（01 02 03）を横に 3 つ
  - お問い合わせ: 黄色地の区画
- 大きな区画は上の角だけ丸めて重ねる（`border-radius:40px 40px 0 0`）。
- フッターは黒地に画面幅いっぱいの「HAANI DESIGN」（黄色）。
- 下層ページ: ナビ → 黄色の頭（パンくず＋大きい英字＋日本語の h1＋一言、下の角を丸める）→ 区画 → フッター。

## 部品

```css
/* ボタン */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:.6rem;
  font:inherit;font-weight:700;text-decoration:none;cursor:pointer;
  padding:.85rem 1.6rem;border-radius:100px;border:2px solid var(--ink);
  background:var(--paper);color:var(--ink);transition:background-color .25s,color .25s;
}
.btn-y{background:var(--ink);color:var(--main);}   /* 主ボタン */
.btn-y:hover{background:var(--main);color:var(--ink);}
.btn-o{background:transparent;}                     /* 枠だけ */
.btn-o:hover{background:var(--ink);color:var(--paper);}

/* 矢印は hover で右へ */
.arr{display:inline-block;transition:transform .35s var(--ease);}
a:hover .arr,button:hover .arr{transform:translateX(5px);}

/* タグ */
.tag{font-size:.72rem;font-weight:700;border:1.5px solid currentColor;border-radius:100px;padding:0 .7rem;}

/* 区画の見出し */
.sh{display:grid;grid-template-columns:auto 1fr;align-items:end;column-gap:1.2rem;
  border-bottom:1.5px solid var(--ink);padding-bottom:1.2rem;margin-bottom:3rem;}
.sh-no{font-family:var(--en);font-weight:800;font-size:.85rem;border:1.5px solid currentColor;border-radius:100px;padding:.1rem .7rem;}
.sh-en{font-family:var(--en);font-weight:900;font-size:clamp(3.2rem,10vw,8rem);line-height:.9;letter-spacing:-.045em;}

/* ナビのリンク：下線が左から伸びる */
.nav-links a::after{content:'';position:absolute;left:0;right:0;bottom:-2px;height:2px;background:var(--ink);
  transform:scaleX(0);transform-origin:right;transition:transform .35s var(--ease);}
.nav-links a:hover::after{transform:scaleX(1);transform-origin:left;}

/* 箇条書き：細い横棒＋太字に黄色マーカー */
.nlist li{position:relative;padding:.9rem 0 .9rem 1.8rem;border-bottom:1px solid var(--line);}
.nlist li::before{content:'';position:absolute;left:0;top:1.85em;width:.9rem;height:1.5px;background:var(--ink);}
.nlist li b{background:linear-gradient(transparent 62%, var(--main) 62%);}

/* 縁取りだけの数字 */
.outline-num{font-family:var(--en);font-weight:900;color:transparent;-webkit-text-stroke:1.5px var(--ink);}

:focus-visible{outline:3px solid var(--ink);outline-offset:3px;}
::selection{background:var(--main);color:var(--ink);}
```

## ツールを作るときの定番レイアウト

アプリ画面（ツール）は 4 区画に寄せると迷わない。色・線・影なしのルールは上と同じ。

```
┌──────────────────────────────────────┐
│ タイトルバー（黒地／左に英字のツール名・右にピルのボタン群） │
├────┬─────┬──────────────┬────────┤
│ツール│レイヤー│  キャンバス   │プロパティ│
│レール│パネル  │（--cream 下地）│パネル   │
├────┴─────┴──────────────┴────────┤
│ タイムライン／下部の帯                      │
└──────────────────────────────────────┘
```

- パネルの区切りは `1px solid var(--line)`、パネルの見出しは小さい Unbounded（.7rem・字間 .1em）
- 選んでいる道具・タブは黒地に黄色の文字
- アニメ工房・動画工房の定型（`lab/tools/skin/TEIKEI.md`）がある道具は、そちらを優先する

前の版（黒い太縁・ドット下地）で作ったツールは、そのままでよい。直すときに合わせる。

## やらないこと

- 影（ぼかしも、真下のベタ影も）、押すと沈む動き、跳ねる動き
- 黒い太縁で全部を囲む、ドット柄の下地、点線の区切り
- 青系・紫系のアクセント（差し色はピンクだけ）
- 小さすぎる文字（0.75rem 未満）、薄すぎる灰色の文字
- 見出しの斜体、日本語の文に英字フォント
- 全部の区画を同じカードで囲む
- 作っていない数字（実績の数は本物だけ）
- 止まらない動きの入れすぎ（流れる帯・回るロゴは 1 画面に 1 つまで）

## キャンバス内（Canvas 2D）に描くとき

DOM だけでなく `<canvas>` の中身も同じ色で塗る。
- アートボードの下地は `--cream`、外側は `--ink` で暗く
- 図形の縁は `--ink`、1.5px
- 状態の塗り分け: 選択=`--main` / 第2状態=`--pink` / 通常=`rgba(225,221,96,.5)`

## タブレット・スマホの つまみ

バー（スライダー）は 触った だけでは 動かさない。ドラッグ した 分だけ 動く。
置いた 場所へ 値が とぶ 動きは 使わない。例: `lab/tools/oekaki-kobo/js/rslider.js`

## スマホ

- 横にはみ出さない（`html,body{overflow-x:clip}`）。320 / 375 / 768px で確かめる
- グリッドは `minmax(0,1fr)`。2 列以上はスマホで 1 列に（作品は 2 列で段違い）
- 巨大な英字は `vw` で縮める。はみ出していないか必ず見る
- ボタン・リンクの文字は 2 行に折らない
