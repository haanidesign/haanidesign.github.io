/* AI と つなぐ。
   手もとの AI（Ollama・LM Studio・llama.cpp など）が もつ
   「OpenAI と 同じ 形」の 入口（/v1/chat/completions）に 話しかける。

   ・入口と モデルは この 端末に だけ おぼえる（作品には 入れない）
   ・https の ページから http の AI には つながらない（ブラウザの きまり）。
     ランチャーなど http で ひらいた ときに つかう */
import { EXPR_NAMES, POSE_NAMES, SHOTS } from './parse.js?v=5';
import { HAIRS } from './figure.js?v=5';

const KEY = 'koma-wari:ai';
const defUrl = () => `http://${location.hostname || 'localhost'}:11434/v1`;
export function aiConf() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { }
  return { url: c.url || defUrl(), model: c.model || '', key: c.key || '' };
}
export function saveConf(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { } }

function base(u) {
  u = String(u || '').trim().replace(/\/+$/, '');
  u = u.replace(/\/chat\/completions$/, '').replace(/\/models$/, '');
  if (!/\/v\d+$/.test(u)) u += '/v1';
  return u;
}
const headers = c => Object.assign({ 'Content-Type': 'application/json' }, c.key ? { Authorization: 'Bearer ' + c.key } : {});
export const blocked = c => location.protocol === 'https:' && /^http:/.test(base(c.url));

export async function listModels(c) {
  const r = await fetch(base(c.url) + '/models', { headers: headers(c) });
  if (!r.ok) throw new Error('モデルの 一覧が 取れません（' + r.status + '）');
  const j = await r.json();
  return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
}

export async function chat(c, messages, signal) {
  if (blocked(c)) throw new Error('https の ページからは http の AI に つながりません。ランチャーから ひらいて ください');
  let model = c.model;
  if (!model) { const ms = await listModels(c); model = ms[0]; if (!model) throw new Error('モデルが ありません'); }
  const r = await fetch(base(c.url) + '/chat/completions', {
    method: 'POST', headers: headers(c), signal,
    body: JSON.stringify({ model, messages, temperature: .3, stream: false }),
  });
  if (!r.ok) {
    let t = ''; try { t = (await r.text()).slice(0, 160); } catch (e) { }
    throw new Error(`AI が こたえません（${r.status}）${t}`);
  }
  const j = await r.json();
  const m = j.choices && j.choices[0] && j.choices[0].message;
  return (m && (m.content || m.reasoning_content)) || '';
}

/* こたえの 中から JSON を ぬきだす（```json の かこみ・前後の 文・考えごと を ゆるす） */
export function pickJSON(t) {
  t = String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AI の こたえが 読めません');
  const s = t.slice(a, b + 1);
  try { return JSON.parse(s); }
  catch (e) { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); }
}

/* ---------- 台本を 表に する ---------- */
const FORMAT = `### 1ページ目（場面の名前）
| コマ | 大きさ | 絵 | セリフ・効果音 |
|---|---|---|---|
| ① | 大 | 絵の説明（だれが・どこで・どんな顔・どんなポーズ） | 名前：「セリフ」<br>効果音：\`ドン\` |`;

export async function toTable(c, text, signal) {
  const sys = 'あなたは マンガの 編集者です。あたえられた 台本や あらすじを、ネームの 表に 書きなおします。表だけを 返します。';
  const user = `次の 形で 書きなおして ください。

${FORMAT}

きまり
- ページごとに「### Nページ目（場面）」の 見出しと 表
- 見開きは「### 12〜13ページ目（見開き）」と 書き、大ゴマの 位置を「見開きの中央」、ほかは「右上の小ゴマ」「左下の小ゴマ」
- 大きさは 大・中・小・横長・ページの約3/4 の どれか。ページを めくらせる コマには「（引き）」
- 1ページは 3〜7コマ。大事な 場面ほど 大きく
- 絵の 列には 出る人の 名前・表情・ポーズ・うつり方（顔のアップ・全身 など）を 書く
- セリフは 名前：「…」。心の声は 名前（モノローグ）：「…」。音は 効果音：\`…\`。看板などは 看板：「…」。1行に 1つ、<br> で つなぐ
- 表 いがいの 説明は 書かない

台本:
${text}`;
  const out = await chat(c, [{ role: 'system', content: sys }, { role: 'user', content: user }], signal);
  return out.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^```\w*\n?|```$/gm, '').trim();
}

/* ---------- 演出（コマごとの 出る人・顔・ポーズ・うつり） ---------- */
const SHOT_IDS = SHOTS.map(s => s[0]);
const SHOT_HELP = 'face=顔アップ, bust=胸から上, waist=腰から上, full=全身, obj=モノの アップ（人を 描かない）, none=人なし（風景・文字だけ）';

function panelBrief(pg, p, i, cast) {
  return {
    n: i + 1,
    size: p.size,
    memo: p.memo || '',
    lines: p.lines.filter(l => l.text).map(l => `${l.who || '?'}(${l.kind}): ${l.text}`),
    now: { chars: p.figs.map(f => (cast.find(c => c.id === f.id) || {}).name).filter(Boolean), shot: p.shot },
  };
}

export async function direct(c, proj, targets, onStep, signal) {
  // targets: [{pg, idx:[コマ番号…]}]
  const names = proj.cast.map(x => x.name);
  const sys = 'あなたは マンガの ネーム（絵コンテ）担当です。かならず JSON だけを 返します。説明文は 書きません。';
  const res = [];
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k], pg = proj.pages[t.pg];
    onStep && onStep(k, targets.length, pg);
    const panels = t.idx.map(i => panelBrief(pg, pg.panels[i], i, proj.cast));
    const user = `${pg.no}ページ目${pg.title ? '（' + pg.title + '）' : ''}の コマを 演出して ください。

出る人の 名前: ${JSON.stringify(names)}
表情（expr）は この中から: ${JSON.stringify(EXPR_NAMES)}
ポーズ（pose）は この中から: ${JSON.stringify(POSE_NAMES)}
うつり（shot）は この中から: ${SHOT_IDS.join(', ')}（${SHOT_HELP}）

きまり
- chars は 絵に 見えて いる 人だけ（最大 3人）。日本の マンガなので 右から 左へ ならぶ。さきに 話す 人・主役を さきに
- 名前が 出て いても、回想・うわさ・声だけ の 人は 入れない。「撫でられる」「抱かれる」など される 側の ポーズに 気を つける
- 表情と ポーズは 絵の 説明と セリフから えらぶ。合う ものが なければ「ふつう」「立ち」
- flip は 向きを 左右 入れかえる とき true
- モノの アップは shot=obj に して obj に モノの 名前（8文字まで）

コマ:
${JSON.stringify(panels, null, 1)}

この 形で 返す:
{"panels":[{"n":1,"shot":"bust","obj":"","chars":[{"name":"${names[0] || 'A'}","expr":"ふつう","pose":"立ち","flip":false}]}]}`;
    const out = await chat(c, [{ role: 'system', content: sys }, { role: 'user', content: user }], signal);
    const j = pickJSON(out);
    res.push({ pg: t.pg, idx: t.idx, panels: Array.isArray(j.panels) ? j.panels : [] });
  }
  return res;
}

/* AI の こたえを 作品に あてはめる（ことばの ゆれを ここで ただす） */
export function applyDirect(proj, res) {
  let n = 0;
  for (const r of res) {
    const pg = proj.pages[r.pg];
    if (!pg) continue;
    for (const a of r.panels) {
      const i = (+a.n || 0) - 1;
      if (!r.idx.includes(i) || !pg.panels[i]) continue;
      const p = pg.panels[i];
      if (SHOT_IDS.includes(a.shot)) p.shot = a.shot;
      if (p.shot === 'obj') p.obj = String(a.obj || p.obj || '').slice(0, 8);
      if (Array.isArray(a.chars)) {
        const figs = [];
        for (const ch of a.chars.slice(0, 3)) {
          const c = proj.cast.find(x => x.name === ch.name) || proj.cast.find(x => ch.name && (String(ch.name).includes(x.name) || x.name.includes(ch.name)));
          if (!c || figs.some(f => f.id === c.id)) continue;
          figs.push({
            id: c.id,
            expr: EXPR_NAMES.includes(ch.expr) ? ch.expr : 'ふつう',
            pose: POSE_NAMES.includes(ch.pose) ? ch.pose : '立ち',
            flip: !!ch.flip,
          });
        }
        p.figs = figs;
        if (!figs.length && p.shot !== 'obj') p.shot = 'none';
        if (figs.length && p.shot === 'none') p.shot = 'bust';
      }
      n++;
    }
  }
  return n;
}

/* ---------- キャラの 見た目 ---------- */
export async function castLook(c, proj, signal) {
  const hairIds = HAIRS.map(h => h[0]);
  const memo = proj.pages.flatMap(pg => pg.panels.map(p => p.memo)).filter(Boolean).join('\n').slice(0, 6000);
  const user = `マンガの 台本の 絵の 説明です。出る人の 見た目を 決めて ください。

出る人: ${JSON.stringify(proj.cast.map(x => x.name))}
kind: human（人）か mascot（着ぐるみ・まるい生きもの）
hair: ${hairIds.join(', ')}（short=みじかい, curl=くせ毛, wolf=ウルフ, long=ロング, bang=ぱっつん, ahoge=アホ毛, spike=つんつん, odango=おだんご, band=ハチマキ, none=なし）
tone: black（黒髪）, gray（茶・灰）, white（金髪・白・明るい色）
h: 背の 高さ。ふつう 1.0、子ども 0.7、背が高い 1.06、着ぐるみ 1.1 くらい

絵の 説明:
${memo}

この 形で JSON だけを 返す:
{"cast":[{"name":"名前","kind":"human","hair":"short","tone":"black","h":1.0}]}`;
  const out = await chat(c, [{ role: 'system', content: 'かならず JSON だけを 返します。' }, { role: 'user', content: user }], signal);
  const j = pickJSON(out);
  return Array.isArray(j.cast) ? j.cast : [];
}
export function applyCast(proj, list) {
  const hairIds = HAIRS.map(h => h[0]);
  let n = 0;
  for (const a of list) {
    const c = proj.cast.find(x => x.name === a.name);
    if (!c) continue;
    if (a.kind === 'human' || a.kind === 'mascot') c.kind = a.kind;
    if (hairIds.includes(a.hair)) c.hair = a.hair;
    if (['black', 'gray', 'white'].includes(a.tone)) c.tone = a.tone;
    const h = +a.h;
    if (h >= .5 && h <= 1.3) c.h = h;
    n++;
  }
  return n;
}
