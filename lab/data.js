/* HAANI LAB — ツール定義
   追加するときは、この配列に1つオブジェクトを足すだけ。
   cat: "manga" | "anime" | "other"    status: "live" | "wip" | "broken" */
const TOOLS = [
  {
    no: 1,
    slug: "sozai-maker",
    title: "素材メーカー",
    desc: "背景パターン・パーティクル・フレーム・トランジションの4系統をパラメータで作り分け。透過の連番PNGをZIPで書き出せる。",
    tags: ["AE素材", "ループ素材", "連番PNG"],
    cat: "anime",
    thumb: "thumbs/sozai-maker.png",
    url: "tools/sozai-maker/index.html",
    status: "live"
  },
  {
    no: 2,
    slug: "flare-maker",
    title: "フレアライトメーカー",
    desc: "十字フラッシュ・集中光バースト・電撃アークなど13種の手描き風光エフェクト。コマ打ちとボイルを付けて透過連番PNGで出力。",
    tags: ["AE素材", "エフェクト", "連番PNG"],
    cat: "anime",
    thumb: "thumbs/flare-maker.png",
    url: "tools/flare-maker/index.html",
    status: "live"
  },
  {
    no: 3,
    slug: "psd-avatar-studio",
    title: "PSD アバタースタジオ",
    desc: "PSD立ち絵に表情・視線・髪と胸の物理を当ててリアルタイムに動かし、そのままループWebMとして書き出す。マウス追従とマイク口パクにも対応。",
    tags: ["PSD", "立ち絵", "WebM書き出し"],
    cat: "anime",
    thumb: "thumbs/psd-avatar-studio.png",
    url: "tools/psd-avatar-studio/index.html",
    status: "live"
  },
  {
    no: 4,
    slug: "psd-bone-anime",
    title: "ボーン変形アニメ",
    desc: "パーツの上に骨を引いてメッシュ変形させる、髪や布のうねり用。親子関係と呼吸も設定でき、動画・連番・JSONで出力。",
    tags: ["PSD", "ボーン変形", "アニメーション"],
    cat: "anime",
    thumb: "thumbs/psd-bone-anime.png",
    url: "tools/psd-bone-anime/index.html",
    status: "live"
  },
  {
    no: 5,
    slug: "dot-maker",
    title: "DOT MAKER",
    desc: "イラストをドット絵に変換。粗さ・色数・ディザ・レトロ機風パレットを選んで、等倍〜8倍のPNGで保存できる。",
    tags: ["ドット絵", "画像変換", "パレット"],
    cat: "other",
    thumb: "thumbs/dot-maker.png",
    url: "tools/dot-maker/index.html",
    status: "live"
  }
];

const CATEGORIES = [
  { key: "all",   label: "すべて" },
  { key: "manga", label: "漫画制作" },
  { key: "anime", label: "アニメーション" },
  { key: "other", label: "その他" }
];
