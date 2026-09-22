/**
 * Notion のデータベースを読んで、静的サイトが読める JSON に書き出す。
 *
 * ブラウザから Notion API は直接呼べない（CORS で弾かれる）うえ、
 * 公開ページの JS にトークンを置くと誰でも読み書きできてしまう。
 * そのため取得はここ（GitHub Actions）で行い、トークンは Secrets に置く。
 *
 * 必要な環境変数:
 *   NOTION_TOKEN        … インテグレーションのシークレット
 *   NOTION_DATABASE_ID  … 取り込むデータベースのID
 */

import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./load-env.mjs";

// 手元で動かすときは .notion.env からも読む（Actions では環境変数が入っている）
loadEnv();

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;
// 同じ中身を2か所に置く。
//   1) ラボの道具用
//   2) サイト本体の公開カレンダー用（/schedule.html が読む）
// ラボ側を動かしても本体が壊れないよう、参照を分けておく。
const OUTS = [
  path.join("lab", "tools", "task-calendar", "data", "notion.json"),
  path.join("data", "schedule.json"),
];
const OUT = OUTS[0];
// 画像の置き場。サイト本体からも ラボからも ここを見る。
const IMG_DIR = path.join("images", "schedule");
const API_VERSION = process.env.NOTION_VERSION ?? "2022-06-28";
// テスト時にモックへ向けるための逃げ道。通常は設定しない。
const API_BASE = process.env.NOTION_API_BASE ?? "https://api.notion.com";

if (!TOKEN || !DB_ID) {
  console.error("NOTION_TOKEN と NOTION_DATABASE_ID を設定してください。");
  process.exit(1);
}

async function queryAll() {
  const results = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${API_BASE}/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      // 生のスタックトレースだけだと原因に辿り着けないので、
      // Notion の返答と「次にどこを直すか」を並べて出す。
      console.error("");
      console.error(`✗ Notion が ${res.status} を返しました`);
      console.error(`  返答: ${text.slice(0, 300)}`);
      console.error("");
      if (res.status === 401) {
        console.error("  原因: トークンが有効ではありません。");
        console.error("  → Secrets の NOTION_TOKEN を登録し直してください。");
        console.error("     my-integrations → haani → 設定 → アクセストークンの");
        console.error("     コピーボタン（⧉）で取得した値をそのまま貼ること。");
        console.error("     手で選択すると数文字ずれます（正しい長さは50文字）。");
      } else if (res.status === 404) {
        console.error("  原因: そのIDのデータベースに手が届いていません。");
        console.error("  → IDが違うか、Notion 側の「接続」がされていません。");
        console.error(`     いま使っているID: ${DB_ID}`);
      } else if (res.status === 400) {
        console.error("  原因: リクエストが受け付けられませんでした。");
        console.error(`     IDの形を確認してください（32桁）: ${DB_ID} (${DB_ID.length}桁)`);
      }
      console.error("");
      process.exitCode = 1;
      throw new Error(`Notion API ${res.status}`);
    }
    const data = JSON.parse(text);
    results.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}

/**
 * プロパティ名は人によって違うので、
 * 「名前の候補」→「型で最初に見つかったもの」の順に探す。
 * これで Notion 側のデータベースを作り替えなくても大抵そのまま繋がる。
 */
function pickByName(props, names, types) {
  for (const name of names) {
    const hit = Object.entries(props).find(
      ([key, value]) =>
        key.toLowerCase() === name.toLowerCase() && types.includes(value.type),
    );
    if (hit) return hit[1];
  }
  return null;
}

function pick(props, names, types) {
  return (
    pickByName(props, names, types) ??
    Object.values(props).find((p) => types.includes(p.type)) ??
    null
  );
}

/**
 * 「公開サイトに載せない」印が付いている行かどうか。
 *
 * 書き出した JSON は公開リポジトリに入るので、ここを取りこぼすと
 * 見せないつもりの予定がそのまま外に出る。
 */
function isPrivate(props) {
  const words = ["非公開", "ひみつ", "秘密", "内緒", "下書き", "private", "hidden", "draft"];
  for (const [key, value] of Object.entries(props)) {
    if (value.type !== "checkbox") continue;
    const k = key.toLowerCase();
    if (words.some((w) => k.includes(w.toLowerCase()))) return value.checkbox === true;
  }
  return false;
}

/**
 * その行の画像を1枚だけ選ぶ。
 * 「画像」系のファイルプロパティ → 無ければページのカバー、の順。
 */
function pickImageUrl(page, props) {
  const fileProp = pickByName(
    props,
    ["画像", "サムネ", "サムネイル", "写真", "image", "thumbnail", "cover"],
    ["files"],
  );
  const f = fileProp?.files?.[0];
  const fromProp = f?.file?.url ?? f?.external?.url ?? null;
  if (fromProp) return fromProp;
  const cover = page.cover;
  return cover?.file?.url ?? cover?.external?.url ?? null;
}

const EXT_BY_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/**
 * 画像を落としてリポジトリに置き、サイトから見えるパスを返す。
 *
 * Notion が返すURLは しばらくすると切れるので、そのまま貼れない。
 * ここで一度落として、リポジトリの中に置いてしまう。
 * 中身が変わっていなければ落とし直さない（毎朝コミットが積み上がらないように）。
 */
async function fetchImage(task, before) {
  if (!task.imageUrl) return null;
  const id = task.id.replace(/-/g, "");
  const old = before.get(task.id);
  // 前と同じ行で、前に落とした画像がまだ手元にあるなら そのまま使う
  if (old?.image && old.edited && old.edited === task.edited && fs.existsSync(old.image)) {
    return old.image;
  }
  try {
    const res = await fetch(task.imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext =
      EXT_BY_TYPE[type] ??
      (task.imageUrl.match(/\.(jpe?g|png|gif|webp)(?:\?|$)/i)?.[1] ?? "").toLowerCase().replace(/^jpeg$/, "jpg");
    if (!ext) throw new Error(`画像ではありません (${type || "型なし"})`);
    const buf = Buffer.from(await res.arrayBuffer());
    // 置き場をふさがないよう、大きすぎるものは載せない
    if (buf.length > 4 * 1024 * 1024) throw new Error(`大きすぎます (${Math.round(buf.length / 1e6)}MB)`);
    fs.mkdirSync(IMG_DIR, { recursive: true });
    const out = path.join(IMG_DIR, id + (ext.startsWith(".") ? ext : "." + ext));
    // 前に別の形式で落としていたら消しておく
    for (const e of Object.values(EXT_BY_TYPE)) {
      const other = path.join(IMG_DIR, id + e);
      if (other !== out && fs.existsSync(other)) fs.rmSync(other);
    }
    fs.writeFileSync(out, buf);
    return out.split(path.sep).join("/");
  } catch (e) {
    console.error(`  画像を落とせませんでした（${task.title}）: ${e.message}`);
    return old?.image && fs.existsSync(old.image) ? old.image : null;
  }
}

const DONE_WORDS = ["完了", "done", "済", "済み", "complete", "completed", "終了"];

function mapPage(page) {
  const props = page.properties ?? {};

  // 非公開の印が付いていれば、ここで落とす（公開ファイルには一切書かない）
  if (isPrivate(props)) return null;

  const titleProp = pick(props, ["名前", "タイトル", "タスク", "予定名", "title", "name"], ["title"]);
  const title = (titleProp?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
  if (!title) return null; // 空行は取り込まない

  const dateProp = pick(props, ["日付", "予定日", "期限", "date", "due"], ["date"]);
  const start = dateProp?.date?.start ? String(dateProp.date.start) : null;
  const date = start ? start.slice(0, 10) : null;
  // 時刻が入っているときだけ拾う（日付だけの予定は時刻なしのまま）
  const time = start && start.length > 10 ? start.slice(11, 16) : null;

  const catProp = pick(
    props,
    ["カテゴリー", "カテゴリ", "category", "タグ", "tag"],
    ["select", "multi_select"],
  );
  const category = catProp?.select?.name ?? catProp?.multi_select?.[0]?.name ?? null;

  // 完了の判定は型での当て推量をしない。
  // 名前が一致しないときに select や checkbox を拾うと、
  // 「カテゴリ」や無関係なチェックを完了状態として誤読してしまう。
  // 名前一致 → 無ければ status 型（Notion 専用の型なので誤爆しない）だけを見る。
  const statusProp =
    pickByName(
      props,
      ["ステータス", "状態", "status", "完了", "done", "済"],
      ["status", "checkbox", "select"],
    ) ??
    Object.values(props).find((p) => p.type === "status") ??
    null;
  let done = false;
  if (statusProp) {
    if (statusProp.type === "checkbox") {
      done = statusProp.checkbox === true;
    } else {
      const name = (statusProp.status?.name ?? statusProp.select?.name ?? "").toLowerCase();
      done = DONE_WORDS.some((w) => name === w.toLowerCase());
    }
  }

  return {
    id: page.id,
    title,
    date,
    time,
    category,
    done,
    url: page.url ?? null,
    edited: page.last_edited_time ?? null,
    imageUrl: pickImageUrl(page, props),
  };
}

// 失敗したときにスタックトレースが後ろに続くと、上に出した説明が埋もれる。
// 説明はすでに出しているので、ここでは静かに終える。
let pages;
try {
  pages = await queryAll();
} catch (e) {
  if (!/^Notion API \d+$/.test(e.message)) console.error(e.message);
  process.exitCode = 1;
  pages = null;
}

let tasks = pages === null ? null : pages.map(mapPage).filter(Boolean);

if (tasks !== null) {
  // 前回の結果（画像を落とし直すか決めるのに使う）
  const before = new Map();
  if (fs.existsSync(OUT)) {
    try {
      for (const t of JSON.parse(fs.readFileSync(OUT, "utf8")).tasks ?? []) before.set(t.id, t);
    } catch {
      /* 壊れていたら ただ全部落とし直す */
    }
  }

  for (const t of tasks) {
    t.image = await fetchImage(t, before);
    delete t.imageUrl; // 切れるURLは公開ファイルに書かない
  }

  // もう使っていない画像を片付ける
  if (fs.existsSync(IMG_DIR)) {
    const keep = new Set(tasks.map((t) => t.image).filter(Boolean).map((p) => path.basename(p)));
    for (const name of fs.readdirSync(IMG_DIR)) {
      if (!keep.has(name)) fs.rmSync(path.join(IMG_DIR, name));
    }
  }
}

if (tasks !== null) {

  // syncedAt は毎回変わるので、中身が同じなら書き換えない。
  // 変わらないコミットが積み上がるのを防ぐため。
  const body = JSON.stringify(tasks);
  let previousBody = null;
  if (fs.existsSync(OUT)) {
    try {
      previousBody = JSON.stringify(JSON.parse(fs.readFileSync(OUT, "utf8")).tasks ?? []);
    } catch {
      previousBody = null;
    }
  }

  // process.exit() は使わない。
  // fetch の keep-alive ソケットが残ったまま強制終了すると、
  // 環境によっては終了コードが化けて、同期が失敗扱いになるため。
  // 片方だけ欠けている状態（新しい出力先を足した直後など）も書き直す
  const allPresent = OUTS.every((p) => fs.existsSync(p));

  if (previousBody === body && allPresent) {
    console.log(`変更なし (${tasks.length}件)`);
  } else {
    const json =
      JSON.stringify({ syncedAt: new Date().toISOString(), tasks }, null, 2) + "\n";
    for (const out of OUTS) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, json);
    }
    console.log(`書き出しました (${tasks.length}件): ${OUTS.join(" , ")}`);
  }
}
