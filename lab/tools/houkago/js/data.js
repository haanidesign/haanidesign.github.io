/* 放課後リフレイン — data.js
 * window.DATA : キャラ・会話・イベント・デートの全データ。
 *
 * SPEC.md 準拠のフィールドに加えて、次を追加している（game.js 向けメモ）:
 *
 * DATA.tiers            ときめき段階。[{id, name, min}] 5段階（0..4）。aff >= min の最大のもの。
 *                       電話・エンディング・ひよりの報告は、この tier 番号(0..4)で引く。
 * DATA.chars[id].likes  { place:[placeId...], param:'study'等 or 'balance'(全パラの平均を見る) }
 * DATA.chars[id].meet   minato:{type:'start'} / aoi:{type:'event', id:'entrance'}（entrance シーン内の {meet:'aoi'} で出会う）
 *                       haruto/ritsu:{type:'param', param, value, scene:'meet_haruto'|'meet_ritsu'}
 *                       → 条件を満たした週の週末に scene を再生する想定。
 * DATA.chars[id].title  短い肩書き（電話帳などに）
 * DATA.commands[i]      {id, name, desc, gain:{param:+n}, cost:{hp:-n, stress:+n}, chibi:'study'等}
 *                       rest は cost の値が負のストレス（回復）/ 正のhp。
 * DATA.reportLines[cmdId] = {great:[...], success:[...], fail:[...]}  週報のひとこと（地の文の文字列）
 * DATA.places[i]        {id, name, bg, cost, desc}  cost はおこづかい的な目安（未使用でも可）
 * DATA.calendar[i]      {week, month, label, event|null, note}  event は DATA.events のキー
 * DATA.events           { entrance:'entrance', midterm:{before, good, normal, bad}, sports_day:{before, win, lose},
 *                         tanabata:'tanabata', final_exam:{before, good, normal, bad}, closing:'closing' }
 *                       値はすべて DATA.scenes のキー。テストは順位で good(<=30位) normal(<=120位) bad を選ぶ。
 * DATA.rankComments     [{max, text}] 順位へのひとこと（上から順に rank <= max の最初のもの）
 * DATA.scenes           SPEC の step 形式。label/goto はシーン内で閉じる。
 *                       choice の effect は好感度のキー（キャラID）に加え stress/hp を使う場合がある。
 * DATA.dates[charId][placeId] = {opener, talks, closer_good, closer_bad}
 *                       talks と closer は全場所で同じ配列を共有（キャラ共通プール）。opener が場所固有。
 *                       talk = {q:[steps], choices:[{text, delta, expr, reply}]} reply は相手のセリフ文字列。
 *                       game.js はデート1回につき talks から3つ程度をランダムに選ぶ想定。
 *                       合計 delta と場所の好み（likes.place）で closer_good / closer_bad を選ぶ。
 * DATA.dateTalks[charId] 上記 talks の元配列（同じもの）
 * DATA.phone[charId]    { first:[...], accept:[...](tier0-1用), acceptTier:[[t0],[t1],[t2],[t3],[t4]],
 *                         decline:[...], busy:[...], hurt:[...](傷心度が高いときの冷たい応答) }  すべて相手のセリフ文字列。
 * DATA.phone.friend     ひよりへの電話（情報を聞く）用 { open:[...], close:[...] }
 * DATA.random[i]        {id, cond, scene:[steps]}
 *                       cond: {met:'aoi'} {weekMin, weekMax} {param:{sport:30}} {months:[6]} {chance:0..1}
 * DATA.endings[charId][tier] = [steps]  終業式後、出会った相手ごとに再生する夏休み前のひとこと。
 * DATA.reportCard[charId][tier] = 通知表に載せる「気持ちの一言」（文字列）
 * DATA.bombTalk         { feelings[charId][tier], unmet[charId], warn[charId], explode[charId], calm[...], intro[...] }
 *                       feelings は ひよりが好感度を教える文字列。warn は傷心度50の警告、explode は爆発時の噂。
 *
 * 表情: normal smile laugh blush angry annoyed sad surprise think wink
 */
(function () {
'use strict';

var CHAR_IDS = ['minato', 'aoi', 'haruto', 'ritsu'];
var PLACE_IDS = ['amusement', 'aquarium', 'cinema', 'park', 'mall', 'cafe', 'karaoke'];

var DATA = {};

DATA.player = { name: '春野 ひなた', kana: 'はるの ひなた' };

DATA.tiers = [
  { id: 0, name: '知り合い', min: 0 },
  { id: 1, name: '友達', min: 20 },
  { id: 2, name: '仲良し', min: 40 },
  { id: 3, name: '気になる', min: 60 },
  { id: 4, name: 'ときめき', min: 80 }
];

/* ============================================================
 * キャラクター
 * ============================================================ */
DATA.chars = {
  minato: {
    name: '真白 湊', kana: 'ましろ みなと', grade: '1年B組', role: '幼なじみ', title: 'となりの家の幼なじみ',
    color: '#7fb8d8',
    profile: '家がとなり同士で、保育園からずっと一緒。穏やかで面倒見がいいけれど、ひなたのこととなると少しだけ心配性。料理と水族館が好き。',
    likes: { place: ['aquarium', 'park', 'cafe'], param: 'balance' },
    meet: { type: 'start' },
    phone: '090-4127-0815'
  },
  aoi: {
    name: '朝比奈 蒼', kana: 'あさひな あおい', grade: '1年A組', role: '生徒会', title: '1年生の生徒会書記',
    color: '#4a6fb5',
    profile: '入学式で新入生代表の挨拶をした秀才。合理主義で口数は少なめ、敬語とタメ口がまざる。甘いものに目がないのは秘密。',
    likes: { place: ['aquarium', 'cinema', 'cafe'], param: 'study' },
    meet: { type: 'event', id: 'entrance' },
    phone: '080-2231-0407'
  },
  haruto: {
    name: '日向 陽翔', kana: 'ひなた はると', grade: '1年C組', role: 'サッカー部', title: 'サッカー部の新人エース',
    color: '#f0913a',
    profile: '声が大きくて、笑うと周りまで明るくなるムードメーカー。名字が「ひなた」なので、主人公の名前にやたら親近感を持っている。',
    likes: { place: ['amusement', 'karaoke', 'mall'], param: 'sport' },
    meet: { type: 'param', param: 'sport', value: 25, scene: 'meet_haruto' },
    phone: '070-5510-1122'
  },
  ritsu: {
    name: '神楽 律', kana: 'かぐら りつ', grade: '2年D組', role: '軽音部', title: '軽音部の2年生（ベース）',
    color: '#8a6bb8',
    profile: '放課後の音楽室でひとりベースを弾いている先輩。無口で、たまに謎めいたことを言う。レコードと古い喫茶店が好き。',
    likes: { place: ['cafe', 'park', 'mall'], param: 'art' },
    meet: { type: 'param', param: 'art', value: 25, scene: 'meet_ritsu' },
    phone: '090-8806-3131'
  },
  friend: {
    name: '七瀬 ひより', kana: 'ななせ ひより', grade: '1年B組', role: '親友', title: 'うわさと恋バナの情報屋',
    color: '#f28bb0',
    profile: '中学からの親友。校内のうわさに異様にくわしく、誰が誰をどう思っているか、なぜか全部知っている。',
    likes: { place: [], param: null },
    meet: { type: 'start' },
    phone: '080-7777-2525'
  }
};

DATA.params = [
  { id: 'study', name: '学力' },
  { id: 'sport', name: '運動' },
  { id: 'art', name: '芸術' },
  { id: 'culture', name: '教養' },
  { id: 'style', name: '容姿' }
];

/* ============================================================
 * コマンド
 * ============================================================ */
DATA.commands = [
  { id: 'study', name: '勉強', chibi: 'study',
    desc: '授業の復習と問題集。テストの順位に直結する。',
    gain: { study: 8, culture: 1 }, cost: { hp: -6, stress: 8 } },
  { id: 'sport', name: '部活・運動', chibi: 'sport',
    desc: 'グラウンドを走って、体を動かす。体育祭が近いなら特に。',
    gain: { sport: 8, style: 1 }, cost: { hp: -10, stress: 3 } },
  { id: 'art', name: '芸術', chibi: 'art',
    desc: '美術室でスケッチ、音楽室でピアノ。感性をみがく。',
    gain: { art: 8, culture: 1 }, cost: { hp: -5, stress: 4 } },
  { id: 'culture', name: '教養・読書', chibi: 'culture',
    desc: '図書室で本を読む。話題の引き出しが増える。',
    gain: { culture: 8, study: 2 }, cost: { hp: -4, stress: 4 } },
  { id: 'style', name: '自分磨き', chibi: 'style',
    desc: 'スキンケア、ヘアアレンジ、服の研究。鏡の前の私、がんばれ。',
    gain: { style: 8, art: 1 }, cost: { hp: -4, stress: 5 } },
  { id: 'rest', name: '休養', chibi: 'rest',
    desc: '早めに寝て、体と心を休める。何もしない勇気。',
    gain: {}, cost: { hp: 25, stress: -20 } },
  { id: 'play', name: '遊ぶ', chibi: 'play',
    desc: 'ひよりと寄り道。ストレス発散だけど、勉強はお留守に。',
    gain: { style: 2, culture: 1 }, cost: { hp: -6, stress: -25 }, loss: { study: -2 } }
];

DATA.reportLines = {
  study: {
    great: ['ノートの色ペンが、今週は一段とはかどった。', '数学の小テストで満点。先生に名前を呼ばれた。', '暗記カードが一周半。頭が冴えている。'],
    success: ['問題集が10ページ進んだ。', 'わからなかった公式が、やっとつながった。', '英単語をぶつぶつ唱えながら下校した。'],
    fail: ['教科書を開いたまま、気づいたら朝だった。', 'スマホの通知に負け続けた一週間。', '集中しようとしたら、机の片づけで終わった。']
  },
  sport: {
    great: ['100mのタイムが自己ベスト更新。風になった気分。', '先輩に「フォームきれいだね」と褒められた。', '走り終わった後の空が、やけに青かった。'],
    success: ['グラウンドを10周。足がパンパン。', 'ストレッチで前屈が少し深くなった。', 'ボールを追いかけて、いい汗をかいた。'],
    fail: ['準備運動の時点で息が切れた……。', '派手に転んで、ひざに絆創膏。', '雨で練習が中止。体育館の隅で縄跳びだけ。']
  },
  art: {
    great: ['スケッチを美術の先生が廊下に貼ってくれた。', 'ピアノで一曲、最後まで通して弾けた。', '色の混ぜ方のコツが、急にわかった。'],
    success: ['窓から見える桜を、鉛筆で描いた。', '鍵盤の上で指が少し速く動くようになった。', '好きな画家の画集を眺めて、真似してみた。'],
    fail: ['描いた猫が、なぜかタヌキになった。', '絵の具を制服にこぼした。', '楽譜の音符が、全部おたまじゃくしに見えた。']
  },
  culture: {
    great: ['一冊読み終えて、しばらく余韻から戻れなかった。', '図書委員さんに「趣味いいね」と言われた。', '知らなかった言葉を三つ覚えて、使いたくてうずうずしている。'],
    success: ['図書室で、窓際の席を確保できた。', '新書を一冊。世界が少し広がった。', 'ニュースアプリの解説記事を読みこんだ。'],
    fail: ['三行読んで寝た。春の図書室は危険。', '推理小説の犯人を、帯でネタバレされた。', '読むより選ぶのに時間がかかった。']
  },
  style: {
    great: ['新しい前髪、ひよりに「天才」と言われた。', '肌の調子が絶好調。鏡を見るのが楽しい。', 'プチプラで、理想のコーデが完成した。'],
    success: ['動画を見ながら、ゆるふわ巻きを練習した。', 'リップの色を一本だけ新しくした。', '姿勢を意識して歩いてみた。'],
    fail: ['前髪を自分で切って、ちょっと失敗した。', 'アイロンで指をやけどしかけた。', 'コーデに迷って、結局いつもの服。']
  },
  rest: {
    great: ['十時間睡眠。生まれ変わった気分。', 'お風呂でアロマを焚いた。心がほどけた。', '夢の中で誰かに褒められた気がする。'],
    success: ['ぐっすり眠れた。', 'ベッドでごろごろ。これも大事な仕事。', 'お母さんの作ったプリンを食べた。'],
    fail: ['寝る前にスマホを見て、結局夜ふかし。', '休もうとしたのに、宿題を思い出した。', '昼寝のしすぎで、夜に眠れなかった。']
  },
  play: {
    great: ['ひよりとプリクラ。奇跡の一枚が撮れた。', 'クレーンゲームで、ぬいぐるみが一発で取れた。', '笑いすぎて、お腹が痛い。最高の放課後。'],
    success: ['駅前のクレープ屋さんで寄り道した。', 'ひよりとカラオケで三時間。のどがガラガラ。', 'ショッピングモールをぶらぶらした。'],
    fail: ['おこづかいが、びっくりするほど減った。', '寄り道しすぎて、門限ギリギリ。お母さんに怒られた。', '遊んでいる間も、宿題が頭から離れなかった。']
  }
};

/* ============================================================
 * デート場所
 * ============================================================ */
DATA.places = [
  { id: 'amusement', name: '遊園地', bg: 'amusement', cost: 3, desc: 'ジェットコースターと観覧車。叫んで笑って、一日じゅうにぎやか。' },
  { id: 'aquarium', name: '水族館', bg: 'aquarium', cost: 2, desc: '青い光の中をクラゲがただよう。静かに話したい日に。' },
  { id: 'cinema', name: '映画館', bg: 'cinema', cost: 2, desc: '話題の新作から名作リバイバルまで。ポップコーンは塩派？キャラメル派？' },
  { id: 'park', name: '公園', bg: 'park', cost: 0, desc: '池のほとりのベンチと、ボートと、のんびりした風。' },
  { id: 'mall', name: 'ショッピングモール', bg: 'mall', cost: 1, desc: '服、雑貨、中古レコード店まで。歩くだけで楽しい。' },
  { id: 'cafe', name: 'カフェ', bg: 'cafe', cost: 1, desc: '駅裏の小さな喫茶店。窓際の席は特等席。' },
  { id: 'karaoke', name: 'カラオケ', bg: 'karaoke', cost: 1, desc: 'ふたりきりの個室。選曲で性格がばれる。' }
];

/* ============================================================
 * カレンダー（16週）
 * ============================================================ */
DATA.calendar = [
  { week: 1, month: 4, label: '4月 第1週', event: 'entrance', note: '入学式' },
  { week: 2, month: 4, label: '4月 第2週', event: null, note: '部活動見学' },
  { week: 3, month: 4, label: '4月 第3週', event: null, note: '' },
  { week: 4, month: 4, label: '4月 第4週', event: null, note: 'もうすぐ連休' },
  { week: 5, month: 5, label: '5月 第1週', event: null, note: 'ゴールデンウィーク' },
  { week: 6, month: 5, label: '5月 第2週', event: null, note: '' },
  { week: 7, month: 5, label: '5月 第3週', event: null, note: 'テスト1週間前' },
  { week: 8, month: 5, label: '5月 第4週', event: 'midterm', note: '中間テスト' },
  { week: 9, month: 6, label: '6月 第1週', event: null, note: '衣替え' },
  { week: 10, month: 6, label: '6月 第2週', event: null, note: '梅雨入り' },
  { week: 11, month: 6, label: '6月 第3週', event: 'sports_day', note: '体育祭' },
  { week: 12, month: 6, label: '6月 第4週', event: null, note: '' },
  { week: 13, month: 6, label: '6月 第5週', event: null, note: '' },
  { week: 14, month: 7, label: '7月 第1週', event: 'tanabata', note: '七夕' },
  { week: 15, month: 7, label: '7月 第2週', event: 'final_exam', note: '期末テスト' },
  { week: 16, month: 7, label: '7月 第3週', event: 'closing', note: '終業式' }
];

DATA.events = {
  prologue: 'prologue',
  entrance: 'entrance',
  midterm: { before: 'midterm_before', good: 'midterm_good', normal: 'midterm_normal', bad: 'midterm_bad' },
  sports_day: { before: 'sports_before', win: 'sports_win', lose: 'sports_lose' },
  tanabata: 'tanabata',
  final_exam: { before: 'final_before', good: 'final_good', normal: 'final_normal', bad: 'final_bad' },
  closing: 'closing'
};

DATA.rankComments = [
  { max: 1, text: '学年1位。掲示板の一番上に、自分の名前がある。夢じゃない。' },
  { max: 10, text: 'トップ10入り。廊下ですれ違う人の目が、ちょっと変わった気がする。' },
  { max: 30, text: '上位30位。努力はちゃんと数字になる。' },
  { max: 80, text: '真ん中より、だいぶ上。まずまずの出来。' },
  { max: 160, text: 'ちょうど真ん中あたり。可もなく不可もなく。' },
  { max: 220, text: '下から数えたほうが早い……。次はがんばろう。' },
  { max: 240, text: '赤点の文字がちらつく。補習のプリントが重い。' }
];

/* ============================================================
 * シーン
 * ============================================================ */
DATA.scenes = {};

DATA.scenes.prologue = [
  { bg: 'bedroom_day' },
  { bgm: 'title' },
  { se: 'phone_ring' },
  { say: null, text: 'ピピピ、ピピピ。枕元のスマホが、容赦なく朝を告げる。' },
  { say: 'me', text: '……あと五分……。' },
  { say: null, text: '画面には「7:48」。そして、未読のLINEが一件。' },
  { say: null, text: '【湊】おはよ。門のとこで待ってる。今日は入学式だよ、ひなた。' },
  { fx: 'shake' },
  { say: 'me', text: '……入学式！？ うそ、もうこんな時間！' },
  { say: null, text: '階段の下から、お母さんの「だから昨日早く寝なさいって言ったでしょー！」が飛んでくる。' },
  { say: null, text: '新品のブレザーに袖を通して、リボンは走りながら結ぶ。トーストは、くわえない。さすがに。' },
  { fx: 'fadewhite' },
  { bg: 'schoolgate_sakura' },
  { bgm: 'daily' },
  { say: null, text: '私立星見ヶ丘学園。坂の上の正門まで、桜のトンネルが続いている。' },
  { show: 'minato', expr: 'smile', pos: 'center' },
  { say: 'minato', text: 'あ、来た。……ひなた、寝ぐせ。右のとこ、はねてる。' },
  { say: 'me', text: 'え、うそ、どこ！？' },
  { expr: 'minato', to: 'laugh' },
  { say: 'minato', text: 'ほら、じっとして。……はい、なおった。' },
  { say: null, text: '真白 湊。となりの家の幼なじみ。保育園の頃から、こうして私の寝ぐせを直してくれる。' },
  { expr: 'minato', to: 'normal' },
  { say: 'minato', text: '同じ高校、受かってよかったね。……クラス、B組で一緒だって。' },
  { say: 'me', text: 'ほんと！？ よかったー、知ってる人いなかったらどうしようかと思ってた。' },
  { expr: 'minato', to: 'blush' },
  { say: 'minato', text: '……うん。俺も。' },
  { say: null, text: '湊が少しだけ目をそらす。風が吹いて、花びらがふたりの間をすり抜けた。' },
  { choice: [
    { text: '「これからもよろしくね、湊」', effect: { minato: 3 }, next: 'p_thanks' },
    { text: '「高校では彼氏つくるんだ、私」', effect: { minato: -1 }, next: 'p_tease' },
    { text: '「写真撮ろ！ 桜バックで！」', effect: { minato: 2 }, next: 'p_photo' }
  ] },
  { label: 'p_thanks' },
  { expr: 'minato', to: 'smile' },
  { say: 'minato', text: 'こちらこそ。……ひなたが迷子にならないように、見張っとく。' },
  { goto: 'p_end' },
  { label: 'p_tease' },
  { expr: 'minato', to: 'surprise' },
  { say: 'minato', text: '……へえ。そうなんだ。' },
  { expr: 'minato', to: 'annoyed' },
  { say: 'minato', text: 'まずは遅刻しないところから始めたら？ ほら、行くよ。' },
  { goto: 'p_end' },
  { label: 'p_photo' },
  { se: 'camera' },
  { fx: 'flash' },
  { expr: 'minato', to: 'laugh' },
  { say: 'minato', text: 'ひなた、目つぶってる。……もう一枚。今度は俺が撮る。' },
  { label: 'p_end' },
  { se: 'chime' },
  { say: null, text: '遠くでチャイムが鳴る。私の高校生活、1学期が始まる。' },
  { hide: 'minato' }
];

DATA.scenes.entrance = [
  { bg: 'gym' },
  { bgm: 'school' },
  { say: null, text: '体育館にパイプ椅子がずらりと並ぶ。校長先生の話は、桜の開花予想くらい長い。' },
  { say: null, text: '「新入生代表、1年A組、朝比奈 蒼」' },
  { show: 'aoi', expr: 'normal', pos: 'center' },
  { say: 'aoi', text: '――暖かな春の訪れとともに、私たちは星見ヶ丘学園の一員となりました。' },
  { say: null, text: '背筋の伸びた男の子が、原稿を一度も見ずに話している。すごい、暗記してるんだ。' },
  { say: null, text: 'と、その時。壇上に風が吹きこんで、彼の手元の原稿が一枚、ひらりと舞った。' },
  { fx: 'shake' },
  { say: null, text: '原稿は、よりによって最前列の私の足元に落ちてきた。' },
  { hide: 'aoi' },
  { bg: 'hallway' },
  { bgm: 'daily' },
  { say: null, text: '式が終わって、廊下。拾った原稿を手に、私はさっきの男の子を探していた。' },
  { show: 'aoi', expr: 'surprise', pos: 'center' },
  { say: 'aoi', text: '……あ。それ、僕の。' },
  { say: 'me', text: 'よかった、見つかって。はい、どうぞ。一度も見ないで話してたから、いらなかったかもだけど。' },
  { expr: 'aoi', to: 'think' },
  { say: 'aoi', text: '見ていないのではなく、見る必要がないように準備しただけです。……ですが、拾ってくれて助かりました。' },
  { say: null, text: '原稿の端に、小さくウサギの落書きがあった。……この人が？' },
  { choice: [
    { text: '「このウサギ、かわいいね」', effect: { aoi: 3 }, next: 'e_rabbit' },
    { text: '「挨拶、すごかった。かっこよかったよ」', effect: { aoi: 2 }, next: 'e_praise' },
    { text: '「暗記してたなら原稿いらなくない？」', effect: { aoi: 0 }, next: 'e_logic' }
  ] },
  { label: 'e_rabbit' },
  { expr: 'aoi', to: 'blush' },
  { say: 'aoi', text: '……っ。それは、見なかったことにしてください。緊張すると、手が勝手に。' },
  { say: 'aoi', text: '……誰にも言わないでもらえると、合理的に助かります。' },
  { goto: 'e_end' },
  { label: 'e_praise' },
  { expr: 'aoi', to: 'annoyed' },
  { say: 'aoi', text: '代表挨拶は、かっこよさを競うものではありません。' },
  { expr: 'aoi', to: 'blush' },
  { say: 'aoi', text: '……でも、まあ。ありがとう、ございます。' },
  { goto: 'e_end' },
  { label: 'e_logic' },
  { expr: 'aoi', to: 'think' },
  { say: 'aoi', text: '保険です。人間の記憶は、本番に弱い。……君は、案外鋭いんですね。' },
  { label: 'e_end' },
  { expr: 'aoi', to: 'normal' },
  { say: 'aoi', text: '1年A組、朝比奈 蒼です。生徒会に入る予定なので、何かあれば。' },
  { say: 'me', text: 'B組の春野 ひなた。よろしくね、朝比奈くん。' },
  { say: 'aoi', text: '春野さん。……覚えました。' },
  { meet: 'aoi' },
  { set: { flag: 'met_aoi' } },
  { hide: 'aoi' },
  { bg: 'classroom' },
  { show: 'friend', expr: 'laugh', pos: 'center' },
  { say: 'friend', text: 'ひなたー！ 見てたよ見てたよ、代表くんと廊下で話してたでしょ！' },
  { say: 'me', text: 'ひより！ 原稿を届けただけだってば。' },
  { expr: 'friend', to: 'wink' },
  { say: 'friend', text: 'ふーん？ ま、何かあったら七瀬ひより情報局まで。誰がひなたをどう思ってるか、ぜーんぶ調べてあげる。' },
  { say: 'friend', text: 'あ、それと。気になる人をほったらかしにすると、ろくなことにならないからね。これ、情報局からの忠告。' },
  { hide: 'friend' }
];

DATA.scenes.meet_haruto = [
  { bg: 'ground' },
  { bgm: 'daily' },
  { say: null, text: '放課後のグラウンド。ひとりでランニングの仕上げをしていると――' },
  { say: null, text: '「あぶなーい！」' },
  { fx: 'shake' },
  { se: 'pop_up' },
  { say: null, text: '足元に、サッカーボールが勢いよく転がってきた。とっさに、足で止める。' },
  { show: 'haruto', expr: 'surprise', pos: 'center' },
  { say: 'haruto', text: 'うおっ、トラップうまっ！ え、今の見た！？ 完全に止めたよな！？' },
  { say: 'me', text: 'え、あ、たまたま……。' },
  { expr: 'haruto', to: 'laugh' },
  { say: 'haruto', text: 'たまたまであれはできねーって！ 毎日ここ走ってるよな？ ずっと気になってたんだ、根性あるなーって！' },
  { say: 'haruto', text: '俺、1年C組の日向 陽翔！ サッカー部！ そっちは？' },
  { say: 'me', text: '春野 ひなた。B組。' },
  { expr: 'haruto', to: 'surprise' },
  { say: 'haruto', text: 'ひなた！？ マジ！？ 俺、名字が日向！ ひなた同士じゃん！ 運命じゃん！' },
  { choice: [
    { text: '「運命は言いすぎでしょ」', effect: { haruto: 2 }, next: 'h_calm' },
    { text: '「じゃあ、ひなたコンビだね」', effect: { haruto: 4 }, next: 'h_combo' },
    { text: '「……声、大きいね」', effect: { haruto: 1 }, next: 'h_loud' }
  ] },
  { label: 'h_calm' },
  { expr: 'haruto', to: 'smile' },
  { say: 'haruto', text: 'えー、そうか？ じゃあ偶然ってことで！ 偶然も三回続いたら運命な！' },
  { goto: 'h_end' },
  { label: 'h_combo' },
  { expr: 'haruto', to: 'laugh' },
  { say: 'haruto', text: 'それだ！ ひなたコンビ結成！ いやー、最高だわ。今日いい日だ！' },
  { goto: 'h_end' },
  { label: 'h_loud' },
  { expr: 'haruto', to: 'blush' },
  { say: 'haruto', text: 'あっ、ご、ごめん！ よく言われる。……これくらい？ これくらいなら平気？' },
  { say: null, text: '急にひそひそ声になる。その必死さが、ちょっとおかしい。' },
  { label: 'h_end' },
  { expr: 'haruto', to: 'smile' },
  { say: 'haruto', text: 'また走ってたら声かけていい？ ……って、もう聞く前にかけるけど！ じゃあな、ひなた！' },
  { meet: 'haruto' },
  { set: { flag: 'met_haruto' } },
  { hide: 'haruto' }
];

DATA.scenes.meet_ritsu = [
  { bg: 'music_room' },
  { bgm: 'night' },
  { say: null, text: '美術室からの帰り道。誰もいないはずの音楽室から、低い音が聞こえてくる。' },
  { say: null, text: 'ドアの隙間からのぞくと、窓際でひとり、男の人がベースを弾いていた。' },
  { se: 'door' },
  { say: null, text: 'ギイ、とドアが鳴る。音が、止まった。' },
  { show: 'ritsu', expr: 'normal', pos: 'center' },
  { say: 'ritsu', text: '……。' },
  { say: 'me', text: 'す、すみません！ いい音だなって思って、つい……。' },
  { expr: 'ritsu', to: 'think' },
  { say: 'ritsu', text: '……いい音、か。この曲、まだ名前がない。' },
  { say: 'ritsu', text: '君、美術部の子でしょ。毎日、手に絵の具がついてる。' },
  { say: 'me', text: 'えっ、見てたんですか。' },
  { say: 'ritsu', text: '見てた、というか。……窓から見える。同じ時間に、同じ廊下を歩いてくる。' },
  { choice: [
    { text: '「その曲、もう一回聴きたいです」', effect: { ritsu: 4 }, next: 'r_listen' },
    { text: '「……それ、ちょっと怖いです」', effect: { ritsu: 1 }, next: 'r_scary' },
    { text: '「名前、私がつけてもいいですか？」', effect: { ritsu: 3 }, next: 'r_name' }
  ] },
  { label: 'r_listen' },
  { expr: 'ritsu', to: 'smile' },
  { say: 'ritsu', text: '……変な子。いいよ。そこ、座って。' },
  { say: null, text: '低くて、少しさびしくて、でも温かい音。窓の外で、夕日がゆっくり沈んでいく。' },
  { goto: 'r_end' },
  { label: 'r_scary' },
  { expr: 'ritsu', to: 'surprise' },
  { say: 'ritsu', text: '……そうか。そうだね。ごめん。' },
  { expr: 'ritsu', to: 'smile' },
  { say: 'ritsu', text: '言い方を変える。……君が通ると、夕方だなって思う。時計みたいに。' },
  { goto: 'r_end' },
  { label: 'r_name' },
  { expr: 'ritsu', to: 'think' },
  { say: 'ritsu', text: '……考えておいて。急がなくていい。曲は、逃げないから。' },
  { label: 'r_end' },
  { expr: 'ritsu', to: 'normal' },
  { say: 'ritsu', text: '2年、神楽 律。……ここ、いつでも開いてる。鍵、壊れてるから。' },
  { say: 'me', text: '1年の春野 ひなたです。……それ、先生に言ったほうが。' },
  { say: 'ritsu', text: '言わない。……秘密は、ふたつまでなら守れる。' },
  { meet: 'ritsu' },
  { set: { flag: 'met_ritsu' } },
  { hide: 'ritsu' }
];

/* ---- 中間テスト ---- */
DATA.scenes.midterm_before = [
  { bg: 'classroom' },
  { bgm: 'tension' },
  { say: null, text: '5月の終わり。教室が、いつもよりずっと静かだ。' },
  { show: 'friend', expr: 'sad', pos: 'center' },
  { say: 'friend', text: 'ひなた……私、昨日ノート開いたら、ほぼ落書きだった……。' },
  { say: 'me', text: 'ひより、それ私のノートにもある。' },
  { expr: 'friend', to: 'laugh' },
  { say: 'friend', text: '仲間！ よし、結果は掲示板で見届けよう。骨は拾うから！' },
  { hide: 'friend' },
  { se: 'chime' },
  { say: null, text: '――中間テスト、開始。' },
  { fx: 'fadeblack' },
  { bg: 'rank_board' },
  { se: 'drumroll' },
  { say: null, text: '数日後。廊下の掲示板の前に、人だかりができている。' }
];

DATA.scenes.midterm_good = [
  { bg: 'rank_board' },
  { bgm: 'school' },
  { se: 'bell_rank' },
  { fx: 'sparkle' },
  { say: null, text: '上のほうに、自分の名前を見つけた。何度見ても、春野 ひなた。' },
  { if: { flag: 'met_aoi' }, then: 'mg_aoi', else: 'mg_minato' },
  { label: 'mg_aoi' },
  { show: 'aoi', expr: 'surprise', pos: 'right' },
  { say: 'aoi', text: '……春野さん。この順位、正直、予想外でした。' },
  { expr: 'aoi', to: 'smile' },
  { say: 'aoi', text: '訂正します。予想を上回った、です。……次の期末、少しだけ楽しみになりました。' },
  { hide: 'aoi' },
  { label: 'mg_minato' },
  { show: 'minato', expr: 'smile', pos: 'left' },
  { say: 'minato', text: 'ひなた、すごいじゃん。夜中まで電気ついてたの、知ってたよ。' },
  { say: 'minato', text: 'お祝いに、今度なにか作る。……何がいい？' },
  { hide: 'minato' }
];

DATA.scenes.midterm_normal = [
  { bg: 'rank_board' },
  { bgm: 'daily' },
  { se: 'bell_rank' },
  { say: null, text: 'まんなかあたりに、自分の名前。ほっとしたような、くやしいような。' },
  { show: 'friend', expr: 'smile', pos: 'center' },
  { say: 'friend', text: 'ひなた、平和な順位だね。私？ 私は聞かないで。世界平和のために。' },
  { hide: 'friend' },
  { show: 'minato', expr: 'normal', pos: 'center' },
  { say: 'minato', text: '次、一緒に勉強する？ ……ひなたの苦手なとこ、だいたいわかるし。' },
  { hide: 'minato' }
];

DATA.scenes.midterm_bad = [
  { bg: 'rank_board' },
  { bgm: 'sad' },
  { se: 'fail' },
  { say: null, text: '上から探して、なかなか見つからない。下から探したら、すぐ見つかった。' },
  { show: 'minato', expr: 'sad', pos: 'center' },
  { say: 'minato', text: '……ひなた。大丈夫？ 顔、まっさおだよ。' },
  { say: 'minato', text: '補習、俺も付き合うよ。……ひなたが一人でがんばるの、見てられないから。' },
  { hide: 'minato' },
  { if: { flag: 'met_aoi' }, then: 'mb_aoi', else: 'mb_end' },
  { label: 'mb_aoi' },
  { show: 'aoi', expr: 'annoyed', pos: 'right' },
  { say: 'aoi', text: '……原因は明白です。勉強時間の不足。' },
  { expr: 'aoi', to: 'think' },
  { say: 'aoi', text: '次は、図書室に来てください。放課後なら、たいてい僕がいます。……別に、教えたいわけではありませんが。' },
  { hide: 'aoi' },
  { label: 'mb_end' }
];

/* ---- 体育祭 ---- */
DATA.scenes.sports_before = [
  { bg: 'sports_day' },
  { bgm: 'festival' },
  { se: 'whistle' },
  { say: null, text: '快晴。グラウンドに万国旗がはためく。今日は星見ヶ丘学園の体育祭。' },
  { show: 'friend', expr: 'laugh', pos: 'center' },
  { say: 'friend', text: 'ひなた！ クラス対抗リレー、アンカーだよね？ ハチマキ、ちゃんと結んだ？' },
  { say: 'me', text: 'きつく結びすぎて、頭が痛い……。' },
  { expr: 'friend', to: 'wink' },
  { say: 'friend', text: '応援席から、いろんな人が見てるよー。誰がどこにいるかは、あとで教えてあげる。' },
  { hide: 'friend' },
  { if: { flag: 'met_haruto' }, then: 'sb_haruto', else: 'sb_minato' },
  { label: 'sb_haruto' },
  { show: 'haruto', expr: 'laugh', pos: 'center' },
  { say: 'haruto', text: 'ひなた！ いけるいける！ 腕ふって、前だけ見て！ ひなたコンビの名にかけて！' },
  { say: 'haruto', text: 'ゴールで待ってっから！ ……いや、俺、別のクラスだけどな！' },
  { hide: 'haruto' },
  { goto: 'sb_end' },
  { label: 'sb_minato' },
  { show: 'minato', expr: 'smile', pos: 'center' },
  { say: 'minato', text: '転ばないでね。……転んでも、俺が一番に走っていくけど。' },
  { hide: 'minato' },
  { label: 'sb_end' },
  { say: null, text: 'スタートラインに立つ。バトンが来たら、タイミングよく踏みこもう。' }
];

DATA.scenes.sports_win = [
  { bg: 'sports_day' },
  { bgm: 'festival' },
  { se: 'cheer' },
  { fx: 'flash' },
  { say: null, text: 'テープを胸で切った。歓声が、遅れて耳に届く。1位だ！' },
  { if: { flag: 'met_haruto' }, then: 'sw_haruto', else: 'sw_minato' },
  { label: 'sw_haruto' },
  { show: 'haruto', expr: 'laugh', pos: 'center' },
  { say: 'haruto', text: 'うおおおお！ 見た！？ 見たよな今の！ ひなた、めっちゃ速ぇ！' },
  { fx: 'heart' },
  { expr: 'haruto', to: 'blush' },
  { say: 'haruto', text: 'いや、ほんと……ゴールした瞬間の顔、かっこよかった。俺、ちょっと泣きそうだった。' },
  { hide: 'haruto' },
  { goto: 'sw_end' },
  { label: 'sw_minato' },
  { show: 'minato', expr: 'laugh', pos: 'center' },
  { say: 'minato', text: 'ひなた、すごい！ ……声、枯れた。応援しすぎて。' },
  { hide: 'minato' },
  { label: 'sw_end' },
  { if: { flag: 'met_aoi' }, then: 'sw_aoi', else: 'sw_done' },
  { label: 'sw_aoi' },
  { show: 'aoi', expr: 'normal', pos: 'right' },
  { say: 'aoi', text: '生徒会の記録係として、タイムは正確に記録しました。……個人的にも、覚えておきます。' },
  { hide: 'aoi' },
  { label: 'sw_done' }
];

DATA.scenes.sports_lose = [
  { bg: 'sports_day' },
  { bgm: 'sad' },
  { se: 'fail' },
  { say: null, text: 'あと一歩。前の背中に、どうしても届かなかった。' },
  { if: { flag: 'met_haruto' }, then: 'sl_haruto', else: 'sl_minato' },
  { label: 'sl_haruto' },
  { show: 'haruto', expr: 'sad', pos: 'center' },
  { say: 'haruto', text: '……くやしいよな。わかる。俺も去年、PK外したし。' },
  { expr: 'haruto', to: 'smile' },
  { say: 'haruto', text: 'でもさ、最後まで腕ふってたの、ちゃんと見てた。あれは負けた走りじゃねーよ。' },
  { hide: 'haruto' },
  { goto: 'sl_end' },
  { label: 'sl_minato' },
  { show: 'minato', expr: 'sad', pos: 'center' },
  { say: 'minato', text: '……おつかれ。ほら、スポドリ。ひなたの好きなやつ。' },
  { say: 'minato', text: '順位より、けがしなかったことのほうが、俺はうれしい。' },
  { hide: 'minato' },
  { label: 'sl_end' },
  { if: { flag: 'met_ritsu' }, then: 'sl_ritsu', else: 'sl_done' },
  { label: 'sl_ritsu' },
  { show: 'ritsu', expr: 'normal', pos: 'right' },
  { say: 'ritsu', text: '……最後の直線。足音が、いいリズムだった。曲にしていい？' },
  { hide: 'ritsu' },
  { label: 'sl_done' }
];

/* ---- 七夕 ---- */
DATA.scenes.tanabata = [
  { bg: 'shrine_tanabata' },
  { bgm: 'night' },
  { say: null, text: '7月7日。学校近くの神社で、小さな七夕まつり。笹飾りが夜風にゆれている。' },
  { show: 'friend', expr: 'smile', pos: 'center' },
  { say: 'friend', text: '短冊、何書く？ 私は「テストが消えますように」。毎年これ。叶ったことない。' },
  { say: 'me', text: 'それ、織姫さまも困ってると思う。' },
  { expr: 'friend', to: 'wink' },
  { say: 'friend', text: 'ひなたは、恋の願いでも書けば？ ……あ、あっちに知ってる顔、いるよ。行ってきな！' },
  { hide: 'friend' },
  { say: null, text: '人ごみの中で、誰と話そう。' },
  { choice: [
    { text: '笹の近くにいる湊', effect: { minato: 4 }, next: 't_minato' },
    { text: '短冊を真剣に読んでいる朝比奈くん', effect: { aoi: 4 }, next: 't_aoi' },
    { text: '屋台の前でさわいでいる陽翔くん', effect: { haruto: 4 }, next: 't_haruto' },
    { text: '石段に座っている律先輩', effect: { ritsu: 4 }, next: 't_ritsu' }
  ] },
  { label: 't_minato' },
  { show: 'minato', expr: 'surprise', pos: 'center' },
  { say: 'minato', text: 'あ、ひなた。……短冊？ 俺はもう書いた。見せないけど。' },
  { expr: 'minato', to: 'blush' },
  { say: 'minato', text: '子どもの頃から、毎年同じこと書いてる。……いつか、叶ったら教える。' },
  { fx: 'heart' },
  { hide: 'minato' },
  { goto: 't_end' },
  { label: 't_aoi' },
  { if: { flag: 'met_aoi' }, then: 't_aoi_ok', else: 't_nobody' },
  { label: 't_aoi_ok' },
  { show: 'aoi', expr: 'think', pos: 'center' },
  { say: 'aoi', text: '春野さん。……生徒会の見回りです。短冊の内容に不適切なものがないか。' },
  { say: 'me', text: 'その手に持ってる短冊は？' },
  { expr: 'aoi', to: 'blush' },
  { say: 'aoi', text: '……これは、統計のサンプルです。僕のでは、ありません。「もう少し素直に」なんて、書いていません。' },
  { fx: 'heart' },
  { hide: 'aoi' },
  { goto: 't_end' },
  { label: 't_haruto' },
  { if: { flag: 'met_haruto' }, then: 't_haruto_ok', else: 't_nobody' },
  { label: 't_haruto_ok' },
  { show: 'haruto', expr: 'laugh', pos: 'center' },
  { say: 'haruto', text: 'ひなた！ 見てこれ、ヨーヨー三つ取れた！ 一個やる！ 何色がいい？' },
  { expr: 'haruto', to: 'smile' },
  { say: 'haruto', text: '俺の短冊？ 「全国大会！」……と、もう一枚は、ひみつ。星に言うのが先。' },
  { fx: 'heart' },
  { hide: 'haruto' },
  { goto: 't_end' },
  { label: 't_ritsu' },
  { if: { flag: 'met_ritsu' }, then: 't_ritsu_ok', else: 't_nobody' },
  { label: 't_ritsu_ok' },
  { show: 'ritsu', expr: 'normal', pos: 'center' },
  { say: 'ritsu', text: '……ひなた。ここ、空が近い。' },
  { say: 'ritsu', text: '願いごとは、書かない主義。言葉にすると、少し逃げる気がして。' },
  { expr: 'ritsu', to: 'smile' },
  { say: 'ritsu', text: '……でも、今年は、ひとつくらい、いいかな。' },
  { fx: 'heart' },
  { hide: 'ritsu' },
  { goto: 't_end' },
  { label: 't_nobody' },
  { say: null, text: '……と思ったけれど、人違いだった。知らない人に、ぺこりと頭を下げる。' },
  { label: 't_end' },
  { se: 'sparkle' },
  { say: null, text: '見上げた空に、天の川がうっすら流れていた。短冊に、そっと願いを書く。' }
];

/* ---- 期末テスト ---- */
DATA.scenes.final_before = [
  { bg: 'library' },
  { bgm: 'tension' },
  { say: null, text: '7月。蝉の声と、期末テスト。夏休みの前に立ちはだかる、最後の壁。' },
  { show: 'friend', expr: 'think', pos: 'center' },
  { say: 'friend', text: '赤点だと夏休みに補習だって。海も花火も、プリントに消える。' },
  { say: 'me', text: 'それだけは絶対いや……。' },
  { hide: 'friend' },
  { se: 'chime' },
  { say: null, text: '――期末テスト、開始。' },
  { fx: 'fadeblack' },
  { bg: 'rank_board' },
  { se: 'drumroll' },
  { say: null, text: '結果発表の日。掲示板の前で、深呼吸をひとつ。' }
];

DATA.scenes.final_good = [
  { bg: 'rank_board' },
  { bgm: 'school' },
  { se: 'bell_rank' },
  { fx: 'sparkle' },
  { say: null, text: '上位に、春野 ひなたの文字。夏休みが、まぶしく見える。' },
  { if: { flag: 'met_aoi' }, then: 'fg_aoi', else: 'fg_end' },
  { label: 'fg_aoi' },
  { show: 'aoi', expr: 'smile', pos: 'center' },
  { say: 'aoi', text: '……おめでとうございます。いえ、おめでとう。' },
  { expr: 'aoi', to: 'blush' },
  { say: 'aoi', text: '君と順位が近いと、見つけやすくて、いい。……それだけです。' },
  { hide: 'aoi' },
  { label: 'fg_end' }
];

DATA.scenes.final_normal = [
  { bg: 'rank_board' },
  { bgm: 'daily' },
  { se: 'bell_rank' },
  { say: null, text: '赤点、なし。それだけで、夏休みは守られた。' },
  { show: 'friend', expr: 'laugh', pos: 'center' },
  { say: 'friend', text: 'ひなた、セーフ！ 私もセーフ！ 奇跡！ 七夕の短冊、ちょっとだけ効いた！' },
  { hide: 'friend' }
];

DATA.scenes.final_bad = [
  { bg: 'rank_board' },
  { bgm: 'sad' },
  { se: 'fail' },
  { say: null, text: '赤いペンで書かれた「補習対象者」の紙。そこに、自分の名前がある。' },
  { show: 'minato', expr: 'sad', pos: 'center' },
  { say: 'minato', text: '……補習、何日？ 俺、その日は予定入れないでおく。帰り、一緒に帰ろう。' },
  { hide: 'minato' }
];

/* ---- 終業式 ---- */
DATA.scenes.closing = [
  { bg: 'gym' },
  { bgm: 'school' },
  { say: null, text: '7月の第3週。終業式。体育館の窓の外で、入道雲がもくもくと育っている。' },
  { say: null, text: '校長先生の「節度ある夏休みを」という言葉は、たぶん誰の耳にも入っていない。' },
  { bg: 'classroom_eve' },
  { se: 'chime' },
  { show: 'friend', expr: 'laugh', pos: 'center' },
  { say: 'friend', text: 'おわったー！ 1学期、おつかれさま、ひなた！' },
  { expr: 'friend', to: 'wink' },
  { say: 'friend', text: 'で。今日は帰る前に、会っておきたい人がいるんじゃない？ ほら、行っといで。' },
  { hide: 'friend' },
  { bgm: 'ending' },
  { say: null, text: '通知表をかばんにしまって、夕焼けの廊下へ。' }
];

/* ============================================================
 * エンディング（終業式後）: DATA.endings[charId][tier]
 * ============================================================ */
DATA.endings = {
  minato: [
    [ { bg: 'schoolgate_sakura' }, { show: 'minato', expr: 'normal', pos: 'center' },
      { say: 'minato', text: 'ひなた、帰ろ。……最近、あんまり話せなかったね。' },
      { expr: 'minato', to: 'sad' },
      { say: 'minato', text: '高校に入ったら、ひなたはどんどん遠くに行っちゃう気がしてた。……当たってたかも。' },
      { say: 'minato', text: '夏休み、気が向いたら、となりの窓、ノックして。' }, { hide: 'minato' } ],
    [ { bg: 'schoolgate_sakura' }, { show: 'minato', expr: 'smile', pos: 'center' },
      { say: 'minato', text: '1学期、あっという間だったね。ひなた、ちゃんと高校生してた。' },
      { say: 'minato', text: '夏休みも、たまには一緒にアイス買いに行こう。昔みたいに。' }, { hide: 'minato' } ],
    [ { bg: 'station' }, { show: 'minato', expr: 'smile', pos: 'center' },
      { say: 'minato', text: '夏休み、何する？ 俺は、ひなたの宿題を見張る係に立候補しとく。' },
      { expr: 'minato', to: 'laugh' },
      { say: 'minato', text: 'あと、花火。今年も、うちのベランダから見えるよ。' }, { hide: 'minato' } ],
    [ { bg: 'classroom_eve' }, { show: 'minato', expr: 'blush', pos: 'center' },
      { say: 'minato', text: 'ひなた。……高校に入って、ひなたのこと、知らない人がどんどん知っていくのが、ちょっとだけ、いやだった。' },
      { say: 'minato', text: '幼なじみのくせに、変だよね。……夏祭り、一緒に行ってくれる？ 今年は、ふたりで。' },
      { fx: 'heart' }, { hide: 'minato' } ],
    [ { bg: 'rooftop' }, { bgm: 'heartbeat' }, { show: 'minato', expr: 'blush', pos: 'center' },
      { say: 'minato', text: '七夕の短冊。毎年同じこと書いてるって言ったでしょ。' },
      { say: 'minato', text: '「ひなたの一番近くに、ずっといられますように」。……保育園の頃から、ずっと。' },
      { fx: 'heart' },
      { expr: 'minato', to: 'smile' },
      { say: 'minato', text: '幼なじみ、そろそろ卒業したいんだけど。……返事は、夏休みの間に。待ってる。' },
      { hide: 'minato' } ]
  ],
  aoi: [
    [ { bg: 'hallway' }, { show: 'aoi', expr: 'normal', pos: 'center' },
      { say: 'aoi', text: '春野さん。1学期、おつかれさまでした。' },
      { say: 'aoi', text: '……生徒会の仕事があるので、これで。良い夏休みを。' }, { hide: 'aoi' } ],
    [ { bg: 'hallway' }, { show: 'aoi', expr: 'smile', pos: 'center' },
      { say: 'aoi', text: '夏休みの課題、計画表は作りましたか？ ……作っていない顔ですね。' },
      { say: 'aoi', text: 'テンプレート、送っておきます。LINEで。' }, { hide: 'aoi' } ],
    [ { bg: 'library' }, { show: 'aoi', expr: 'smile', pos: 'center' },
      { say: 'aoi', text: '夏休みも、図書室は開いています。僕は火曜と木曜に来る予定です。' },
      { expr: 'aoi', to: 'blush' },
      { say: 'aoi', text: '……いえ、深い意味は。ただの、情報提供です。' }, { hide: 'aoi' } ],
    [ { bg: 'classroom_eve' }, { show: 'aoi', expr: 'blush', pos: 'center' },
      { say: 'aoi', text: '春野さん……いえ。ひなた、と呼んでもいいですか。' },
      { say: 'aoi', text: '合理的な理由はありません。ただ、そう呼びたいと思った。……それだけ、です。' },
      { fx: 'heart' }, { hide: 'aoi' } ],
    [ { bg: 'rooftop' }, { bgm: 'heartbeat' }, { show: 'aoi', expr: 'think', pos: 'center' },
      { say: 'aoi', text: 'ひなた。この1学期、僕の予定表は、君のせいで何度も書き換えになりました。' },
      { expr: 'aoi', to: 'blush' },
      { say: 'aoi', text: '最初は困っていました。今は……書き換えられるのを、待っている。' },
      { fx: 'heart' },
      { say: 'aoi', text: '夏休みの予定表、一番上の欄を、空けてあります。……君の名前を書かせてください。' },
      { hide: 'aoi' } ]
  ],
  haruto: [
    [ { bg: 'ground' }, { show: 'haruto', expr: 'normal', pos: 'center' },
      { say: 'haruto', text: 'お、ひなた。夏休みか〜。俺はほぼ毎日練習！' },
      { say: 'haruto', text: '……最近あんま話せてなかったな。ま、また声かけるわ！' }, { hide: 'haruto' } ],
    [ { bg: 'ground' }, { show: 'haruto', expr: 'laugh', pos: 'center' },
      { say: 'haruto', text: 'ひなた！ 夏休み、練習試合あるから見に来てよ！ ゴール決めたら、そっち指さすから！' }, { hide: 'haruto' } ],
    [ { bg: 'station' }, { show: 'haruto', expr: 'smile', pos: 'center' },
      { say: 'haruto', text: '海行こうぜ、海！ ひよりも誘ってさ、みんなで！' },
      { expr: 'haruto', to: 'blush' },
      { say: 'haruto', text: '……いや、みんなで、ってのは、まあ、半分建前っつーか。' }, { hide: 'haruto' } ],
    [ { bg: 'ground' }, { show: 'haruto', expr: 'blush', pos: 'center' },
      { say: 'haruto', text: 'ひなた。俺、声でかいってよく言われるけどさ。' },
      { say: 'haruto', text: 'ひなたの前だと、なんか、うまく出ねえんだよ。……夏休み、二人で花火、行かない？' },
      { fx: 'heart' }, { hide: 'haruto' } ],
    [ { bg: 'ground' }, { bgm: 'heartbeat' }, { show: 'haruto', expr: 'blush', pos: 'center' },
      { say: 'haruto', text: '偶然も三回続いたら運命、って言ったの、覚えてる？' },
      { say: 'haruto', text: '数えてたんだ。もう、三回どころじゃない。' },
      { fx: 'heart' },
      { expr: 'haruto', to: 'smile' },
      { say: 'haruto', text: '好きだ、ひなた。……あー、言った！ 言っちまった！ 夏休み、全部俺にくれ！' },
      { hide: 'haruto' } ]
  ],
  ritsu: [
    [ { bg: 'music_room' }, { show: 'ritsu', expr: 'normal', pos: 'center' },
      { say: 'ritsu', text: '……夏休み。音楽室、しばらく閉まる。' },
      { say: 'ritsu', text: 'じゃあ。……また、秋に。' }, { hide: 'ritsu' } ],
    [ { bg: 'music_room' }, { show: 'ritsu', expr: 'smile', pos: 'center' },
      { say: 'ritsu', text: '夏休み、ライブハウスで一回だけ弾く。……チケット、余ってる。一枚。' }, { hide: 'ritsu' } ],
    [ { bg: 'music_room' }, { show: 'ritsu', expr: 'smile', pos: 'center' },
      { say: 'ritsu', text: 'あの曲、少しだけ形になった。……サビのところ、君の笑い方に似てる。' },
      { say: 'ritsu', text: '夏休みの間に、完成させる。聴きにきて。' }, { hide: 'ritsu' } ],
    [ { bg: 'rooftop' }, { show: 'ritsu', expr: 'blush', pos: 'center' },
      { say: 'ritsu', text: '秘密は、ふたつまでなら守れるって言った。' },
      { say: 'ritsu', text: 'ひとつめは、音楽室の鍵。……ふたつめは、君のことを、よく考えてるってこと。' },
      { fx: 'heart' }, { hide: 'ritsu' } ],
    [ { bg: 'music_room' }, { bgm: 'heartbeat' }, { show: 'ritsu', expr: 'normal', pos: 'center' },
      { say: 'ritsu', text: 'ひなた。曲、できた。' },
      { say: null, text: '低い音がひとつ、鳴る。春の夕方の、あの音。' },
      { expr: 'ritsu', to: 'blush' },
      { say: 'ritsu', text: 'タイトル、君につけてほしいって言ったけど。……やっぱり、俺がつける。「ひなた」。' },
      { fx: 'heart' },
      { say: 'ritsu', text: '……それで、伝わる？' },
      { hide: 'ritsu' } ]
  ]
};

DATA.reportCard = {
  minato: ['となりの家、なのに少し遠い。', '昔と変わらない、安心できる人。', 'いつも隣にいるのが当たり前の人。', '当たり前、じゃなくなってきた人。', '幼なじみ、では足りなくなった人。'],
  aoi: ['入学式で原稿を拾った人。', '勉強の頼れる相談相手。', '図書室で会うと、少しうれしい人。', 'ときどき敬語が抜ける人。', '予定表の一番上にいたい人。'],
  haruto: ['やたら声の大きい人。', 'ひなたコンビの相方。', '一緒にいると、つい笑ってしまう人。', '声が小さくなると、どきっとする人。', '夏いちばん、会いたい人。'],
  ritsu: ['音楽室の、謎の先輩。', 'ベースの音が優しい先輩。', '言葉少なに、見ていてくれる人。', '秘密をひとつ、わけてくれた人。', 'まだ名前のない曲を、一緒に待ちたい人。']
};

/* ============================================================
 * ランダムイベント
 * ============================================================ */
DATA.random = [
  { id: 'umbrella', cond: { met: 'minato', months: [6], chance: 0.35 }, scene: [
    { bg: 'schoolgate_sakura' }, { bgm: 'date_calm' },
    { say: null, text: '下校時刻、急な雨。傘、忘れた。昇降口で途方にくれていると――' },
    { show: 'minato', expr: 'normal', pos: 'center' },
    { say: 'minato', text: 'ひなた。やっぱり忘れてた。天気予報、朝LINEしたのに。' },
    { say: 'minato', text: '入って。……肩、濡れるから、もうちょっとこっち。' },
    { choice: [
      { text: '素直にくっつく', effect: { minato: 4 }, next: 'u_close' },
      { text: '「湊の肩が濡れてるよ」', effect: { minato: 3 }, next: 'u_care' },
      { text: '「走って帰るから大丈夫！」', effect: { minato: -1 }, next: 'u_run' }
    ] },
    { label: 'u_close' }, { expr: 'minato', to: 'blush' },
    { say: 'minato', text: '……近い。いや、近くていいんだけど。……心臓の音、聞こえてない？' },
    { fx: 'heart' }, { goto: 'u_end' },
    { label: 'u_care' }, { expr: 'minato', to: 'smile' },
    { say: 'minato', text: 'いいの。ひなたが濡れるより、ずっといい。' }, { goto: 'u_end' },
    { label: 'u_run' }, { expr: 'minato', to: 'annoyed' },
    { say: 'minato', text: '風邪ひいたら、看病しに行くのは俺なんだけど。……ほら、入って。' },
    { label: 'u_end' }, { hide: 'minato' }
  ] },
  { id: 'bread', cond: { met: 'haruto', chance: 0.35 }, scene: [
    { bg: 'hallway' }, { bgm: 'daily' },
    { say: null, text: '昼休みの購買。ラスト一個の焼きそばパンに手を伸ばしたら、もう一つの手と重なった。' },
    { show: 'haruto', expr: 'surprise', pos: 'center' },
    { say: 'haruto', text: 'あっ、ひなた！ ……うわ、これ最後の一個か。' },
    { expr: 'haruto', to: 'smile' },
    { say: 'haruto', text: 'いいよ、やる！ 俺、練習前に食うもん他にも……いや、ない。ないけど、いい！' },
    { choice: [
      { text: '「半分こしよう」', effect: { haruto: 5 }, next: 'b_half' },
      { text: 'ありがたくもらう', effect: { haruto: 1 }, next: 'b_take' },
      { text: '「練習がんばって」と譲る', effect: { haruto: 3 }, next: 'b_give' }
    ] },
    { label: 'b_half' }, { expr: 'haruto', to: 'laugh' },
    { say: 'haruto', text: '天才か！ ……うまっ。半分こすると、なんでこんなうまいんだろ。' },
    { fx: 'heart' }, { goto: 'b_end' },
    { label: 'b_take' }, { expr: 'haruto', to: 'sad' },
    { say: 'haruto', text: 'お、おう！ 味わって食えよ！ ……俺の腹、鳴ってないからな！' }, { goto: 'b_end' },
    { label: 'b_give' }, { expr: 'haruto', to: 'blush' },
    { say: 'haruto', text: 'マジで！？ ……よし、今日の練習、ひなたのために一点決める。' },
    { label: 'b_end' }, { hide: 'haruto' }
  ] },
  { id: 'library_shelf', cond: { met: 'aoi', param: { culture: 20 }, chance: 0.4 }, scene: [
    { bg: 'library' }, { bgm: 'date_calm' },
    { say: null, text: '図書室の一番上の棚。読みたい本に、あと少しで手が届かない。つま先立ちで、ぷるぷる。' },
    { show: 'aoi', expr: 'annoyed', pos: 'center' },
    { say: 'aoi', text: '……見ていられません。どれですか。' },
    { say: null, text: 'すっと伸びた腕が、背中越しに本を取る。思ったより、ずっと近い。' },
    { expr: 'aoi', to: 'surprise' },
    { say: 'aoi', text: '……この本。僕も、先週読みました。' },
    { choice: [
      { text: '「感想、聞かせて」', effect: { aoi: 4 }, next: 'l_talk' },
      { text: '「ネタバレ禁止だよ」', effect: { aoi: 2 }, next: 'l_spoil' },
      { text: '「近かったね、今」', effect: { aoi: 3 }, next: 'l_near' }
    ] },
    { label: 'l_talk' }, { expr: 'aoi', to: 'smile' },
    { say: 'aoi', text: '読み終わったら、にしましょう。……君がどう思うか、先に知りたいので。' }, { goto: 'l_end' },
    { label: 'l_spoil' }, { expr: 'aoi', to: 'think' },
    { say: 'aoi', text: '言いません。……三章の終わりで、泣かないように、とだけ。' }, { goto: 'l_end' },
    { label: 'l_near' }, { expr: 'aoi', to: 'blush' },
    { say: 'aoi', text: '……っ。物理的な距離の話ですね。はい。近かったです。以上です。' },
    { fx: 'heart' },
    { label: 'l_end' }, { hide: 'aoi' }
  ] },
  { id: 'earphone', cond: { met: 'ritsu', chance: 0.35 }, scene: [
    { bg: 'station' }, { bgm: 'night' },
    { say: null, text: '駅のホーム。ベンチの下に、ワイヤレスイヤホンが片方だけ落ちている。' },
    { show: 'ritsu', expr: 'think', pos: 'center' },
    { say: 'ritsu', text: '……あ。それ、たぶん俺の。さっきから、世界が片耳だった。' },
    { say: 'me', text: 'はい、どうぞ。……何、聴いてたんですか？' },
    { expr: 'ritsu', to: 'normal' },
    { say: 'ritsu', text: '……聴く？ 片方ずつ。' },
    { choice: [
      { text: '片方を受け取る', effect: { ritsu: 5 }, next: 'ea_listen' },
      { text: '「曲名だけ教えてください」', effect: { ritsu: 2 }, next: 'ea_name' },
      { text: '「電車、来ちゃいます」', effect: { ritsu: 0 }, next: 'ea_train' }
    ] },
    { label: 'ea_listen' },
    { say: null, text: '古いジャズ。ウッドベースの音が、同じタイミングで二人の耳に流れる。' },
    { expr: 'ritsu', to: 'smile' },
    { say: 'ritsu', text: '……同じ音を聴いてるって、ちょっと、変な感じ。いい意味で。' },
    { fx: 'heart' }, { goto: 'ea_end' },
    { label: 'ea_name' }, { expr: 'ritsu', to: 'smile' },
    { say: 'ritsu', text: '……あとで、送る。プレイリストごと。' }, { goto: 'ea_end' },
    { label: 'ea_train' }, { expr: 'ritsu', to: 'normal' },
    { say: 'ritsu', text: '……うん。また。' },
    { label: 'ea_end' }, { hide: 'ritsu' }
  ] },
  { id: 'heatstroke', cond: { months: [6, 7], chance: 0.3 }, scene: [
    { bg: 'classroom' }, { bgm: 'date_calm' },
    { say: null, text: '体育のあと、急に視界がぐらりとゆれた。気づいたら、保健室のベッドの上。' },
    { if: { aff: { minato: { gte: 40 } } }, then: 'hs_minato', else: 'hs_check_haruto' },
    { label: 'hs_check_haruto' },
    { if: { flag: 'met_haruto' }, then: 'hs_haruto', else: 'hs_friend' },
    { label: 'hs_minato' },
    { show: 'minato', expr: 'sad', pos: 'center' },
    { say: 'minato', text: '……起きた？ よかった。ひなた、熱中症だって。' },
    { say: 'minato', text: '水、ちゃんと飲んでって朝も言ったのに。……心配、させないで。ほんとに。' },
    { expr: 'minato', to: 'blush' },
    { say: 'minato', text: '先生が戻るまで、ここにいる。手、冷たいタオルで冷やすね。' },
    { fx: 'heart' }, { hide: 'minato' }, { goto: 'hs_end' },
    { label: 'hs_haruto' },
    { show: 'haruto', expr: 'surprise', pos: 'center' },
    { say: 'haruto', text: 'ひなた！ 目、覚めた！？ よかったー……！ 俺、ここまでおんぶして走ってきた！' },
    { expr: 'haruto', to: 'blush' },
    { say: 'haruto', text: '……あ、いや、変な意味じゃなくて！ 緊急だったから！ ほら、スポドリ！ 飲め！' },
    { fx: 'heart' }, { hide: 'haruto' }, { goto: 'hs_end' },
    { label: 'hs_friend' },
    { show: 'friend', expr: 'sad', pos: 'center' },
    { say: 'friend', text: 'ひなたぁ……よかった、起きた。今日はもう無理しないで、帰ったら寝ること！' },
    { hide: 'friend' },
    { label: 'hs_end' },
    { say: null, text: '窓の外で蝉が鳴いている。今日は、ゆっくり休もう。' }
  ] },
  { id: 'bike', cond: { met: 'minato', weekMin: 3, chance: 0.3 }, scene: [
    { bg: 'classroom_eve' }, { bgm: 'date_calm' },
    { say: null, text: '委員会で遅くなった帰り道。校門を出ると、自転車にまたがった湊が待っていた。' },
    { show: 'minato', expr: 'smile', pos: 'center' },
    { say: 'minato', text: 'おつかれ。……乗ってく？ 後ろ。先生には内緒で。' },
    { choice: [
      { text: '後ろに乗る', effect: { minato: 4 }, next: 'bk_ride' },
      { text: '「押して、歩いて帰ろう」', effect: { minato: 3 }, next: 'bk_walk' },
      { text: '「二人乗りは校則違反です」', effect: { minato: 0 }, next: 'bk_rule' }
    ] },
    { label: 'bk_ride' },
    { say: null, text: '夕焼けの下り坂。風が気持ちいい。湊の背中が、いつの間にかこんなに広い。' },
    { expr: 'minato', to: 'blush' },
    { say: 'minato', text: '……ちゃんとつかまってて。落ちたら、困る。……俺が。' },
    { fx: 'heart' }, { goto: 'bk_end' },
    { label: 'bk_walk' }, { expr: 'minato', to: 'laugh' },
    { say: 'minato', text: 'そっちのほうが、ゆっくり話せるね。……ひなた、今日あったこと、全部聞かせて。' }, { goto: 'bk_end' },
    { label: 'bk_rule' }, { expr: 'minato', to: 'annoyed' },
    { say: 'minato', text: '……朝比奈くんみたいなこと言う。はいはい、歩きます。' },
    { label: 'bk_end' }, { hide: 'minato' }
  ] },
  { id: 'rooftop_lunch', cond: { met: 'ritsu', param: { art: 40 }, chance: 0.3 }, scene: [
    { bg: 'rooftop' }, { bgm: 'date_calm' },
    { say: null, text: '昼休み、ひとりになりたくて屋上へ。先客がいた。フェンスにもたれて、空を見ている。' },
    { show: 'ritsu', expr: 'normal', pos: 'center' },
    { say: 'ritsu', text: '……ここ、立ち入り禁止。' },
    { say: 'me', text: '先輩もいるじゃないですか。' },
    { expr: 'ritsu', to: 'smile' },
    { say: 'ritsu', text: 'うん。だから、共犯。……メロンパン、半分いる？' },
    { choice: [
      { text: '「いただきます」と隣に座る', effect: { ritsu: 4 }, next: 'rl_sit' },
      { text: '「雲、何に見えます？」', effect: { ritsu: 3 }, next: 'rl_cloud' }
    ] },
    { label: 'rl_sit' },
    { say: null, text: '風の音だけの、静かな昼休み。話さなくても、気まずくない。' },
    { say: 'ritsu', text: '……こういうの、久しぶり。' }, { goto: 'rl_end' },
    { label: 'rl_cloud' }, { expr: 'ritsu', to: 'think' },
    { say: 'ritsu', text: '……四分音符。あっちは、休符。君は？' },
    { say: 'me', text: 'クジラです。' },
    { expr: 'ritsu', to: 'laugh' },
    { say: 'ritsu', text: '……それ、いいね。負けた。' },
    { label: 'rl_end' }, { fx: 'heart' }, { hide: 'ritsu' }
  ] },
  { id: 'council_help', cond: { met: 'aoi', weekMin: 4, chance: 0.3 }, scene: [
    { bg: 'classroom_eve' }, { bgm: 'daily' },
    { say: null, text: '放課後の教室。朝比奈くんが、山のようなプリントをひとりでホチキス留めしている。' },
    { show: 'aoi', expr: 'think', pos: 'center' },
    { say: 'aoi', text: '……春野さん。生徒会便り、300部です。ひとりでやれば一時間十五分。' },
    { choice: [
      { text: '「ふたりなら四十分くらい？」と手伝う', effect: { aoi: 5, stress: 3 }, next: 'ch_help' },
      { text: 'コンビニのプリンを差し入れる', effect: { aoi: 4 }, next: 'ch_pudding' },
      { text: '「がんばってね」と帰る', effect: { aoi: -1 }, next: 'ch_leave' }
    ] },
    { label: 'ch_help' }, { expr: 'aoi', to: 'smile' },
    { say: 'aoi', text: '三十八分でした。……君と組むと、効率がいい。記録しておきます。' }, { goto: 'ch_end' },
    { label: 'ch_pudding' }, { expr: 'aoi', to: 'blush' },
    { say: 'aoi', text: '……なぜ、僕がプリンを好きだと。いえ、好きとは言っていません。いただきます。' },
    { fx: 'heart' }, { goto: 'ch_end' },
    { label: 'ch_leave' }, { expr: 'aoi', to: 'normal' },
    { say: 'aoi', text: 'はい。……気をつけて。' },
    { label: 'ch_end' }, { hide: 'aoi' }
  ] }
];

/* ============================================================
 * デート会話プール
 * ============================================================ */
DATA.dateTalks = {
  minato: [
    { q: [ { expr: 'minato', to: 'normal' }, { say: 'minato', text: 'ねえ、ひなた。高校、楽しい？ ……俺がいなくても、平気そう？' } ],
      choices: [
        { text: '「湊がいるから楽しいんだよ」', delta: 6, expr: 'blush', reply: '……ずるい。そういうの、急に言うの。' },
        { text: '「うん、友達もいっぱいできた！」', delta: 1, expr: 'sad', reply: 'そっか。……よかった。ほんとに、よかった。' },
        { text: '「湊こそ、平気なの？」', delta: 3, expr: 'think', reply: '……平気じゃない、って言ったら、困る？' } ] },
    { q: [ { expr: 'minato', to: 'smile' }, { say: 'minato', text: '今度のお弁当、何入れてほしい？ 卵焼きは甘いの、だよね。' } ],
      choices: [
        { text: '「湊の唐揚げ、世界一」', delta: 5, expr: 'laugh', reply: 'じゃあ、世界一のやつ、ちゃんと作る。朝五時起きで。' },
        { text: '「しょっぱい卵焼きに目覚めたかも」', delta: 2, expr: 'surprise', reply: 'え、いつの間に。……俺の知らないひなたが増えてく。' },
        { text: '「作ってもらうの悪いよ」', delta: 0, expr: 'sad', reply: '悪くないよ。……俺が作りたいだけ、なんだけど。' } ] },
    { q: [ { expr: 'minato', to: 'think' }, { say: 'minato', text: '昔さ、ひなたが公園で迷子になったの、覚えてる？ すべり台の下で泣いてた。' } ],
      choices: [
        { text: '「湊が見つけてくれたんだよね」', delta: 5, expr: 'smile', reply: 'うん。……あの時から、ひなたを探すのは、俺の役目。' },
        { text: '「泣いてないし！」', delta: 2, expr: 'laugh', reply: '泣いてた。鼻水も出てた。写真、お母さんが持ってる。' },
        { text: '「そんな昔のこと忘れちゃった」', delta: -2, expr: 'sad', reply: '……そっか。俺は、けっこう覚えてるんだけどな。' } ] },
    { q: [ { expr: 'minato', to: 'normal' }, { say: 'minato', text: '最近、他のクラスの男子と話してるよね。……いや、別に、聞いてみただけ。' } ],
      choices: [
        { text: '「気になるの？」とからかう', delta: 3, expr: 'blush', reply: '……気になるよ。悪い？' },
        { text: '「ただの友達だよ」', delta: 4, expr: 'smile', reply: 'そっか。……ならいい。って、俺が言うことじゃないか。' },
        { text: '「湊には関係ないでしょ」', delta: -4, expr: 'sad', reply: '……うん。そうだね。ごめん。' } ] },
    { q: [ { expr: 'minato', to: 'smile' }, { say: 'minato', text: 'ひなたって、どんなところが好き？ 場所の話。……俺は、静かなとこ。' } ],
      choices: [
        { text: '「湊と一緒ならどこでも」', delta: 5, expr: 'blush', reply: '……答えになってない。でも、それでいい。' },
        { text: '「にぎやかなとこ！」', delta: 1, expr: 'think', reply: 'じゃあ、今度は俺が合わせる番だね。耳栓持ってく。' },
        { text: '「海の底みたいな、青いとこ」', delta: 4, expr: 'smile', reply: 'わかる。水族館の、あの青い部屋。俺もあそこが一番好き。' } ] },
    { q: [ { expr: 'minato', to: 'think' }, { say: 'minato', text: 'ひなた、最近がんばりすぎてない？ ちゃんと寝てる？' } ],
      choices: [
        { text: '「湊に言われると、休もうって思える」', delta: 5, expr: 'smile', reply: 'じゃあ、毎日言う。夜十一時に、LINEで「寝ろ」って。' },
        { text: '「平気平気、若いから！」', delta: 1, expr: 'annoyed', reply: '同い年でしょ。……ほんとに心配してるんだけど。' },
        { text: '「お母さんみたい」', delta: -1, expr: 'annoyed', reply: 'お母さんじゃない。……そこ、ちゃんと区別して。' } ] }
  ],
  aoi: [
    { q: [ { expr: 'aoi', to: 'think' }, { say: 'aoi', text: '春野さん。週に何時間、勉強していますか。……いえ、効率の参考までに。' } ],
      choices: [
        { text: '「朝比奈くんに勝てるくらい」', delta: 5, expr: 'smile', reply: '……宣戦布告ですね。受けて立ちます。' },
        { text: '「えっと……ひみつ」', delta: 1, expr: 'annoyed', reply: '秘密にするほどの時間、ということですね。把握しました。' },
        { text: '「一緒に勉強したら増えるかも」', delta: 4, expr: 'blush', reply: '……それは、効率的な提案です。採用します。' } ] },
    { q: [ { expr: 'aoi', to: 'normal' }, { say: 'aoi', text: '……甘いものは、好きですか。僕は、別に。人並みです。' } ],
      choices: [
        { text: '「プリン食べてるとこ見たよ」', delta: 3, expr: 'blush', reply: '……っ。記憶違いです。あれは、カスタードの研究です。' },
        { text: '「好き！ 今度おすすめ教えて」', delta: 5, expr: 'smile', reply: '駅前の店の、固めのプリンです。……人並みの知識として。' },
        { text: '「私は辛いほうが好き」', delta: 0, expr: 'think', reply: 'そうですか。……価値観の違いは、議論の出発点です。' } ] },
    { q: [ { expr: 'aoi', to: 'think' }, { say: 'aoi', text: '生徒会、向いていないと言われました。愛想がない、と。' } ],
      choices: [
        { text: '「朝比奈くんは、ちゃんと優しいよ」', delta: 6, expr: 'blush', reply: '……根拠のない評価は、受け取らない主義です。……でも、今のは、保存しておきます。' },
        { text: '「笑う練習する？」', delta: 2, expr: 'annoyed', reply: '……こう、ですか。……なぜ笑うんですか。君が笑ってどうするんですか。' },
        { text: '「たしかに愛想はないかも」', delta: -2, expr: 'sad', reply: '……自覚はあります。わざわざ言わなくても。' } ] },
    { q: [ { expr: 'aoi', to: 'normal' }, { say: 'aoi', text: '最近読んだ本で、印象に残ったものはありますか。' } ],
      choices: [
        { text: '最近読んだ小説の話をする', delta: 5, expr: 'smile', reply: 'その作家、次の作品も良いですよ。……貸します。付箋は、はがさないでください。' },
        { text: '「マンガならいっぱい！」', delta: 1, expr: 'think', reply: '……マンガも本です。僕の知らない分野なので、むしろ教えてください。' },
        { text: '「本、あんまり読まなくて」', delta: -1, expr: 'annoyed', reply: 'もったいない。……図書室で、おすすめを三冊選んでおきます。' } ] },
    { q: [ { expr: 'aoi', to: 'surprise' }, { say: 'aoi', text: '……春野さんは、なぜ僕と出かけてくれるんですか。僕は、話していて楽しい人間では。' } ],
      choices: [
        { text: '「楽しいよ。すごく」', delta: 6, expr: 'blush', reply: '……そう、ですか。……では、僕も、そう思うことにします。楽しい、です。' },
        { text: '「勉強教えてもらえるから」', delta: -2, expr: 'sad', reply: '……合理的な理由ですね。はい。わかっていました。' },
        { text: '「知りたいから、朝比奈くんのこと」', delta: 5, expr: 'surprise', reply: '僕のことを……？ 変わった研究テーマですね。……協力、します。' } ] },
    { q: [ { expr: 'aoi', to: 'think' }, { say: 'aoi', text: '将来の夢はありますか。僕は、決めています。……まだ、誰にも言っていませんが。' } ],
      choices: [
        { text: '「聞いてもいい？」', delta: 5, expr: 'blush', reply: '……絵本作家です。笑わないでください。……ウサギの話を、描きたい。' },
        { text: '「すごい、私はまだ全然」', delta: 3, expr: 'smile', reply: 'それでいいと思います。まだ、1学期ですから。一緒に考えましょう。' },
        { text: '「どうせ官僚とかでしょ」', delta: -2, expr: 'annoyed', reply: '……決めつけは、よくないです。教えるのは、やめておきます。' } ] }
  ],
  haruto: [
    { q: [ { expr: 'haruto', to: 'laugh' }, { say: 'haruto', text: 'なあひなた！ 好きな食べもの何？ 俺はカツ丼！ 試合の前は絶対カツ丼！' } ],
      choices: [
        { text: '「私もカツ丼、大好き！」', delta: 5, expr: 'laugh', reply: 'マジで！？ 今度、部活帰りのカツ丼屋、連れてく！ 大盛り無料なんだぜ！' },
        { text: '「パンケーキかな」', delta: 2, expr: 'surprise', reply: 'パンケーキ！ 食ったことない！ ……え、今度一緒に行ったら、ダメ？' },
        { text: '「験担ぎ、効いてるの？」', delta: 1, expr: 'think', reply: '……言われてみれば、先週負けたな。いや、効いてる！ 気持ちが！' } ] },
    { q: [ { expr: 'haruto', to: 'smile' }, { say: 'haruto', text: '今度の試合さ、見に来てくれたら、たぶん俺、いつもの三倍走れる。' } ],
      choices: [
        { text: '「絶対行く！ 応援うちわ作る！」', delta: 6, expr: 'blush', reply: 'う、うちわ！？ ……やばい、今から顔あっつい。名前、でっかく書いて。' },
        { text: '「行けたらね」', delta: 0, expr: 'sad', reply: '行けたら、かー……。うん、行けたら、でいい。待ってる。' },
        { text: '「三倍走ったらバテるよ」', delta: 2, expr: 'laugh', reply: 'そこ冷静！ じゃあ二倍！ 二倍で許して！' } ] },
    { q: [ { expr: 'haruto', to: 'sad' }, { say: 'haruto', text: '……実はさ、この前の練習試合、俺のミスで負けたんだ。みんな、気にすんなって言うけど。' } ],
      choices: [
        { text: '黙ってとなりに座る', delta: 5, expr: 'smile', reply: '……ありがと。なんか、何も言われないほうが、楽だった。' },
        { text: '「次で取り返せばいいよ！」', delta: 3, expr: 'laugh', reply: 'だよな！ よっしゃ、明日から朝練増やす！ ……ひなたに言われると効くわ。' },
        { text: '「そういう日もあるって」', delta: 1, expr: 'normal', reply: '……うん。そうだよな。' } ] },
    { q: [ { expr: 'haruto', to: 'think' }, { say: 'haruto', text: 'ひなたってさ、俺のこと、うるさいって思ってる？ ……正直に！' } ],
      choices: [
        { text: '「元気もらえるから好き」', delta: 6, expr: 'blush', reply: 'す、好き……！？ あ、元気が、ね！ 元気がね！ わかってる！' },
        { text: '「ちょっとだけ」', delta: 2, expr: 'laugh', reply: 'ちょっとだけ！ セーフ！ 俺にしては上出来！' },
        { text: '「かなり」', delta: -1, expr: 'sad', reply: 'だよなー……。今日は音量、半分でいくわ……。' } ] },
    { q: [ { expr: 'haruto', to: 'smile' }, { say: 'haruto', text: '夏休みになったら、何したい？ 俺、スイカ割りと花火と、あと全部！' } ],
      choices: [
        { text: '「全部やろう、一緒に」', delta: 6, expr: 'laugh', reply: '言ったな！？ 約束な！ スクショしとく、今の顔ごと！' },
        { text: '「宿題……」', delta: 0, expr: 'annoyed', reply: 'その単語は禁止！ 夏が逃げる！' },
        { text: '「海で夕日見たいな」', delta: 4, expr: 'blush', reply: '夕日か……。いいな、それ。……ひなたと見たら、絶対きれいだ。' } ] },
    { q: [ { expr: 'haruto', to: 'normal' }, { say: 'haruto', text: 'なあ、俺のこと、名前で呼んでみてよ。陽翔って。' } ],
      choices: [
        { text: '「……陽翔」', delta: 6, expr: 'blush', reply: '……。やべ。今のは、やばい。ちょっと待って、顔見ないで。' },
        { text: '「日向くん」', delta: 1, expr: 'sad', reply: 'ひなたが日向くんって呼ぶの、ややこしくね！？ ……まあ、いいけどさ。' },
        { text: '「はるるん」', delta: 3, expr: 'laugh', reply: 'はるるん！？ 部のやつらに聞かれたら死ぬ！ ……でも、ひなた限定なら、いい。' } ] }
  ],
  ritsu: [
    { q: [ { expr: 'ritsu', to: 'think' }, { say: 'ritsu', text: '……好きな音、ある？ 楽器じゃなくても。' } ],
      choices: [
        { text: '「雨が窓に当たる音」', delta: 5, expr: 'smile', reply: '……わかる。あれ、ちょっとだけスウィングしてる。' },
        { text: '「先輩のベースの音」', delta: 6, expr: 'blush', reply: '……それは、ずるい答え。……うれしいけど。' },
        { text: '「目覚ましの音はきらいです」', delta: 2, expr: 'laugh', reply: '……ふっ。それは、全人類そう。' } ] },
    { q: [ { expr: 'ritsu', to: 'normal' }, { say: 'ritsu', text: '俺、話すの、得意じゃない。……退屈じゃない？' } ],
      choices: [
        { text: '「黙ってる時間も好きです」', delta: 6, expr: 'smile', reply: '……そういうこと言える人、あんまりいない。' },
        { text: '「もっと話してほしいです」', delta: 3, expr: 'think', reply: '……努力する。……今のは、努力の一回目。' },
        { text: '「ちょっと退屈かも」', delta: -3, expr: 'sad', reply: '……そう。ごめん。' } ] },
    { q: [ { expr: 'ritsu', to: 'think' }, { say: 'ritsu', text: '……もし、明日世界が終わるなら、最後に何する？' } ],
      choices: [
        { text: '「いつも通り、学校に行きます」', delta: 5, expr: 'surprise', reply: '……いいね、それ。俺も、音楽室の鍵、開けとく。' },
        { text: '「好きな人に会いに行きます」', delta: 4, expr: 'blush', reply: '……そう。……その人、うらやましい。' },
        { text: '「先輩、急に重いです」', delta: 2, expr: 'laugh', reply: '……よく言われる。ごめん、軽いのに変える。好きなパンは？' } ] },
    { q: [ { expr: 'ritsu', to: 'normal' }, { say: 'ritsu', text: '中学のとき、バンドやってた。……みんな辞めて、俺だけ残った。' } ],
      choices: [
        { text: '「今は、私が聴いてます」', delta: 6, expr: 'blush', reply: '……うん。観客、ひとり。それで十分、って思えるの、初めて。' },
        { text: '「どうして続けてるんですか」', delta: 3, expr: 'think', reply: '……やめる理由が、見つからなかっただけ。今は、続ける理由がある。' },
        { text: '「また組めばいいじゃないですか」', delta: 1, expr: 'sad', reply: '……簡単に言うね。でも、そうかも。' } ] },
    { q: [ { expr: 'ritsu', to: 'smile' }, { say: 'ritsu', text: '……ひなたは、どんな色の音楽が好き？' } ],
      choices: [
        { text: '「夕焼けみたいなオレンジ色」', delta: 5, expr: 'smile', reply: '……わかる。今度、そういうの弾く。コード、もう浮かんだ。' },
        { text: '「音楽に色ってあるんですか？」', delta: 2, expr: 'think', reply: 'ある。……ひなたの声は、薄い黄色。春の、朝の。' },
        { text: '「流行ってる曲ならなんでも」', delta: 0, expr: 'normal', reply: '……そう。流行りも、悪くない。' } ] },
    { q: [ { expr: 'ritsu', to: 'think' }, { say: 'ritsu', text: '……来年、俺、3年になる。受験で、音楽室にあまり行けなくなる。' } ],
      choices: [
        { text: '「じゃあ今のうちに、いっぱい聴かせて」', delta: 6, expr: 'blush', reply: '……うん。一曲でも多く。君のために、って言っていい？' },
        { text: '「さびしくなりますね」', delta: 4, expr: 'sad', reply: '……俺も。……こんなこと、言うの、らしくないけど。' },
        { text: '「受験、がんばってください」', delta: 1, expr: 'normal', reply: '……ありがとう。まだ一年、先だけど。' } ] }
  ]
};

/* ---- デート opener（場所固有） ---- */
function opener(c, place, lines) {
  var steps = [ { bg: place }, { bgm: (place === 'amusement' || place === 'karaoke' || place === 'mall') ? 'date_happy' : 'date_calm' } ];
  steps.push({ show: c, expr: lines[0][0], pos: 'center' });
  for (var i = 0; i < lines.length; i++) {
    if (i > 0) steps.push({ expr: c, to: lines[i][0] });
    steps.push({ say: lines[i][2] === 'me' ? 'me' : (lines[i][2] === 'n' ? null : c), text: lines[i][1] });
  }
  return steps;
}

var OPENERS = {
  minato: {
    amusement: [['smile', 'ジェットコースター、乗るの？ ……ひなた、小学生の時、泣いたよね。'], ['blush', '……手、つないどく？ いや、ひなたが怖いならって話。']],
    aquarium: [['laugh', '見て、クラゲ。ふわふわしてる。……ひなたの寝起きの髪みたい。'], ['smile', 'ここ、一番好きな場所なんだ。ひなたと来られて、うれしい。']],
    cinema: [['normal', 'ホラーにする？ ……うそ。ひなたが見たいって言ってた、あのアニメ映画。チケット取ってある。'], ['smile', 'ポップコーン、キャラメルと塩のハーフ。ひなたの好み、変わってない？']],
    park: [['smile', '懐かしいね、この公園。すべり台、こんなに小さかったっけ。'], ['laugh', 'ボート、乗る？ 俺がこぐ。ひなたは寝てていいよ。']],
    mall: [['normal', '夏服、見に行くんだっけ。……俺、ひなたに似合うの、わりと当てられると思う。'], ['blush', 'あ、これ。……いや、なんでもない。ペアのキーホルダーとか、見てない。']],
    cafe: [['smile', 'ここのフレンチトースト、おいしいんだって。ひなた好きそうだなって、ずっと思ってた。'], ['normal', '……こうしてると、デートみたいだね。あ、デートか。']],
    karaoke: [['surprise', 'カラオケ……ひなた、歌うとき、振りつけまでやるよね。'], ['laugh', '俺は聴く係でいい。タンバリン担当。……一曲だけなら、歌ってもいい。']]
  },
  aoi: {
    amusement: [['annoyed', '……遊園地。非効率な待ち時間の集合体ですね。'], ['blush', 'ですが、君が楽しそうなので、待ち時間の価値は保証されました。……コーヒーカップ、回しすぎないでください。']],
    aquarium: [['surprise', 'ペンギンの給餌時間、十四時からです。調べておきました。'], ['smile', '……水の中の生き物を見ていると、考えるのをやめられる。君と来ると、特に。']],
    cinema: [['think', 'この監督の前作は三回見ました。今回は伏線が多いはずです。'], ['blush', '……泣いたら、見ないでください。暗いので、見えないとは思いますが。']],
    park: [['normal', '公園は、情報量が少なくて落ち着きます。……ベンチ、空いています。'], ['smile', '風が気持ちいいですね。……こういう時間も、必要だと最近知りました。']],
    mall: [['think', '文房具のフロアは三階です。……いえ、君の行きたい店が先で構いません。'], ['annoyed', '……ぬいぐるみ売り場で止まらないでください。ウサギの前では、特に。']],
    cafe: [['normal', 'このカフェ、試験期間は静かで勉強に向いています。……今日は、勉強はしませんが。'], ['blush', 'プリン・ア・ラ・モードを。……ひとつ。いえ、僕のです。']],
    karaoke: [['surprise', 'カラオケは……採点機能があるなら、やぶさかではありません。'], ['think', '九十点以上を出す自信があります。……笑わないで聴いてください。']]
  },
  haruto: {
    amusement: [['laugh', '遊園地だー！ フリーパス！ 全部乗る！ 絶叫系、何回でもいける！'], ['smile', 'ひなた、怖かったら俺の腕、つかんでいいからな！ ……いや、俺がつかむかも！']],
    aquarium: [['surprise', 'うおー、でっけー水槽！ ジンベエザメ！ あれ、俺より泳ぐの速いかな！？'], ['blush', '……静かにしなきゃだよな。ごめん。……ひなたの横顔、青く光ってて、なんか、いい。']],
    cinema: [['laugh', 'アクション映画！ 爆発！ カーチェイス！ 最高じゃん！'], ['smile', 'ポップコーン、Lサイズな。……半分こ、でいい？']],
    park: [['laugh', 'ボール持ってきた！ ひなた、パス練しようぜ！ 軽くな、軽く！'], ['smile', '芝生の上で寝っ転がるの、気持ちいいよな。……ほら、空、めっちゃ青い。']],
    mall: [['laugh', 'スポーツ用品店、見ていい！？ 新しいスパイク、見るだけ！ 見るだけだから！'], ['blush', 'ひなたが選んでくれたリストバンド、試合で絶対つける。……え、選んでくれるよな？']],
    cafe: [['surprise', 'カフェって、こういうおしゃれなとこ、俺、はじめて入ったかも。'], ['blush', 'メニュー、何が何だかわかんねえ……。ひなたと同じのにする！']],
    karaoke: [['laugh', 'カラオケー！ 一曲目、俺いっていい！？ アニソン全力でいく！'], ['smile', 'デュエットもしようぜ！ ひなたが入れた曲なら、なんでも覚える！']]
  },
  ritsu: {
    amusement: [['think', '……遊園地。観覧車だけ、乗りたい。'], ['smile', '高いところから見ると、街が楽譜みたいに見える。……ひなたも、見てみて。']],
    aquarium: [['normal', '……クラゲ、見てると時間が溶ける。'], ['smile', 'ここの水の音、録音したい。……今度、機材持ってきてもいい？']],
    cinema: [['think', '古い映画のリバイバル。……音楽がいいんだ、これ。'], ['smile', '終わったら、どのシーンが好きだったか、教えて。俺も、ひとつだけ言う。']],
    park: [['normal', '……池のほとり。ここ、夕方になるとカラスの声がいい。'], ['smile', 'アコギ持ってきた。……一曲、弾いてもいい？ ひなたのためだけに。']],
    mall: [['smile', '三階の奥に、中古レコード屋がある。……ついてきて。'], ['think', 'ジャケ買い、してみる？ ひなたの直感で選んだ一枚、家で聴く。']],
    cafe: [['normal', '……この喫茶店、マスターが昔ドラムやってた。'], ['smile', 'ナポリタン、おすすめ。……口のまわり、ついても、言わないでおく。']],
    karaoke: [['surprise', '……カラオケ。人前で歌うのは、はじめて。'], ['blush', 'ひなたの前なら、歌える気がする。……でも、先に一曲、ひなたの。']]
  }
};

var CLOSERS = {
  minato: {
    good: [ { expr: 'minato', to: 'smile' }, { say: 'minato', text: '今日は、ありがと。……帰り道も一緒なの、幼なじみの特権だね。' },
      { expr: 'minato', to: 'blush' }, { say: 'minato', text: '……次も、誘ってくれる？ 俺からも誘うけど。' }, { fx: 'heart' }, { hide: 'minato' } ],
    bad: [ { expr: 'minato', to: 'sad' }, { say: 'minato', text: '……ひなた、今日、楽しかった？ なんか、上の空だった。' },
      { say: 'minato', text: 'ううん、いい。……帰ろっか。' }, { hide: 'minato' } ]
  },
  aoi: {
    good: [ { expr: 'aoi', to: 'smile' }, { say: 'aoi', text: '今日の満足度、自己評価で九十八点です。' },
      { expr: 'aoi', to: 'blush' }, { say: 'aoi', text: '残りの二点は……次回に持ち越しです。次回がある、という前提で。' }, { fx: 'heart' }, { hide: 'aoi' } ],
    bad: [ { expr: 'aoi', to: 'annoyed' }, { say: 'aoi', text: '……今日は、あまり有意義ではなかったようですね。' },
      { say: 'aoi', text: '僕の話し方に問題があったなら、改善します。……では、これで。' }, { hide: 'aoi' } ]
  },
  haruto: {
    good: [ { expr: 'haruto', to: 'laugh' }, { say: 'haruto', text: 'あー、楽しかった！ 今日、人生で一番楽しい日かも！' },
      { expr: 'haruto', to: 'blush' }, { say: 'haruto', text: '……また来よ。ぜったい。ひなたとなら、何回でも。' }, { fx: 'heart' }, { hide: 'haruto' } ],
    bad: [ { expr: 'haruto', to: 'sad' }, { say: 'haruto', text: 'えっと……今日、つまんなかった？ 俺ばっかりはしゃいでた、よな。' },
      { say: 'haruto', text: '……ごめん！ 次はもっとちゃんとする！ ……次、あるよな？' }, { hide: 'haruto' } ]
  },
  ritsu: {
    good: [ { expr: 'ritsu', to: 'smile' }, { say: 'ritsu', text: '……今日のこと、たぶん曲になる。' },
      { expr: 'ritsu', to: 'blush' }, { say: 'ritsu', text: 'できたら、最初に聴かせる。……約束。' }, { fx: 'heart' }, { hide: 'ritsu' } ],
    bad: [ { expr: 'ritsu', to: 'normal' }, { say: 'ritsu', text: '……今日は、少し、音が合わなかったね。' },
      { say: 'ritsu', text: 'そういう日も、ある。……じゃあ。' }, { hide: 'ritsu' } ]
  }
};

DATA.dates = {};
CHAR_IDS.forEach(function (c) {
  DATA.dates[c] = {};
  PLACE_IDS.forEach(function (p) {
    DATA.dates[c][p] = {
      opener: opener(c, p, OPENERS[c][p]),
      talks: DATA.dateTalks[c],
      closer_good: CLOSERS[c].good,
      closer_bad: CLOSERS[c].bad
    };
  });
});

/* ============================================================
 * 電話
 * ============================================================ */
DATA.phone = {
  minato: {
    first: ['ひなたから電話？ めずらしい。……どうしたの？ 何かあった？'],
    accept: ['いいよ。何時に迎えに行けばいい？', 'うん、空いてる。……っていうか、空けた。'],
    acceptTier: [
      ['いいよ。ひなたのお母さんにも言っとく。'],
      ['いいよ。久しぶりに、ふたりで出かけるね。'],
      ['行く。何着てくか、今から悩む。'],
      ['……うん。楽しみにしてる。寝られなかったら、ひなたのせいだから。'],
      ['日曜、ずっと空けてある。……実は、誘われるの、待ってた。']
    ],
    decline: ['ごめん、その日、家の手伝いがあって。……また誘って？ 絶対だよ。', 'あー……その場所、今は気分じゃないかも。別のとこなら。'],
    busy: ['ごめん、今週はちょっとバタバタしてて。……ひなたの声、聞けただけでうれしい。'],
    hurt: ['……ひなた、俺のこと、忘れてたんじゃないの。', '今さら？ ……ごめん、今はちょっと、話したくない。']
  },
  aoi: {
    first: ['はい、朝比奈です。……春野さん？ なぜ、僕の番号を。……いえ、交換しましたね。失礼しました。'],
    accept: ['日曜ですね。了解しました。集合は十時、駅前の時計の下で。', 'スケジュールを確認しました。……空いています。'],
    acceptTier: [
      ['……わかりました。予定に入れておきます。'],
      ['了解です。遅刻は、しないでください。'],
      ['いいですよ。……楽しみです。いえ、予定として把握した、という意味です。'],
      ['……行きます。生徒会の仕事は、土曜に前倒しで終わらせます。'],
      ['君からの誘いを、断る理由を探すほうが、非効率です。……行きます。']
    ],
    decline: ['その日は生徒会の会議です。申し訳ありません。', 'その場所は……僕には、少しにぎやかすぎます。'],
    busy: ['今週は予定が埋まっています。……来週なら、調整します。'],
    hurt: ['……どちらさまでしょう。冗談です。ですが、今は忙しいので。', '僕のことは、優先順位が低いのだと理解しています。……失礼します。']
  },
  haruto: {
    first: ['もしもしー！ え、ひなた！？ マジで！？ うわ、電話もらえるとか、今日いい日だー！'],
    accept: ['行く行く！ ぜってー行く！', 'オッケー！ 日曜な！ 雨でも行く！'],
    acceptTier: [
      ['おー、いいぜ！ 部活休みだし！'],
      ['行く行く！ ひなたコンビ、出動！'],
      ['マジで！？ 行く！ 何時！？ 今からでも行ける！'],
      ['……行く。うわ、なんか今、すげーうれしい。声、にやけてない？'],
      ['ひなたの誘いなら、練習サボってでも……いや、サボんないけど！ 行く！ 絶対！']
    ],
    decline: ['うわー、その日、練習試合なんだ！ ごめん！ マジごめん！', 'そこかー……俺、じっとしてるの苦手でさ。別のとこにしない？'],
    busy: ['今週、合宿なんだ！ 帰ったら連絡する！'],
    hurt: ['……ああ、ひなたか。いや、別に。最近、俺のことどうでもいいのかなって。', 'ごめん、今はちょっと、ボール蹴ってたい気分。']
  },
  ritsu: {
    first: ['……もしもし。……ああ、ひなた。電話、苦手なんだ。でも、君のは、出る。'],
    accept: ['……いいよ。', '行く。……どこで待てばいい？'],
    acceptTier: [
      ['……いいよ。暇だから。'],
      ['……うん、行く。'],
      ['行く。……少し、楽しみ。'],
      ['……うん。日曜、晴れるといい。晴れなくても、行くけど。'],
      ['君の声、聞いたら、行かない理由がなくなった。……行く。']
    ],
    decline: ['……その日は、スタジオ。ごめん。', '……そこ、人が多すぎる。音が、うるさくて。別のところなら。'],
    busy: ['……今週、ライブの準備。また、かけて。'],
    hurt: ['……。……ごめん、今、弦を張り替えてる。', '……君は、気まぐれだね。今は、弾いていたい。']
  },
  friend: {
    open: ['もしもーし、七瀬ひより情報局です！ 本日は誰の情報をお求めで？', 'ひなた？ ちょうど電話しようと思ってた！ 新しいうわさ、あるよー。'],
    close: ['じゃ、またね！ 恋も勉強も、ほどほどにがんばれ！', '何かあったらすぐ連絡してよ？ 情報局は24時間営業です。']
  }
};

/* ============================================================
 * ひよりの噂話・爆弾
 * ============================================================ */
DATA.bombTalk = {
  intro: ['誰のこと、聞きたい？', 'ふふん、ちゃんと調べてあるよ。'],
  feelings: {
    minato: ['湊くん？ 最近ひなたと話せてないって、ちょっとしょんぼりしてたよ。', '湊くんは、いつも通りって感じ。安心安全の幼なじみ枠。', '湊くん、ひなたの話するとき、声がやわらかくなるんだよね。', '湊くん、最近ひなたのクラスの男子をじっと見てるって。……わかりやすっ。', '湊くん？ もう、ひなたしか見えてないって。本人以外、みんな知ってる。'],
    aoi: ['朝比奈くん？ 「春野さん……ああ、B組の」って感じ。まだまだだね。', '朝比奈くん、ひなたのこと「勉強仲間」って言ってたよ。第一歩！', '朝比奈くん、図書室でひなたが来るの待ってるっぽい。本人は否定してたけど。', '朝比奈くん、生徒会で「春野さんが」ってうっかり三回言ったらしい。', '朝比奈くん、ひなたの前だと敬語が抜けるって噂。あれ、完全に落ちてるよ。'],
    haruto: ['陽翔くん？ 誰にでもあんな感じだから、まだ普通の友達かなー。', '陽翔くん、ひなたのこと「ひなたコンビの相方」って言いふらしてるよ。', '陽翔くん、ひなたの話すると声が一段大きくなる。……もともと大きいけど。', '陽翔くん、ひなたの前だと急に声が小さくなるんだって。え、それって……。', '陽翔くん？ サッカー部全員が知ってるよ。「日向がひなたにベタ惚れ」って。'],
    ritsu: ['神楽先輩？ 謎すぎて、情報局でもつかめない……。', '神楽先輩、ひなたのこと「夕方の子」って呼んでるらしい。どういう意味？', '神楽先輩が誰かと笑ってるの、ひなたと一緒のときしか見たことないって。', '神楽先輩、最近ずっと同じ曲を弾いてるって。……誰のための曲だろうねー？', '神楽先輩、ひなたのこと話すとき、ふっと目がやさしくなるの。もう完全に、ね。']
  },
  unmet: {
    aoi: ['朝比奈くん？ 生徒会の1年生だよ。まだ話したことないの？'],
    haruto: ['サッカー部の日向くん知ってる？ 放課後グラウンドで走ってたら、たぶん会えるよ。運動がんばってる子が好きっぽい。'],
    ritsu: ['軽音部の神楽先輩って、音楽室にいるらしいよ。芸術系、がんばってたら会えるかもね。']
  },
  calm: ['今のところ、誰もひなたに不満はなさそう。平和だねー。', '大丈夫、今は誰も爆発しそうにないよ。'],
  warn: {
    minato: ['ひなた、湊くんのことほったらかしにしてない？ 最近、ひとりで帰ってるの見たよ。……ちょっと、危ないかも。'],
    aoi: ['朝比奈くん、最近ぴりぴりしてるって生徒会の子が言ってた。ひなた、何かした？ ……何もしなかった、が正解かもね。'],
    haruto: ['陽翔くん、ひなたの話題になると急に黙るんだって。あの陽翔くんが、だよ？ 早めにフォローしたほうがいいって。'],
    ritsu: ['神楽先輩の最近の曲、すごく暗いって噂。……ひなた、心当たりある？ 放っておくと、まずいかも。']
  },
  explode: {
    minato: ['大変！ 湊くんが「ひなたは高校で変わった」って、クラスで言っちゃったみたい。みんな、ひなたの噂してる……。'],
    aoi: ['大変……朝比奈くんが生徒会で「春野さんは約束を守らない人です」って。一気に広まっちゃってる。'],
    haruto: ['ひなた、大変！ 陽翔くんが「ひなたに振り回された」ってサッカー部で愚痴ってて、学年じゅうに回っちゃってる！'],
    ritsu: ['神楽先輩、軽音部のライブで「気まぐれな子」って歌を歌ったの。みんな、ひなたのことだって……。']
  }
};

window.DATA = DATA;
})();
