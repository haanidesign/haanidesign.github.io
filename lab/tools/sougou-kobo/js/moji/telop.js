/* 🎌 テロップ（kind: 'telop'）。文字APNG工房の 文字を レイヤーに した もの。
   テンプレ（戦闘開始・場所テロップ・かざり枠 など）、出かた・ずっと・消えかた、帯、かざり、流す。
   描く ところは 文字APNG工房の まま。作品と 同じ 大きさの 紙に 描く。
   時間は レイヤーの「出す ところ」の はじまりが 0。 */
import { newLayer } from '../engine/layer.js?v=391';
import { drawMatome, MATOME, MATOME_LOOK } from './matome.js?v=391';

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;900&family=Dela+Gothic+One&family=RocknRoll+One&family=Reggae+One&family=DotGothic16&family=Yusei+Magic&family=Zen+Antique&family=Shippori+Mincho:wght@800&family=Kaisei+Decol:wght@700&family=Noto+Sans+JP:wght@900&family=Mochiy+Pop+One&family=Hachi+Maru+Pop&display=swap';
let fontsIn = false;
function loadFonts(){
  if(fontsIn) return; fontsIn = true;
  const k = document.createElement('link'); k.rel = 'stylesheet'; k.href = FONT_CSS;
  document.head.appendChild(k);
}

const FONTS=[["M PLUS Rounded 1c","丸ゴシック",900],["Dela Gothic One","極太ゴシック",400],["Noto Sans JP","ゴシック",900],["Mochiy Pop One","ポップ",400],["RocknRoll One","ロックンロール",400],["Reggae One","レゲエ",400],["Shippori Mincho","明朝",800],["Zen Antique","古風",400],["Kaisei Decol","デコ明朝",700],["Yusei Magic","マジック",400],["Hachi Maru Pop","まるもじ",400],["DotGothic16","ドット",400]];
const INFX={none:"なし（パッと）",fade:"フェード",up:"下から",down:"上から",left:"右から",right:"左から",zoom:"ズームイン",pop:"ポップ（弾む）",big:"大きく→元へ",spin:"回転",type:"タイプライター",blur:"ぼかし→くっきり",stamp:"ドン！（判子）",wave:"波打って",outline:"輪郭から塗り",converge:"文字間の収束",drop:"一文字落下",rush:"一文字ラッシュ",ghost:"残像文字",flip:"フリップ",split:"上下から合体"};
const IDLEFX={none:"なし",float:"ふわふわ",shake:"ふるえ",pulse:"どくどく",wave:"波",blink:"点滅",neon:"ネオン（ちらつき）",glitch:"色ずれ",fluffy:"ふわふわ縁取り"};
const OUTFX={fade:"フェード",up:"上へ",down:"下へ",left:"左へ",right:"右へ",zoom:"縮んで消える",big:"大きくなって消える",spin:"回転",blur:"ぼけて消える",type:"逆タイプ",flip:"フリップ",converge:"中央へ集まって消える"};
const KZ={none:"なし",under:"下線",overunder:"上下線",leftline:"左ライン",sidelines:"左右飾り線",corners:"コーナー罫線",frame:"枠",frame2:"二重枠",plate:"細線プレート",ticket:"切符フレーム",tag:"吊り下げ札",stamp:"押印",ribbon:"折り返しリボン",cutband:"斜めカット帯",accent:"アクセント帯",softbox:"ぼかし端のBOX",bubble:"吹き出し",rbubble:"丸角吹き出し",ring:"円弧リング",diamond:"菱形フレーム",dotoval:"点線オーバル",hearts:"ハートの輪",wreath:"花のリース",stars:"星座ライン",moon:"三日月の窓",sun:"太陽の光輪",snow:"雪の結晶",bubbles:"水の泡",notes:"音符と五線",feather:"羽根の軌跡",cinema:"シネマ（上下黒帯）"};
const DEF={kazari:"none",kzColor:"#1e1c14",kzColor2:"#c0182b",kzW:3,kzPad:36,scroll:"none",main:"戦闘開始",sub:"",subPos:"top",dir:"h",align:"center",fit:true,font:"Dela Gothic One",size:150,subSize:50,spacing:6,lineH:115,skew:0,
 inFx:"stamp",inDur:0.6,stagger:0.05,hold:2,idleFx:"none",outFx:"fade",outDur:0.5,useOut:true,
 fill:"#ffffff",grad:true,fill2:"#ffd84a",subFill:"#ffffff",stroke:"#c0182b",strokeW:12,stroke2:"#1e1c14",stroke2W:8,shadow:"#000000",shadowD:6,glow:"#ff5050",glowR:0,
 canvasSize:"1280x720",band:"none",bandColor:"#1e1c14",bandAlpha:70,bandPad:30,posX:50,posY:50,
 fps:"24",loopMode:"once",loopN:3,colors:"256",fname:"",trim:true,stillFirst:true};
const M=(o)=>Object.assign({},o);
const MODES={
 msg:{name:"メッセージ",groups:{"戦闘":[
   ["戦闘開始",{main:"戦闘開始"}],["戦闘終了",{main:"戦闘終了",inFx:"fade",fill2:"#a8e0ff",stroke:"#1f4fa0",glow:"#5aa0ff"}],
   ["OPEN COMBAT",{main:"OPEN COMBAT",font:"Reggae One",spacing:4}],["ファイナルラウンド",{main:"FINAL ROUND",sub:"ファイナルラウンド",font:"Dela Gothic One",stroke:"#8a1020",glowR:24}],
   ["ラウンド1",{main:"ROUND 1",sub:"",inFx:"left",font:"RocknRoll One",stroke:"#1e1c14"}],["ラウンド2",{main:"ROUND 2",inFx:"left",font:"RocknRoll One",stroke:"#1e1c14"}],["ラウンド3",{main:"ROUND 3",inFx:"left",font:"RocknRoll One",stroke:"#1e1c14"}],
   ["勝利",{main:"VICTORY",sub:"勝利",fill2:"#ffe46a",stroke:"#b07800",glowR:30,glow:"#ffe46a",inFx:"pop"}],["敗北",{main:"敗北",inFx:"down",fill:"#d8d8e0",fill2:"#6a6a80",stroke:"#20202c",grad:true,idleFx:"none",outFx:"blur"}]],
  "探索・事件":[["事件発生",{main:"事件発生",stroke:"#8a1020",idleFx:"shake",inFx:"stamp"}],["手がかり発見",{main:"手がかり発見！",inFx:"pop",font:"Mochiy Pop One",fill2:"#fff27a",stroke:"#e07a00"}],["SAN値チェック",{main:"SAN値チェック",font:"Zen Antique",inFx:"blur",fill:"#e8f0e0",grad:false,stroke:"#1a2a1a",glow:"#40ff80",glowR:18,idleFx:"shake"}],["探索開始",{main:"探索開始",inFx:"fade",font:"Shippori Mincho",grad:false,stroke:"#1e1c14",strokeW:6,stroke2W:0}]],
  "GM":[["休憩",{main:"休憩中",sub:"しばらくお待ちください",inFx:"fade",idleFx:"float",font:"M PLUS Rounded 1c",grad:false,stroke:"#1e1c14"}],["セッション終了",{main:"おつかれさまでした",font:"Hachi Maru Pop",inFx:"wave",grad:false,stroke:"#e0608a",size:110}],["本日のセッション",{main:"本日のセッション",sub:"START",font:"Kaisei Decol",inFx:"fade"}]],
  "判定":[["クリティカル",{main:"CRITICAL!!",sub:"クリティカル",inFx:"stamp",fill2:"#fff27a",stroke:"#e07a00",glow:"#ffd84a",glowR:28,idleFx:"pulse"}],["ファンブル",{main:"FUMBLE…",sub:"ファンブル",inFx:"down",fill:"#c8c8ff",fill2:"#5050a0",stroke:"#14143a",idleFx:"shake"}],["成功",{main:"成功",inFx:"pop",fill2:"#9ff0b0",stroke:"#1a7a40"}],["失敗",{main:"失敗",inFx:"down",fill2:"#b0b0b0",stroke:"#3a3a3a"}]]}},
 trailer:{name:"トレイラー",groups:{"トレイラー":[
   ["タイトル",{main:"クトゥルフ神話TRPG",sub:"シナリオタイトル",subPos:"bottom",font:"Shippori Mincho",inFx:"blur",inDur:1.4,hold:3,outFx:"blur",outDur:1,grad:false,stroke:"#000000",strokeW:0,stroke2W:0,shadowD:0,glow:"#ffffff",glowR:20,size:96,subSize:44,spacing:10,stagger:0}],
   ["キャッチコピー",{main:"その扉を、開けてはいけない。",font:"Shippori Mincho",inFx:"type",inDur:1.6,stagger:0.08,hold:2.5,grad:false,stroke:"#000",strokeW:0,stroke2W:0,shadowD:0,size:72,glowR:10,glow:"#000000"}],
   ["推奨人数",{main:"推奨人数 2〜3人",sub:"プレイ時間 4時間",subPos:"bottom",font:"M PLUS Rounded 1c",inFx:"fade",band:"bar",grad:false,strokeW:0,stroke2W:0,shadowD:0,size:72,subSize:40}]]}},
 place:{name:"場所・時間",groups:{"シーン・時間":[
   ["場所",{main:"廃病院",sub:"PM 11:42",subPos:"bottom",font:"Noto Sans JP",inFx:"right",align:"left",posX:6,posY:82,size:72,subSize:34,band:"box",grad:false,strokeW:0,stroke2W:0,shadowD:0,stagger:0,hold:3}],
   ["翌朝",{main:"翌朝",sub:"AM 7:00",subPos:"bottom",font:"Shippori Mincho",inFx:"fade",size:96,grad:false,strokeW:0,stroke2W:0,shadowD:4,stagger:0}],
   ["数時間後",{main:"── 数時間後 ──",font:"Shippori Mincho",inFx:"fade",size:72,grad:false,strokeW:0,stroke2W:0,shadowD:0,band:"bar",stagger:0}],
   ["縦書き場所",{main:"旧校舎",sub:"放課後",dir:"v",font:"Zen Antique",inFx:"down",posX:85,posY:50,size:110,subSize:40,grad:false,stroke:"#1e1c14",strokeW:6,stroke2W:0}]]}},
 kazari:{name:"かざり",groups:{"枠・帯":[["枠付き",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"frame",main:"旧校舎"})],["二重枠",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"frame2",main:"第一章",sub:"CHAPTER 1"})],["押印",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"stamp",main:"極秘",font:"Zen Antique",fill:"#c0182b",kzColor:"#c0182b",kzW:8,inFx:"stamp",size:150})],["細線プレート",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"plate",main:"資料室",sub:"ARCHIVE",subPos:"bottom"})],["切符フレーム",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"ticket",main:"片道切符",sub:"夜行列車",kzColor2:"#F2F0BE"})],["吊り下げ札",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"tag",main:"準備中",font:"M PLUS Rounded 1c",kzColor2:"#FFFEF7"})],["折り返しリボン",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"ribbon",main:"WELCOME",fill:"#ffffff",kzColor2:"#c0182b",font:"Dela Gothic One",size:90})],["斜めカット帯",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"cutband",main:"STAGE 2",fill:"#ffffff",kzColor2:"#1e1c14",font:"Dela Gothic One",inFx:"left",size:90})],["アクセント帯",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"accent",main:"探索パート",kzColor2:"#E1DD60",font:"M PLUS Rounded 1c"})],["ぼかし端のBOX",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"softbox",main:"その夜、",fill:"#ffffff",kzColor2:"#000000",inFx:"blur"})],["シネマティック",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"cinema",main:"── 三日後 ──",fill:"#ffffff",kzColor2:"#000000",size:72})]],"線・飾り":[["下線タイトル",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"under",main:"調査記録"})],["上下線",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"overunder",main:"旧校舎",sub:"CHAPTER 1"})],["左ラインタイトル",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"leftline",main:"図書館",sub:"LIBRARY",align:"left",posX:12,inFx:"right"})],["左右飾り線",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"sidelines",main:"幕間"})],["コーナー罫線",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"corners",main:"回想"})],["縦書き左右線",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"overunder",dir:"v",main:"夜明け前",posX:50})]],"吹き出し":[["吹き出し",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"bubble",main:"たすけて！",font:"M PLUS Rounded 1c",kzColor2:"#FFFEF7",inFx:"pop",size:90})],["丸角吹き出し",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"rbubble",main:"ここ、どこ…？",font:"Hachi Maru Pop",kzColor2:"#FFFEF7",inFx:"type",inDur:1.2,size:80})]],"モチーフ":[["円弧リング",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"ring",main:"月",size:140})],["菱形フレーム",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"diamond",main:"誓",size:140})],["点線オーバル",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"dotoval",main:"おやすみ",font:"Hachi Maru Pop",size:90})],["ハートの輪",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"hearts",main:"すき",font:"Mochiy Pop One",kzColor:"#e0608a",fill:"#e0608a",size:120})],["花のリース",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"wreath",main:"祝",kzColor:"#7AC4A0",kzColor2:"#F2A0B8",size:140})],["星座ライン",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"stars",main:"星の降る夜",fill:"#ffffff",kzColor:"#ffffff",glowR:12,glow:"#9ad0ff",size:90})],["三日月の窓",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"moon",main:"夜",kzColor2:"#E1DD60",size:140})],["太陽の光輪",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"sun",main:"晴",kzColor:"#e07a00",fill:"#e07a00",size:140})],["雪の結晶",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"snow",main:"冬",kzColor:"#6aa8d8",fill:"#3a6a98",size:140,idleFx:"float"})],["水の泡",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"bubbles",main:"海の底",kzColor:"#4aa0c8",fill:"#1a5a7a",idleFx:"float"})],["音符と五線",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"notes",main:"Music",font:"Kaisei Decol"})],["羽根の軌跡",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{kazari:"feather",main:"旅立ち"})]],"動き":[["輪郭から塗り",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"outline",inDur:1.4,strokeW:3,stroke:"#1e1c14",main:"真相"})],["文字間の収束",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"converge",inDur:1.2,stagger:0,main:"運命の夜"})],["上下から合体",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"split",inDur:0.8,main:"決着"})],["一文字落下",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"drop",inDur:0.6,stagger:0.12,main:"ドロップ"})],["一文字ラッシュ",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"rush",inDur:0.4,stagger:0.06,font:"Dela Gothic One",main:"ラッシュ！"})],["残像文字",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"ghost",inDur:0.8,main:"加速"})],["色ずれ文字",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"fade",inDur:0.3,idleFx:"glitch",font:"DotGothic16",main:"ERROR",size:140})],["ネオン文字",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{idleFx:"neon",fill:"#ffffff",glow:"#ff40c0",glowR:30,stroke:"#ff40c0",strokeW:4,font:"Reggae One",main:"OPEN",size:150})],["ふわふわ縁取り",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{idleFx:"fluffy",font:"Mochiy Pop One",fill:"#ffffff",stroke:"#e0608a",strokeW:14,main:"ゆめかわ"})],["フリップパネル",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"flip",outFx:"flip",stagger:0.08,inDur:0.5,font:"Noto Sans JP",main:"23:59"})],["ぼかし登場",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"blur",inDur:1.2,main:"記憶"})],["縦書きぼかし登場",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"blur",inDur:1.2,dir:"v",main:"記憶の底",posX:50})],["縦書きタイピング",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"type",inDur:1.5,dir:"v",main:"ここにいる",posX:50})],["長文タイピング",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{inFx:"type",inDur:3,font:"M PLUS Rounded 1c",size:48,main:"目を覚ますと、見知らぬ部屋にいた。\n窓の外は、まだ暗い。",align:"left",posX:50,hold:3})],["横スクロール",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{scroll:"h",inFx:"none",inDur:0,hold:5,main:"ただいまセッション中　ネタバレ禁止",font:"M PLUS Rounded 1c",size:64,fit:false})],["流れるコメント",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{scroll:"h",inFx:"none",inDur:0,hold:3,main:"草",fill:"#ffffff",stroke:"#1e1c14",strokeW:8,font:"M PLUS Rounded 1c",size:56,posY:20,fit:false})],["縦スクロール",Object.assign({grad:false,fill:"#1e1c14",subFill:"#1e1c14",strokeW:0,stroke2W:0,shadowD:0,glowR:0,font:"Shippori Mincho",size:110,subSize:36,inFx:"fade",inDur:0.8,stagger:0.03,hold:2.5,spacing:10,canvasSize:"1280x720"},{scroll:"v",inFx:"none",inDur:0,hold:6,main:"GM\nあなた\n\nPL\nみんな\n\nTHANK YOU",font:"M PLUS Rounded 1c",size:56,fit:false})]]}}
};
let S=M(DEF);
const ctx=document.createElement("canvas").getContext("2d");
const ease={out:t=>1-Math.pow(1-t,3),inn:t=>t*t*t,back:t=>{const c=1.9;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2)},el:t=>t===0||t===1?t:Math.pow(2,-10*t)*Math.sin((t*10-.75)*2.094)+1};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const W=()=>+S.canvasSize.split("x")[0],H=()=>+S.canvasSize.split("x")[1];
function totalDur(){return S.inDur+S.hold+(S.useOut?S.outDur:0)+maxStagger()}
let layoutCache=null;
function maxStagger(){return S.stagger*Math.max(0,[...(S.main+S.sub).replace(/\n/g,"")].length-1)}
const ROT=/[ー〜～…‥―\-─「」『』（）()【】〈〉＝=]/;
function layout(){
 const w=W(),h=H();let scale=1;
 const build=sc=>{
  const blocks=[];const mk=(txt,size,isSub)=>({lines:txt.split("\n"),size:size*sc,isSub});
  const m=mk(S.main,S.size,false),s=S.sub?mk(S.sub,S.subSize,true):null;
  const order=s?(S.subPos==="top"?[s,m]:[m,s]):[m];
  const chars=[];let cursor=0;const gap=(S.lineH/100);
  const sp=S.spacing*sc;
  // measure
  order.forEach(b=>{ctx.font=`${fw()} ${b.size}px '${S.font}'`;b.rows=b.lines.map(l=>{const cs=[...l];const ws=cs.map(c=>S.dir==="v"?b.size:ctx.measureText(c).width);const len=ws.reduce((a,x)=>a+x,0)+sp*Math.max(0,cs.length-1);return{cs,ws,len}})});
  let maxLen=0,thick=0;order.forEach((b,bi)=>{b.rows.forEach(r=>{maxLen=Math.max(maxLen,r.len);thick+=b.size*gap});if(bi<order.length-1)thick+=b.size*.2});
  let off=0;
  order.forEach((b,bi)=>{b.rows.forEach(r=>{
   const start=S.align==="left"?0:S.align==="right"?maxLen-r.len:(maxLen-r.len)/2;let p=start;
   r.cs.forEach((c,i)=>{chars.push({c,isSub:b.isSub,size:b.size,along:p+(S.dir==="v"?b.size/2:r.ws[i]/2),across:off+b.size*gap/2});p+=r.ws[i]+sp});
   off+=b.size*gap});if(bi<order.length-1)off+=b.size*.2});
  return{chars,maxLen,thick};
 };
 let L=build(1);
 if(S.fit){const pad=Math.max(S.strokeW,S.stroke2W)*2+(S.band!=="none"?S.bandPad*2:0)+(S.kazari!=="none"?S.kzPad*2+60:0)+30;const lim=S.dir==="v"?[h-pad,w-pad]:[w-pad,h-pad];scale=Math.min(1,lim[0]/L.maxLen,lim[1]/L.thick);if(scale<1)L=build(scale)}
 const bw=S.dir==="v"?L.thick:L.maxLen,bh=S.dir==="v"?L.maxLen:L.thick;
 let cx=S.posX/100*w,cy=S.posY/100*h;
 const ax=S.align==="left"&&S.dir==="h"?cx:S.align==="right"&&S.dir==="h"?cx-bw:cx-bw/2;
 const ay=S.align==="left"&&S.dir==="v"?cy:S.align==="right"&&S.dir==="v"?cy-bh:cy-bh/2;
 const x0=clamp(ax,-bw,w),y0=clamp(ay,-bh,h);
 L.chars.forEach(ch=>{if(S.dir==="v"){ch.x=x0+bw-ch.across;ch.y=y0+ch.along}else{ch.x=x0+ch.along;ch.y=y0+ch.across}});
 L.box={x:x0,y:y0,w:bw,h:bh};return L;
}
const fw=()=>{const f=FONTS.find(f=>f[0]===S.font);return f?f[2]:700};
function fxState(fx,p,ch,i,out){ // p: 0→1 progress (1 = fully shown)
 const s={a:1,dx:0,dy:0,sc:1,sx:1,sy:1,rot:0,blur:0,hide:false,fillA:1,strokeP:1,split:0,ghost:0};const d=ch.size;
 const e=out?ease.inn(1-p):ease.out(p);const ie=out?1-e:e; // ie: 0 hidden →1 shown, eased
 switch(fx){
  case"none":if(p<1&&!out)s.hide=p<=0;if(out)s.hide=p<1&&p<=0;break;
  case"fade":s.a=ie;break;
  case"up":s.a=ie;s.dy=(out?-1:1)*(1-ie)*d*.8;break;
  case"down":s.a=ie;s.dy=(out?1:-1)*(1-ie)*d*.8;break;
  case"left":s.a=ie;s.dx=(out?-1:1)*(1-ie)*d*2;break;
  case"right":s.a=ie;s.dx=(out?1:-1)*(1-ie)*d*2;break;
  case"zoom":s.a=ie;s.sc=out?ie:ease.back(clamp(p))*1;if(!out)s.sc=Math.max(0,ease.back(p));break;
  case"pop":s.a=clamp(p*4);s.sc=Math.max(0,ease.el(p));break;
  case"big":s.a=ie;s.sc=out?1+(1-ie)*1.5:1+(1-ease.out(p))*2.5;break;
  case"spin":s.a=ie;s.sc=Math.max(0,ie);s.rot=(1-ie)*Math.PI*(out?1:-1);break;
  case"type":s.hide=p<1&&(out?p<=0.0001:p<1);if(out)s.hide=p<=0;break;
  case"blur":s.a=ie;s.blur=(1-ie)*20;break;
  case"stamp":{const q=clamp(p/.55);s.a=clamp(p*3);s.sc=q<1?3-2*ease.inn(q)*1:1+.12*Math.sin(clamp((p-.55)/.45)*Math.PI)*(1-clamp((p-.55)/.45));break}
  case"wave":s.a=ie;s.dy=-Math.sin(p*Math.PI)*d*.5;break;
  case"outline":if(out){s.a=ie}else{s.fillA=clamp((p-.55)/.45);s.strokeP=clamp(p/.55)}break;
  case"converge":{const B=layoutCache.box,cx=B.x+B.w/2,cy=B.y+B.h/2,k=out?-(1-ie):(1-ie)*1.2;s.dx=(ch.x-cx)*k;s.dy=S.dir==="v"?(ch.y-cy)*k:0;s.a=ie;break}
  case"drop":s.a=clamp(p*5);s.dy=-(1-ease.el(p))*d*2.4;break;
  case"rush":s.a=clamp(p*3);s.dx=(1-ease.out(p))*d*6;s.sx=1+(1-p)*.8;break;
  case"ghost":s.a=ie;s.dx=(out?-1:1)*(1-ie)*d*3;s.ghost=out?-1:1;break;
  case"flip":s.sy=Math.cos((1-ie)*Math.PI/2);if(ie<=0.01)s.hide=true;break;
  case"split":s.split=1-ie;s.a=ie;break;
 }
 return s;
}
function idle(ch,i,t){const s={dx:0,dy:0,sc:1,a:1};const d=ch.size;
 switch(S.idleFx){case"float":s.dy=Math.sin(t*2.5)*d*.05;break;case"shake":s.dx=(Math.sin(t*67+i*3)*.5+Math.sin(t*41+i))*d*.012;s.dy=Math.cos(t*53+i*7)*d*.012;break;
  case"pulse":s.sc=1+Math.max(0,Math.sin(t*6))*.06;break;case"wave":s.dy=Math.sin(t*5-i*.6)*d*.08;break;case"blink":s.a=.55+.45*Math.cos(t*5);break;
  case"neon":{const f=Math.sin(t*37+i*2.1)+Math.sin(t*13.7+i);s.a=f>1.4?.25:1;break}
  case"glitch":{const g=Math.sin(t*23+i)>0.6||Math.sin(t*7.3)>0.85;s.glitch=g?d*.05:d*.015;if(g)s.dx=Math.sin(t*90+i)*d*.04;break}
  case"fluffy":s.fluffy=t;break}
 return s}
function drawFrame(t,c=ctx,L=layoutCache){
 const w=W(),h=H();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,w,h);if(!L)return;
 const n=L.chars.length,tin=S.inDur,outStart=S.inDur+S.hold+maxStagger();
 // band
 if(S.band!=="none"){
  let ba=clamp(tin>0?t/Math.max(.001,tin*.6):1);if(S.useOut&&t>outStart)ba=1-clamp((t-outStart)/Math.max(.001,S.outDur));
  c.save();c.globalAlpha=S.bandAlpha/100*ba;c.fillStyle=S.bandColor;const p=S.bandPad,b=L.box;
  if(S.band==="bar"){if(S.dir==="v")c.fillRect(b.x-p,0,b.w+p*2,h);else c.fillRect(0,b.y-p,w*ba+0*w,b.h+p*2)}
  else if(S.band==="box")c.fillRect(b.x-p,b.y-p,(b.w+p*2)*(S.dir==="v"?1:ba),(b.h+p*2)*(S.dir==="v"?ba:1));
  else{c.beginPath();const sk=(b.h+p*2)*.35;c.moveTo(b.x-p-sk,b.y+b.h+p);c.lineTo(b.x-p,b.y-p);c.lineTo(b.x+b.w+p+sk,b.y-p);c.lineTo(b.x+b.w+p,b.y+b.h+p);c.closePath();c.fill()}
  c.restore()}
 drawKazari(c,L,t);
 L.chars.forEach((ch,i)=>{
  if(ch.c===" "||ch.c==="　")return;
  const st=i*S.stagger;let s;
  if(S.useOut&&t>=outStart){const pq=1-clamp((t-outStart)/Math.max(.001,S.outDur));s=fxState(S.outFx,S.outFx==="type"?(i/Math.max(1,n)<pq?1:0):pq,ch,i,true)}
  else{const p=tin<=0?1:clamp((t-st)/tin);s=fxState(S.inFx,S.inFx==="type"?(t>=st+tin*0?(t-st>=0?1:0):0):p,ch,i,false);if(S.inFx==="type"&&tin>0){const per=tin/Math.max(1,n);s.hide=t<i*per+st*0}}
  if(s.hide||s.a<=0.001||s.sc<=0.001)return;
  const id=t>tin+i*S.stagger?idle(ch,i,t):{dx:0,dy:0,sc:1,a:1};
  const so=scrollOff(t,L);
  const draw1=(ox,a,tint)=>{
  c.save();c.translate(ch.x+s.dx+id.dx+so[0]+ox,ch.y+s.dy+id.dy+so[1]);c.rotate(s.rot);c.scale(s.sc*id.sc*s.sx,s.sc*id.sc*s.sy);
  if(S.skew)c.transform(1,0,-Math.tan(S.skew*Math.PI/180),1,0,0);
  if(S.dir==="v"&&ROT.test(ch.c))c.rotate(Math.PI/2);
  c.globalAlpha=clamp(s.a*id.a*a);if(s.blur>.3)c.filter=`blur(${s.blur}px)`;
  if(s.split>0.001){const hh=ch.size*.6,off=s.split*ch.size*1.5;c.save();c.beginPath();c.rect(-ch.size*2,-hh*2,ch.size*4,hh*2);c.clip();c.translate(0,-off);drawChar(c,ch,s,tint,id);c.restore();c.beginPath();c.rect(-ch.size*2,0,ch.size*4,hh*2);c.clip();c.translate(0,off);drawChar(c,ch,s,tint,id)}
  else drawChar(c,ch,s,tint,id);c.restore()};
  if(s.ghost)for(const g of[3,2,1])draw1(-s.ghost*g*ch.size*.35*(1-s.a),.18*(4-g),null);
  if(id.glitch){draw1(-id.glitch,.8,"#ff2050");draw1(id.glitch,.8,"#20e0ff")}
  draw1(0,1,null);
 });
}
function drawChar(c,ch,s={},tint=null,id={}){
 if(tint){c.font=`${fw()} ${ch.size}px '${S.font}'`;c.textAlign="center";c.textBaseline="middle";c.fillStyle=tint;c.fillText(ch.c,0,0);return}
 if(id.fluffy!=null&&S.strokeW>0){const sz=ch.size,r=S.strokeW*.9;c.save();c.font=`${fw()} ${sz}px '${S.font}'`;c.textAlign="center";c.textBaseline="middle";c.fillStyle=S.stroke;for(let k=0;k<12;k++){const a=k/12*Math.PI*2,rr=r*(1+.25*Math.sin(id.fluffy*4+k*1.7));c.fillText(ch.c,Math.cos(a)*rr,Math.sin(a)*rr)}c.restore()}
 const fillA=s.fillA??1,strokeP=s.strokeP??1;
 const sz=ch.size,k=ch.isSub?.5:1;c.font=`${fw()} ${sz}px '${S.font}'`;c.textAlign="center";c.textBaseline="middle";c.lineJoin="round";c.miterLimit=2;
 const sw=S.strokeW*k*(sz/ (ch.isSub?S.subSize:S.size)||1),sw2=S.stroke2W*k;
 if(S.glowR>0){c.save();c.shadowColor=S.glow;c.shadowBlur=S.glowR;c.fillStyle=S.glow;c.strokeStyle=S.glow;c.lineWidth=sw+sw2*2+2;c.strokeText(ch.c,0,0);c.restore()}
 if(S.shadowD>0){c.save();c.translate(S.shadowD*k,S.shadowD*k);c.fillStyle=S.shadow;c.strokeStyle=S.shadow;c.lineWidth=(sw+sw2*2)||0.01;if(sw+sw2>0)c.strokeText(ch.c,0,0);c.fillText(ch.c,0,0);c.restore()}
 if(sw2>0){c.strokeStyle=S.stroke2;c.lineWidth=sw+sw2*2;c.strokeText(ch.c,0,0)}
 if(fillA<1){c.save();c.strokeStyle=sw>0?S.stroke:S.fill;c.lineWidth=Math.max(2,sw);c.setLineDash([ch.size*6*strokeP,ch.size*6]);c.strokeText(ch.c,0,0);c.restore()}
 else if(sw>0&&id.fluffy==null){c.strokeStyle=S.stroke;c.lineWidth=sw;c.strokeText(ch.c,0,0)}
 if(fillA<=0)return;c.save();c.globalAlpha*=fillA;
 let f=ch.isSub?S.subFill:S.fill;
 if(S.grad&&!ch.isSub){const g=c.createLinearGradient(0,-sz*.45,0,sz*.45);g.addColorStop(0,S.fill);g.addColorStop(.48,S.fill);g.addColorStop(.52,S.fill2);g.addColorStop(1,S.fill2);f=g}
 c.fillStyle=f;c.fillText(ch.c,0,0);c.restore();
}
function scrollOff(t,L){if(S.scroll==="none")return[0,0];const d=totalDur(),q=clamp(t/Math.max(.001,d)),b=L.box;
 if(S.scroll==="h")return[(W()-b.x)+(-b.w-W())*q,0];return[0,(H()-b.y)+(-b.h-H())*q]}
function drawKazari(c,L,t){
 const k=S.kazari;if(k==="none")return;const tin=Math.max(S.inDur,.001),outStart=S.inDur+S.hold+maxStagger();
 let p=ease.out(clamp(t/(tin*1.1))),a=1;if(S.useOut&&t>outStart)a=1-clamp((t-outStart)/Math.max(.001,S.outDur));
 const so=scrollOff(t,L),b=L.box,pd=S.kzPad,x=b.x-pd+so[0],y=b.y-pd+so[1],w=b.w+pd*2,h=b.h+pd*2,cx=x+w/2,cy=y+h/2,lw=S.kzW;
 const C1=S.kzColor,C2=S.kzColor2,PI2=Math.PI*2;
 c.save();c.globalAlpha=a;c.strokeStyle=C1;c.fillStyle=C1;c.lineWidth=lw;c.lineCap="round";c.lineJoin="round";
 const dash=(len)=>c.setLineDash([len*p,len+1]);
 const rr=(X,Y,Ww,Hh,r)=>{c.beginPath();c.roundRect(X,Y,Ww,Hh,r)};
 const line=(x1,y1,x2,y2)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x1+(x2-x1)*p,y1+(y2-y1)*p);c.stroke()};
 const R=Math.max(w,h)/2;
 const around=(n,fn)=>{for(let i=0;i<n;i++){const q=clamp(p*n-i);if(q<=0)continue;const an=i/n*PI2-Math.PI/2;c.save();c.translate(cx+Math.cos(an)*R,cy+Math.sin(an)*R);c.scale(q,q);c.rotate(an+Math.PI/2);fn(i);c.restore()}};
 const heart=(z)=>{c.beginPath();c.moveTo(0,z*.35);c.bezierCurveTo(-z,-z*.25,-z*.45,-z,0,-z*.4);c.bezierCurveTo(z*.45,-z,z,-z*.25,0,z*.35);c.fill()};
 const star=(z)=>{c.beginPath();for(let i=0;i<10;i++){const r=i%2?z*.42:z,an=i/10*PI2-Math.PI/2;c.lineTo(Math.cos(an)*r,Math.sin(an)*r)}c.closePath();c.fill()};
 switch(k){
  case"under":line(x,y+h,x+w,y+h);break;
  case"overunder":if(S.dir==="v"){line(x,y+h,x,y);line(x+w,y,x+w,y+h)}else{line(x+w,y,x,y);line(x,y+h,x+w,y+h)}break;
  case"leftline":c.lineWidth=lw*2;line(x,y+h/2,x,y);line(x,y+h/2,x,y+h);break;
  case"sidelines":{const L2=Math.min(260,w*.5);line(x,cy,x-L2,cy);line(x+w,cy,x+w+L2,cy);c.globalAlpha*=p;for(const X of[x-L2-8,x+w+L2+8]){c.save();c.translate(X,cy);c.rotate(Math.PI/4);c.fillRect(-6,-6,12,12);c.restore()}break}
  case"corners":{const L2=Math.min(w,h)*.3;[[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(([X,Y,sx,sy])=>{line(X,Y,X+L2*sx,Y);line(X,Y,X,Y+L2*sy)});break}
  case"frame":rr(x,y,w,h,2);dash((w+h)*2);c.stroke();break;
  case"frame2":rr(x,y,w,h,2);dash((w+h)*2);c.stroke();rr(x+lw*3,y+lw*3,w-lw*6,h-lw*6,2);c.stroke();break;
  case"plate":rr(x,y,w,h,4);c.globalAlpha*=p;c.fillStyle=C2+"22";c.fill();c.lineWidth=Math.max(1,lw*.5);c.stroke();break;
  case"ticket":{const n=Math.min(w,h)*.12;c.globalAlpha*=p;c.beginPath();c.moveTo(x+n,y);c.lineTo(x+w-n,y);c.arc(x+w,y,n,Math.PI,Math.PI/2,true);c.lineTo(x+w,y+h-n);c.arc(x+w,y+h,n,-Math.PI/2,Math.PI,true);c.lineTo(x+n,y+h);c.arc(x,y+h,n,0,-Math.PI/2,true);c.lineTo(x,y+n);c.arc(x,y,n,Math.PI/2,0,true);c.closePath();c.fillStyle=C2;c.fill();c.stroke();c.setLineDash([lw*2,lw*2]);c.beginPath();c.moveTo(x+w*.82,y+n);c.lineTo(x+w*.82,y+h-n);c.stroke();break}
  case"tag":{const sw=Math.sin(t*2)*0.03;c.translate(cx,y-60);c.rotate(sw);c.beginPath();c.moveTo(-w*.3,60);c.lineTo(0,0);c.lineTo(w*.3,60);c.stroke();c.beginPath();c.arc(0,0,6,0,PI2);c.fill();c.globalAlpha*=p;rr(-w/2,60,w,h,14);c.fillStyle=C2;c.fill();c.stroke();break}
  case"stamp":{c.translate(cx,cy);c.rotate(-.08);c.scale(1+(1-p)*1.2,1+(1-p)*1.2);c.globalAlpha*=p;rr(-w/2,-h/2,w,h,Math.min(w,h)*.18);c.stroke();rr(-w/2+lw*2,-h/2+lw*2,w-lw*4,h-lw*4,Math.min(w,h)*.14);c.lineWidth=lw*.4;c.stroke();break}
  case"ribbon":{const e=h*.6;c.fillStyle=C2;c.save();c.filter="brightness(.7)";c.globalAlpha*=p;[[x-e*.8,1],[x+w+e*.8,-1]].forEach(([X,d])=>{c.beginPath();c.moveTo(X,y+h*.3);c.lineTo(X+d*e*1.1,y+h*.3);c.lineTo(X+d*e*1.1,y+h*1.3);c.lineTo(X,y+h*1.3);c.lineTo(X+d*e*.4,y+h*.8);c.closePath();c.fill()});c.restore();c.beginPath();c.rect(cx-w/2*p,y,w*p,h);c.fill();break}
  case"cutband":{const sk=h*.4;c.fillStyle=C2;c.beginPath();c.moveTo(x-sk,y+h);c.lineTo(x,y);c.lineTo(x+(w+sk)*p,y);c.lineTo(x+(w+sk)*p-sk,y+h);c.closePath();c.fill();break}
  case"accent":{c.fillStyle=C2;c.fillRect(x,cy+h*.05,w*p,h*.35);break}
  case"softbox":{c.globalAlpha*=p*.85;c.filter=`blur(${pd*.5}px)`;c.fillStyle=C2;c.fillRect(x+pd*.3,y+pd*.3,w-pd*.6,h-pd*.6);break}
  case"bubble":case"rbubble":{c.globalAlpha*=clamp(p*2);const z=.6+.4*ease.el(p);c.translate(cx,cy);c.scale(z,z);c.translate(-cx,-cy);c.fillStyle=C2;const tx=cx-w*.15,ty=k==="bubble"?cy+h*.62:y+h;c.beginPath();c.moveTo(tx-22,ty-h*.1);c.lineTo(tx-50,ty+h*.35);c.lineTo(tx+25,ty-h*.1);c.closePath();c.fill();c.stroke();c.beginPath();if(k==="bubble")c.ellipse(cx,cy,w*.62,h*.72,0,0,PI2);else c.roundRect(x,y,w,h,Math.min(w,h)*.3);c.fill();c.stroke();c.beginPath();c.moveTo(tx-22,ty-h*.1);c.lineTo(tx-34,ty+h*.12);c.lineTo(tx+25,ty-h*.1);c.fill();break}
  case"ring":c.beginPath();c.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+PI2*p*.86);c.stroke();c.beginPath();c.arc(cx,cy,R+lw*3,Math.PI/2,Math.PI/2+PI2*p*.3);c.stroke();break;
  case"diamond":c.beginPath();c.moveTo(cx,cy-R*1.1);c.lineTo(cx+R*1.1,cy);c.lineTo(cx,cy+R*1.1);c.lineTo(cx-R*1.1,cy);c.closePath();dash(R*6.3);c.stroke();break;
  case"dotoval":c.setLineDash([0.1,lw*3.2]);c.beginPath();c.ellipse(cx,cy,w*.6,h*.62,0,-Math.PI/2,-Math.PI/2+PI2*p);c.stroke();break;
  case"hearts":around(14,()=>heart(16+lw*2));break;
  case"wreath":around(18,i=>{c.fillStyle=i%3?C1:C2;if(i%3){c.beginPath();c.ellipse(0,0,8+lw*2,4+lw,.6,0,PI2);c.fill()}else{for(let j=0;j<5;j++){c.beginPath();c.arc(Math.cos(j/5*PI2)*7,Math.sin(j/5*PI2)*7,6,0,PI2);c.fill()}}});break;
  case"stars":{const pts=[[-1,-.8],[-.55,-1.05],[-.1,-.75],[.45,-1],[1,-.7],[.85,.9],[.3,1.05],[-.4,.8],[-1,1]].map(([u,v])=>[cx+u*w*.55,cy+v*h*.6]);c.lineWidth=Math.max(1,lw*.4);c.beginPath();const m=(pts.length-1)*p;pts.forEach((q,i)=>{if(i<=m)c[i?"lineTo":"moveTo"](q[0],q[1])});c.stroke();pts.forEach((q,i)=>{if(i<=m){c.save();c.translate(q[0],q[1]);star(6+lw);c.restore()}});break}
  case"moon":{c.globalAlpha*=p;c.beginPath();c.arc(cx,cy,R,0,PI2);c.stroke();c.fillStyle=C2;c.beginPath();c.arc(cx+R*.62,cy-R*.62,R*.28,-Math.PI*.15,Math.PI*1.15);c.arc(cx+R*.7,cy-R*.72,R*.22,Math.PI*1.1,-Math.PI*.1,true);c.fill();break}
  case"sun":{const n=24;for(let i=0;i<n;i++){const an=i/n*PI2,q=clamp(p*1.4-i/n*.4);if(q<=0)continue;const r1=R*.92,r2=R*(i%2?1.08:1.2);c.beginPath();c.moveTo(cx+Math.cos(an)*r1,cy+Math.sin(an)*r1);c.lineTo(cx+Math.cos(an)*(r1+(r2-r1)*q),cy+Math.sin(an)*(r1+(r2-r1)*q));c.stroke()}c.beginPath();c.arc(cx,cy,R*.82,0,PI2*p);c.stroke();break}
  case"snow":{const fl=[[-1.1,-.9,1],[1.15,-.6,.7],[-.9,.95,.6],[1,.85,.9],[0,-1.25,.5],[-1.4,.1,.5],[1.45,.1,.55]];fl.forEach(([u,v,z],i)=>{const q=clamp(p*fl.length-i);if(q<=0)return;c.save();c.translate(cx+u*w*.5,cy+v*h*.55+Math.sin(t*1.5+i)*6);c.rotate(t*.3+i);c.globalAlpha*=q;const r=(14+lw*3)*z;c.lineWidth=Math.max(1.5,lw*.6);for(let j=0;j<6;j++){c.rotate(Math.PI/3);c.beginPath();c.moveTo(0,0);c.lineTo(r,0);c.moveTo(r*.6,0);c.lineTo(r*.8,r*.18);c.moveTo(r*.6,0);c.lineTo(r*.8,-r*.18);c.stroke()}c.restore()});break}
  case"bubbles":{for(let i=0;i<14;i++){const u=((i*.618)%1)*2-1,sp=.15+((i*.37)%1)*.25,v=1.2-((t*sp+i*.13)%1)*2.6,z=6+((i*.71)%1)*14+lw;c.save();c.globalAlpha*=p*clamp(1.3-Math.abs(v));c.lineWidth=Math.max(1.2,lw*.5);c.beginPath();c.arc(cx+u*w*.6,cy+v*h*.6,z,0,PI2);c.stroke();c.beginPath();c.arc(cx+u*w*.6-z*.35,cy+v*h*.6-z*.35,z*.2,0,PI2);c.fill();c.restore()}break}
  case"notes":{c.lineWidth=Math.max(1,lw*.35);for(let j=0;j<5;j++){const Y=y+h+12+j*9;line(x-40,Y,x+w+40,Y)}c.font=`${36+lw*3}px serif`;c.textAlign="center";["♪","♫","♩","♬"].forEach((n,i)=>{const q=clamp(p*4-i);if(q<=0)return;c.save();c.globalAlpha*=q;c.fillText(n,x+(i+.5)*w/4,y+h+30-i%2*14+Math.sin(t*3+i)*4);c.restore()});break}
  case"feather":{c.lineWidth=Math.max(1.5,lw*.6);c.beginPath();c.moveTo(x-60,y+h+10);c.bezierCurveTo(x+w*.3,y+h+40,x+w*.7,y-20,x+w+60,y-10);dash(w*1.8+300);c.stroke();c.setLineDash([]);c.globalAlpha*=clamp(p*2-1);c.translate(x+w+60,y-10);c.rotate(-.5);c.beginPath();c.ellipse(0,0,30,9,0,0,PI2);c.stroke();c.beginPath();c.moveTo(-36,0);c.lineTo(32,0);c.stroke();break}
  case"cinema":{const bh=H()*.12*p;c.fillStyle=C2;c.fillRect(0,0,W(),bh);c.fillRect(0,H()-bh,W(),bh);break}
 }
 c.restore()}

/* ---- ここから 総合工房 むけ ---- */
/* 🎬 動画の テロップと 同じ「まとめて 出る」出かたを いちばん 先に */
const MODES2 = Object.assign({
  ugoku: { name: 'うごく テロップ', groups: { '出かた': MATOME.filter(m => m[0] !== 'none').map(([k, n]) =>
    [n, Object.assign({}, MATOME_LOOK, { main: n, wholeFx: k }, k === 'shake' ? { hold: 2.4 } : {})]) } }
}, MODES);
export { FONTS, INFX, IDLEFX, OUTFX, KZ, DEF, MODES2 as MODES };
const WK = new Set(["fps","loopMode","loopN","colors","fname","trim","stillFirst","canvasSize"]);
/** テンプレの 中身（DEF に かさねた もの。書き出し用の 項目は のぞく） */
export function tplState(over){
  const o = Object.assign(M(DEF), over || {});
  WK.forEach(k => delete o[k]);
  return o;
}
export function telopDur(st){ const k = S; S = Object.assign(M(DEF), st); const d = totalDur(); S = k; return d; }

export function newTelopLayer(project, over){
  const l = newLayer('テロップ', []);
  l.kind = 'telop';
  l.telop = tplState(over);
  l.name = (l.telop.main || 'テロップ').split(String.fromCharCode(10))[0].slice(0, 12);
  l.pw = project.w; l.ph = project.h;
  l.x = project.w / 2; l.y = project.h / 2;
  return l;
}

export function telopCanvas(l, time, project){
  loadFonts();
  const w = Math.max(1, project.w), h = Math.max(1, project.h);
  if(!l._tlC || l._tlC.width !== w || l._tlC.height !== h){
    l._tlC = document.createElement('canvas');
    l._tlC.width = w; l._tlC.height = h;
    l._tlC.complete = true; l._tlC.naturalWidth = w; l._tlC.naturalHeight = h;
  }
  l.pw = w; l.ph = h;
  const prev = S;
  S = Object.assign(M(DEF), l.telop, { canvasSize: w + 'x' + h });
  try{
    const key = JSON.stringify(S) + '|' + document.fonts.size + '|' + document.fonts.status;
    if(l._tlKey !== key){ l._tlL = layout(); l._tlKey = key; }
    const s = l.span;
    const tl = Math.max(0, time - (s && s.from > 0 ? s.from : 0));
    const wf = S.wholeFx;
    if(wf && wf !== 'none'){
      /* まとめて 出る … ふつうに 描いて から、まるごと 動かす */
      if(!l._tlT || l._tlT.width !== w || l._tlT.height !== h){ l._tlT = document.createElement('canvas'); l._tlT.width = w; l._tlT.height = h; }
      const d = S.inDur;
      S = Object.assign({}, S, { inFx: 'none' });
      drawFrame(tl, l._tlT.getContext('2d'), l._tlL);
      const g = l._tlC.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      drawMatome(g, l._tlT, wf, tl, d, l._tlL && l._tlL.box, w, h);
    } else drawFrame(tl, l._tlC.getContext('2d'), l._tlL);
  } finally { S = prev; }
  return l._tlC;
}
