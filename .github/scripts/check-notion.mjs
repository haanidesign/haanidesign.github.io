/**
 * Notion の設定ができているか確かめる道具。
 * 何も書き換えないので、何回実行しても安全。
 *
 *   NOTION_TOKEN=ntn_xxxx node .github/scripts/check-notion.mjs
 *   NOTION_TOKEN=ntn_xxxx NOTION_DATABASE_ID=xxxx node .github/scripts/check-notion.mjs
 *
 * 見えるデータベースが 0 件なら、「接続」がまだ済んでいません。
 */

import { loadEnv } from "./load-env.mjs";

// 手元で動かすときは .notion.env からも読む（Actions では環境変数が入っている）
loadEnv();

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;
const API_BASE = process.env.NOTION_API_BASE ?? "https://api.notion.com";
const API_VERSION = process.env.NOTION_VERSION ?? "2022-06-28";

if (!TOKEN) {
  console.error("✗ NOTION_TOKEN が見つかりません。");
  console.error("  → リポジトリ直下に .notion.env を作り、次の1行を書いてください。");
  console.error("     NOTION_TOKEN=ntn_xxxxxxxx");
  // ここで止める。続けても「Bearer undefined」で問い合わせるだけになる。
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Notion-Version": API_VERSION,
  "Content-Type": "application/json",
};

const titleOf = (db) =>
  (db.title ?? []).map((t) => t.plain_text ?? "").join("") || "(名前なし)";

async function main() {
  // --- 1. トークンが通るか -------------------------------------------------
  const me = await fetch(`${API_BASE}/v1/users/me`, { headers });
  if (!me.ok) {
    console.error(`\n✗ トークンが通りませんでした (${me.status})`);
    console.error("  → my-integrations で作った Internal Integration Secret を");
    console.error("     そのまま貼れているか確認してください。");
    process.exitCode = 1;
    return;
  }
  const bot = await me.json();
  console.log(`✓ トークンOK: ${bot.name ?? bot.bot?.owner?.type ?? "インテグレーション"}`);

  // --- 2. どのデータベースが見えているか -----------------------------------
  const search = await fetch(`${API_BASE}/v1/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filter: { property: "object", value: "database" }, page_size: 50 }),
  });
  const found = search.ok ? ((await search.json()).results ?? []) : [];

  if (found.length === 0) {
    console.error("\n✗ このインテグレーションから見えるデータベースが 0 件です。");
    console.error("  → まだ「接続」が済んでいません。");
    console.error("     データベースを開く → 右上の ••• → 「接続」→ 作ったインテグレーションを選ぶ");
    console.error("     （または my-integrations → そのインテグレーション → アクセス → ページを選択）");
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ 見えているデータベース ${found.length}件:`);
  for (const db of found) {
    console.log(`   - ${titleOf(db)}`);
    console.log(`     ID: ${db.id.replace(/-/g, "")}`);
  }

  if (!DB_ID) {
    console.log("\n上の ID を NOTION_DATABASE_ID に設定してください。");
    return;
  }

  // --- 3. 指定したIDが実際に読めるか ---------------------------------------
  const res = await fetch(`${API_BASE}/v1/databases/${DB_ID}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    console.error(`\n✗ NOTION_DATABASE_ID が読めません (${res.status})`);
    if (res.status === 404) {
      console.error("  → IDが違うか、そのデータベースだけ「接続」されていません。");
      console.error("     上に出ている ID をそのまま使ってください。");
    }
    console.error(`  ${text.slice(0, 200)}`);
    process.exitCode = 1;
    return;
  }

  const db = await res.json();
  console.log(`\n✓ 読めました: ${titleOf(db)}`);
  console.log("  プロパティ:");
  for (const [name, prop] of Object.entries(db.properties ?? {})) {
    console.log(`   - ${name} (${prop.type})`);
  }
  console.log("\n  取り込みに使われるのは title / date / select・multi_select / status・checkbox です。");
  console.log("  日付のプロパティが無いと、カレンダーには並ばず「日付が決まっていないタスク」に入ります。");
}

await main();
