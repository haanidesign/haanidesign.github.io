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
  },
  {
    no: 6,
    slug: "anime-design-studio",
    title: "アニメデザイン工房",
    desc: "ドット等倍のキャンバスにレイヤーとパレットで描き、コマを並べてタイムラインで再生しながら作るアニメ制作台。レイヤーを前後のコマへ移動・コピーでき、しあげのドット化加工つき。GIF・MP4・連番PNG・画像で書き出し。",
    tags: ["お絵かき", "コマアニメ", "GIF書き出し"],
    cat: "anime",
    thumb: "thumbs/anime-design-studio.png",
    url: "tools/anime-design-studio/index.html",
    status: "live"
  },
  {
    no: 7,
    slug: "anime-design-mobile",
    title: "アニメデザイン工房 モバイル",
    desc: "工房のスマホ版。画面下のツールバーと引き出しシートに機能をまとめてあり、指だけで描いてコマを並べられる。2本指でつまんで拡大縮小。GIF・MP4で保存できる。",
    tags: ["お絵かき", "コマアニメ", "スマホ", "GIF書き出し"],
    cat: "anime",
    thumb: "thumbs/anime-design-mobile.png",
    url: "tools/anime-design-mobile/index.html",
    status: "live"
  },
  {
    no: 8,
    slug: "7days-kanojo",
    title: "7日間の彼女",
    desc: "月曜から日曜まで、毎日ちがう彼女に会う。毎日「昨日どこにいたか」を聞かれ、答えるたびに機嫌とうたがいメーターが動く。所要15〜20分。",
    tags: ["ゲーム", "アドベンチャー", "うたがいメーター"],
    cat: "game",
    thumb: "thumbs/7days-kanojo.png",
    url: "tools/7days-kanojo/index.html",
    status: "live"
  },
  {
    no: 9,
    slug: "7days-kareshi",
    title: "7日間の彼氏",
    desc: "「7日間の彼女」の彼氏版。会う相手が7人の彼氏に入れ替わり、同じ7日間を反対側から遊ぶ。所要15〜20分。",
    tags: ["ゲーム", "アドベンチャー", "うたがいメーター"],
    cat: "game",
    thumb: "thumbs/7days-kareshi.png",
    url: "tools/7days-kareshi/index.html",
    status: "live"
  },
  {
    no: 10,
    slug: "task-calendar",
    title: "タスクカレンダー",
    desc: "カテゴリー別のカンバンでタスクを並べ、やった時間をカレンダーに積んでいく作業台。その月の作業時間・記録日数・ログ数がひと目で出て、CSVでも書き出せる。書いたものはこの端末に残る。",
    tags: ["タスク管理", "作業ログ", "カレンダー"],
    cat: "other",
    thumb: "thumbs/task-calendar.svg",
    url: "tools/task-calendar/index.html",
    status: "live"
  }
];

const CATEGORIES = [
  { key: "all",   label: "すべて" },
  { key: "manga", label: "漫画制作" },
  { key: "anime", label: "アニメーション" },
  { key: "game",  label: "ゲーム" },
  { key: "other", label: "その他" }
];
