# 放課後リフレイン — 開発仕様（内部用）

女性主人公の学園恋愛SLG 体験版。1年目4月入学 → 7月終業式（夏休み突入）まで、約16週。5〜10分で遊べる。
ブラウザで動く。ビルドなし。素のJS（ES2020、モジュールではなく<script>で順に読む）。外部依存なし（Google Fonts の DotGothic16 と M PLUS Rounded 1c のみ）。

## 画面
- 論理解像度 640x360 の <canvas id="game">。CSSで整数倍（入らなければ小数倍）拡大、image-rendering: pixelated。
- すべて canvas に描く（DOMのUIは使わない）。ctx.imageSmoothingEnabled = false。
- 文字: 'DotGothic16'（本文・数字）。見出しに 'M PLUS Rounded 1c' 800 可。
- 入力: マウス/タッチ（クリック=決定）、キーボード（矢印/Enter/Space/Z=決定、X/Esc=戻る）。

## ファイルと担当（グローバル名前空間）
index.html            … 読み込み順: audio.js, art.js, data.js, core.js, game.js
js/audio.js  → window.SND   （WebAudioで全て合成。音声ファイルなし）
js/art.js    → window.ART   （全グラフィックをコードで生成。画像ファイルなし）
js/data.js   → window.DATA  （キャラ・会話・イベント・デートの全データ）
js/core.js   → window.CORE  （ループ、入力、トゥイーン、パーティクル、テキスト、UI部品）
js/game.js   → ゲーム本体（状態、週進行、各シーン）

### SND（audio.js）
SND.init()                      // 最初のユーザー操作で呼ぶ（AudioContext resume）
SND.se(name)                    // 名前: cursor, decide, cancel, pop_up, pop_down, success, great, fail,
                                //   type(文字送り1音/短い), page, heart, heart_break, bomb_warn, bomb, flash,
                                //   phone_ring, phone_dial, phone_pickup, chime(学校チャイム), bell_rank,
                                //   whistle, cheer, drumroll, camera, sparkle, week, levelup, stamp, door
SND.bgm(name)                   // ループBGM: title, daily(平日メニュー), school(学校イベント), date_happy,
                                //   date_calm, tension(テスト/順位), festival(体育祭), night(夜・電話),
                                //   heartbeat(ときめき演出), sad(傷心), ending(夏休み突入), summer(エピローグ)
                                // 同名なら何もしない。切り替えはクロスフェード。
SND.stopBgm(fadeSec=0.6)
SND.setVolume({bgm:0..1, se:0..1})

### ART（art.js）
ART.init()                              // オフスクリーンに事前描画（キャッシュ）してよい
ART.bg(ctx, id, t)                      // 640x360 全面背景。id: title, classroom, classroom_eve(夕方),
      //  hallway, rooftop, schoolgate_sakura, gym, ground, library, music_room, art_room, bedroom(主人公の部屋・夜),
      //  bedroom_day, station, // デート: amusement, aquarium, cinema, park, mall, cafe, karaoke, beach(夏休み予告)
      //  sports_day(体育祭), shrine_tanabata(七夕), rank_board(順位発表の掲示板前)
      //  t=秒。雲・桜・水の揺れなど軽いアニメ可。
ART.portrait(ctx, charId, expr, x, y, opts) // 立ち絵（腰上）。基準サイズ 約 200x300 論理px、(x,y)=足元中央。
      //  charId: minato, aoi, haruto, ritsu, (主人公は立ち絵なし), friend(女友達: 七瀬 ひより)
      //  expr: normal, smile, laugh, blush, angry, annoyed(呆れ), sad, surprise, think, wink(任意)
      //  opts: {t, alpha, flip, blink:true, silhouette:false}  まばたき・呼吸の揺れはART側でtから。
ART.face(ctx, charId, expr, x, y, size)   // 小さい顔アイコン（電話帳・ステータス用）size=32 or 48
ART.chibi(ctx, action, frame, x, y)       // 主人公ミニキャラ(約32x40)の行動アニメ。action:
      //  study, sport, art, culture(読書), style(身だしなみ), rest(寝る), play(遊ぶ), walk, fail(しょんぼり), sick
      //  frameは整数（0..N-1、ART.chibiFrames[action] に枚数）
ART.icon(ctx, id, x, y, size)             // ドット絵アイコン: study,sport,art,culture,style,rest,play, phone,
      //  heart, heart_break, bomb, bomb_lit, star, note, calendar, gear, save, sun, cloud, rain, health, stress
ART.player                               // 主人公の名前入力は無し。固定名「春野 ひなた」(変更可なら game.js)

描画方針: 16〜32bit期アニメ調ドット。キャラは「ベクターで高解像度に描いてから低解像度バッファに落とし、
限定パレットで量子化」でも、ドットマップでも可。最終的にドットの粒が揃って見えること。
アウトラインは濃い色、アニメ塗り2〜3階調、ハイライト。ぼやけ禁止。

### DATA（data.js）
DATA.chars = {
  minato:{ name:'真白 湊', kana:'ましろ みなと', grade:'1年B組', role:'幼なじみ', color:'#...',
           profile:'...', likes:{ place:['aquarium',...], param:'...' }, meet:{type:'start'} , phone:'...'},
  aoi:{ ... meet:{type:'event', id:'meet_aoi'} }, haruto:{ meet:{type:'param', param:'sport', value:25} }, ritsu:{ meet:{param:'art', value:25}}
  friend:{ name:'七瀬 ひより', ... }  // 攻略対象ではない。情報役（好感度を教えてくれる）
}
DATA.params = [{id:'study',name:'学力'},{id:'sport',name:'運動'},{id:'art',name:'芸術'},{id:'culture',name:'教養'},{id:'style',name:'容姿'}]
DATA.commands = [{id,name,desc,gain:{param:+n..},cost:{hp:-n,stress:+n}}, ...]  // study, sport, art, culture, style, rest, play
DATA.places = [{id:'amusement',name:'遊園地',bg:'amusement',cost:...}, ...] // デート場所
DATA.calendar = 週ごとの予定 [{week:1, month:4, label:'4月 第1週', event:'entrance'}, ...] 16週
DATA.scenes = { id: [ step, step, ... ] }   // スクリプト。step の形式:
   {bg:'classroom'}                         背景切替（トランジション付き）
   {bgm:'school'} / {se:'chime'}
   {show:'aoi', expr:'normal', pos:'center'|'left'|'right'}   立ち絵表示/差し替え
   {hide:'aoi'}
   {say:'aoi', text:'……'}                   名前欄つきセリフ（say:'me' は主人公、say:null は地の文）
   {expr:'aoi', to:'blush'}                 表情だけ変更
   {choice:[{text:'...', effect:{aoi:+3}, next:'label'}, ...]}   選択肢。effect の数値は好感度。
   {label:'x'} / {goto:'x'}
   {fx:'flash'|'shake'|'heart'|'sparkle'|'fadeblack'|'fadewhite'}
   {if:{param:'study',gte:40}, then:'label', else:'label'}   分岐（aff:{aoi:gte..}, flag:'x' も可）
   {set:{flag:'met_aoi'}}   {meet:'aoi'}
   {wait:0.5}
DATA.dates[charId][placeId] = { opener:[steps], talks:[ {q:[steps], choices:[{text,delta,expr,reply}]} x3以上 ], closer_good:[...], closer_bad:[...] }
   またはキャラ共通 + 場所ごとの一言。各キャラ×7場所で場所固有のひとことを必ず入れる。
DATA.phone[charId] = { accept:[...], decline:[...], busy:[...], first:[...] }  // 電話の応答バリエーション
DATA.random = [ {id, cond, scene:[steps]} ]  // ランダムイベント 6種以上
DATA.events = { entrance, midterm, sports_day, tanabata, final_exam, closing ... } → scenes への参照
DATA.bombTalk = ひよりの噂話・爆弾警告のセリフ

## ゲームルール（game.js）
- パラメータ 0〜200。初期 各10前後。体調(hp)0〜100、ストレス0〜100。
- 1週 = 平日コマンド1つ（月〜金を5コマのミニアニメでまとめて見せる）→ 週末（電話 / 休む / ステータス / 日曜はデート）
- 成功判定: 体調・ストレスで確率。大成功(×1.8)/成功/失敗(×0.3)。体調<20で倒れる（1週休み）。ストレス>80で失敗率大。
- 好感度 aff 0〜100（表示は ときめき度の段階: 知り合い/友達/仲良し/気になる/ときめき）。傷心度 hurt 0〜100。
  出会ったのに4週以上デートしない相手は傷心度が上がり、50で爆弾点火（ひよりが警告）、100で爆発→噂で全員の好感度 -15 ＆ ストレス+20。デートすると大きく下がる。
- 電話: 週末に1回。相手の好感度・場所の好み・傷心度で OK/断り。OKなら日曜にデート。
- テスト: 学力＋乱数で学年順位（/240人）。掲示板演出。
- 体育祭: 運動で結果 ＋ 簡単なタイミング押しミニゲーム（1ボタン）。
- 終業式 → 1学期のまとめ（通知表風: パラメータ、各キャラの気持ちの一言）→ 「夏休み編へつづく」。
- セーブ: localStorage（try/catch）。
