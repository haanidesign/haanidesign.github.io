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
const OUT = path.join("lab", "tools", "task-calendar", "data", "notion.json");
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
      throw new Error(`Notion API ${res.status}: ${text.slice(0, 400)}`);
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
function pick(props, names, types) {
  for (const name of names) {
    const hit = Object.entries(props).find(
      ([key, value]) =>
        key.toLowerCase() === name.toLowerCase() && types.includes(value.type),
    );
    if (hit) return hit[1];
  }
  return Object.values(props).find((p) => types.includes(p.type)) ?? null;
}

const DONE_WORDS = ["完了", "done", "済", "済み", "complete", "completed", "終了"];

function mapPage(page) {
  const props = page.properties ?? {};

  const titleProp = pick(props, ["名前", "タイトル", "タスク", "title", "name"], ["title"]);
  const title = (titleProp?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
  if (!title) return null; // 空行は取り込まない

  const dateProp = pick(props, ["日付", "予定日", "期限", "date", "due"], ["date"]);
  // カレンダーは日付単位なので、時刻がついていても日付だけ使う
  const date = dateProp?.date?.start ? String(dateProp.date.start).slice(0, 10) : null;

  const catProp = pick(
    props,
    ["カテゴリー", "カテゴリ", "category", "タグ", "tag"],
    ["select", "multi_select"],
  );
  const category = catProp?.select?.name ?? catProp?.multi_select?.[0]?.name ?? null;

  const statusProp = pick(
    props,
    ["ステータス", "状態", "status", "完了", "done"],
    ["status", "checkbox", "select"],
  );
  let done = false;
  if (statusProp) {
    if (statusProp.type === "checkbox") {
      done = statusProp.checkbox === true;
    } else {
      const name = (statusProp.status?.name ?? statusProp.select?.name ?? "").toLowerCase();
      done = DONE_WORDS.some((w) => name === w.toLowerCase());
    }
  }

  return { id: page.id, title, date, category, done, url: page.url ?? null };
}

const pages = await queryAll();
const tasks = pages.map(mapPage).filter(Boolean);

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
if (previousBody === body) {
  console.log(`変更なし (${tasks.length}件)`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify({ syncedAt: new Date().toISOString(), tasks }, null, 2) + "\n",
  );
  console.log(`書き出しました: ${OUT} (${tasks.length}件)`);
}
