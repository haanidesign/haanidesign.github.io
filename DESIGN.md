# はぁにデザイン（HAANI UI）

新しくツールやページを作るときは「**はぁにデザインで**」と言えばこれ。
Claude Code にはこのファイルのパスを渡せば伝わる → `C:/ai/haanidesign.github.io/DESIGN.md`

## ひとことで言うと

**生成りの紙にドットを敷いて、黒い太縁で囲んで、黄色を差す。ボタンは押すと沈む。**
文房具っぽい・お絵かきアプリっぽい・角が丸い。影はぼかさず真下にベタで置く。

## トークン（そのまま貼る）

```css
:root{
  --main:      #E1DD60;   /* メインの黄色。強調・選択状態 */
  --main-deep: #B8B43F;   /* 濃いめ。hover や小さい文字 */
  --main-soft: #F2F0BE;   /* 淡い。行のhover・薄い面 */
  --cream:     #FBFAEC;   /* 下地（パネル・地の色） */
  --paper:     #FFFEF7;   /* いちばん明るい面（カード・入力欄） */
  --ink:       #1E1C14;   /* 黒。縁と影と文字は全部これ */
  --gray:      #8A8470;   /* 補助テキスト */
  --pink:      #F2A0B8;   /* 差し色。削除・注意・第2状態 */
  --bd: 2.5px solid var(--ink);
  --r: 12px;
}
```

## 守るのはこの6つだけ

1. **フォント** — `'M PLUS Rounded 1c'` を Google Fonts から。基本 `font-weight:700`。
   数字やラベルだけ `'DotGothic16'`（`.dot` クラス）。
2. **縁** — 線はぜんぶ `--ink`。細い灰色の境界線は使わない。`2.5px`、小物は `2px`。
3. **角丸** — 12px 前後。ピル（`border-radius:100px`）はタグ・バッジ・見出しに。
4. **影は真下にベタ** — `box-shadow:0 3px 0 var(--ink)`。ぼかし（blur）は使わない。
5. **押し込み** — `:hover` で `--main` に、`:active` で `transform:translateY(3px)` して影を0に。
   選択中（`.on`）は「押し込んだまま」＝黄色＋影0＋2px下げ。
6. **下地はドット** — `radial-gradient(circle, rgba(30,28,20,.13) 1.5px, transparent 1.6px)` を
   `background-size:16px 16px` で。

## 部品

```css
/* ボタン */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:.4rem;
  background:var(--paper);color:var(--ink);
  border:var(--bd);border-radius:var(--r);
  padding:.6rem 1.1rem;font:inherit;font-size:.82rem;
  box-shadow:0 3px 0 var(--ink);
  cursor:pointer;transition:transform .08s,box-shadow .08s,background .15s;
  white-space:nowrap;
}
.btn:hover{background:var(--main);}
.btn:active{transform:translateY(3px);box-shadow:0 0 0 var(--ink);}
.btn-y{background:var(--main);}          /* 主ボタン */
.btn-g{background:var(--ink);color:var(--main);}  /* 反転。いちばん強い */
.btn-sm{padding:.35rem .75rem;font-size:.72rem;box-shadow:0 2.5px 0 var(--ink);}

/* 見出しピル */
.title{
  background:var(--ink);color:var(--main);
  border-radius:100px;padding:.15rem .8rem;font-size:.66rem;
}

/* タグ */
.chip{
  font-size:.62rem;background:var(--cream);
  border:2px solid var(--ink);border-radius:100px;padding:.1rem .6rem;
}

/* リスト行 */
.item{
  background:var(--paper);border:2px solid var(--ink);border-radius:9px;
  padding:.2rem .45rem;box-shadow:0 2.5px 0 var(--ink);
}
.item:hover{background:var(--main-soft);}
.item.sel{background:var(--main);box-shadow:0 0 0 var(--ink);transform:translateY(2.5px);}

/* 補足ブロック */
.hint{
  background:var(--main-soft);border:2px dashed var(--ink);border-radius:10px;
  padding:.45rem .55rem;font-size:.62rem;font-weight:400;color:#5c5843;
}
```

## ツールを作るときの定番レイアウト

サイトのトップにある「お絵かきアプリ風」のモックと同じ4区画に寄せると迷わない。

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

実装済みの例: `lab/tools/mini-spine/`（style.css がそのままお手本）

## やらないこと

- 灰色の細い境界線、ぼかした影、グラデーション
- 青系・紫系のアクセント（差し色はピンクだけ）
- 細いフォント（400 は補助テキストのみ）
- ダークテーマ。この世界観は生成り紙の明るい面が前提

## キャンバス内（Canvas 2D）に描くとき

DOM だけでなく `<canvas>` の中身も同じ色で塗る。
- アートボードの下地にも同じドットを `createPattern` で敷く
- 図形は必ず `--ink` で縁取る（塗りだけの図形を置かない）
- 状態の塗り分け: 選択=`--main` / 第2状態=`--pink` / 通常=`rgba(225,221,96,.5)`
