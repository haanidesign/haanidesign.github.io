/* 🦴 骨の 型（ミニSpine の「タップで 骨組み」から）。

   どこを どの 順に おすか を 決めて おいて、パペットピンを 打つ ときに
   「つぎは ひじ」と 出す。1つめは 付け根なので とめるピン、
   ひじ・ひざ は カクッと 折れる ピンに する。
   open … 数は 好きな だけ（完了で おわる）
   sway … 打ち おわったら ゆれを つける（髪・しっぽ） */
export const BONE_KATA = [
  { id:'face', icon:'🙂', name:'顔と 首が 1まい', steps:[['首の 付け根','fix'], ['あご'], ['頭の てっぺん']] },
  { id:'arm',  icon:'💪', name:'腕（肩から 手まで）', steps:[['肩','fix'], ['ひじ','joint'], ['手首'], ['指先']] },
  { id:'arm2', icon:'🤚', name:'腕（ひじから 先）', steps:[['ひじ','fix'], ['手首'], ['指先']] },
  { id:'leg',  icon:'🦵', name:'脚', steps:[['付け根','fix'], ['ひざ','joint'], ['足首'], ['つま先']] },
  { id:'body', icon:'🧍', name:'体（腰から 頭）', steps:[['腰','fix'], ['むね'], ['首'], ['頭の てっぺん']] },
  { id:'swing', icon:'💇', name:'髪・しっぽ・リボン（ゆれる）', open:true, sway:true, steps:[['付け根','fix']], more:'つぎの 節' },
  { id:'free', icon:'✏', name:'自由（好きな 数）', open:true, steps:[['はじまり','fix']], more:'つぎの 点' }
];

/** いまの 段の 名前と 種類 */
export function kataStep(g){
  const st = g.kata.steps[g.i];
  if(st) return { name: st[0], fix: st[1] === 'fix', joint: st[1] === 'joint' };
  return { name: g.kata.more || 'つぎ', fix: false, joint: false };
}
export const kataDone = (g) => !g.kata.open && g.i >= g.kata.steps.length;
