/**
 * リポジトリ直下の .notion.env から環境変数を読む。
 * （すでに環境変数が入っているものは上書きしない）
 *
 * トークンをコマンドに毎回書くと、シェルの履歴に残ってしまう。
 * このファイルは .gitignore してあるので、コミットされることもない。
 *
 * .notion.env の書き方:
 *   NOTION_TOKEN=ntn_xxxxxxxx
 *   NOTION_DATABASE_ID=xxxxxxxxxxxx
 */
import fs from "node:fs";

export function loadEnv(file = ".notion.env") {
  if (!fs.existsSync(file)) return false;

  // メモ帳などで保存すると先頭に BOM が付くことがある。
  // 残したままだと最初のキー名が "﻿NOTION_TOKEN" になり、読めているのに
  // 読めていない、という分かりにくい失敗になる。
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    // 値を引用符で囲んでいても、囲んでいなくても読めるようにする
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
  return true;
}
