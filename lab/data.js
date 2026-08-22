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
    slug: "mini-spine",
    title: "ミニSpine",
    desc: "PSDを投げ込むとレイヤーがそのままパーツになり、名前やグループから仮の骨格まで組んでくれる2Dリグ台。本家Spineに合わせて回転・移動・スケール・シアーのツールを分け、ローカル/親/ワールドの座標系、コンペンセイト、IK、Undoまで揃えてある。UIを消した配信モードにするとOBSのブラウザソースにそのまま置け、マイクで口パク・自動まばたきするPNGTuberになる。",
    tags: ["PSD", "ボーン", "メッシュ変形", "IK", "PNGTuber"],
    cat: "anime",
    thumb: "thumbs/mini-spine.svg",
    url: "tools/mini-spine/index.html",
    status: "live"
  },
  {
    no: 11,
    slug: "anime-kobo",
    title: "アニメ工房",
    desc: "スマホでアニメを作る台。最初にたて・ましかく・よこから形を選び、PSDやPNGを読み込んで指で並べる。コマの切り替わる時間を1つずつ自分で置けるので、パラパラの間を自由に作れる。MP4で書き出してそのままSNSへ。",
    tags: ["スマホ", "アニメーション", "キーフレーム", "PSD", "MP4"],
    cat: "anime",
    thumb: "thumbs/anime-kobo.svg",
    url: "tools/anime-kobo/index.html",
    status: "wip"
  }
];

const CATEGORIES = [
  { key: "all",   label: "すべて" },
  { key: "manga", label: "漫画制作" },
  { key: "anime", label: "アニメーション" },
  { key: "game",  label: "ゲーム" },
  { key: "other", label: "その他" }
];
