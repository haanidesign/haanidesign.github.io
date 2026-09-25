# JIZURA エンジンに ついて

`jizura-engine.js` は **JIZURA 字面**（文字PV 自動構成ツール）の
組み立て・えがき ぶぶんを そのまま 取りこんだ ものです。

- もと: https://github.com/852wa/JIZURA
- ライセンス: MIT License — Copyright (c) 2026 hakoniwa
- 全文: `../LICENSE-JIZURA.txt`
- 取りこんだ 時点: 2026-09-25（[nocore-dtm/JIZURA](https://github.com/nocore-dtm/JIZURA) `782fa7d`。本家と 同じ MIT・同じ 権利者で、
  行ごと・カットごとの さしかえ、[間奏] 行、カット数の 指定 などが 足された もの）

## 取りこむ にあたって したこと

1. `src/12_ui.js`（向こうの 画面まわり）を のぞいた
2. のこりの `src/*.js` を 名前じゅんに つないだ（本家の `build.py` と 同じ やり方）

中身は さわって いません。`window.J` に 出ます。

## つかい方

```js
const pr = J.defaultProject();
pr.lyrics = '…'; pr.style = 'noir'; pr.seed = 1;
const plan = J.plan(pr, { beats: J.beatGrid(bpm, offset, dur) });
await J.ensureFonts(pr.lyrics, J.fontsOfPlan(plan));
new J.Renderer().frame(ctx, plan, t, { scale: 1 });
```

- カットは `plan.cuts[i].start` / `.end`、ぜんたいの ながさは `plan.duration`
- スタイルは `J.STYLES`（24種）、部品は `J.LAYOUTS` ほか
- `frame()` の `transparent` と いっしょに `layer: 'back' | 'front'` を 入れると
  うしろ（背景の 絵・うしろの かざり）と 前（歌詞・前の かざり・HUD）に わかれます

## 出力物の 権利

向こうの README に ある とおり、この しくみで 作った 動画や 画像の
権利は 作った 人に あります。ソフトの ライセンスは 出力物には およびません。

## 参考に した もの

カット 1つだけ 中身を さしかえる 画面は
[JIZURA for AviUtl2](https://github.com/SakiikaVR/JIZURA-AviUtl2)（SakiikaVR, MIT）の
`bridge.js` を 参考に しました。中の しくみは いま
nocore-dtm 版の `overrides` / `cutTech` を そのまま つかって います。
