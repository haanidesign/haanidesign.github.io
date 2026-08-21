# Notion 連携のしかた

Notion に書いたタスクを、このカレンダーに取り込むための設定です。
設定しなくてもツール自体は普通に使えます（その場合は取り込みボタンが「まだ用意されていません」と言うだけ）。

## なぜこの作り方なのか

ブラウザから Notion API は**直接呼べません**。Notion 側が CORS を許可しておらず、
`Access-Control-Allow-Origin` が返らないため必ず弾かれます（実測済み）。

仮に呼べたとしても、公開ページの JavaScript にトークンを書くことになり、
**誰でもあなたの Notion を読み書きできる状態**になります。

そのため取得は GitHub Actions（サーバー側）で行い、
結果を `data/notion.json` として置き、ページはその JSON を読むだけにしています。
トークンは GitHub の Secrets に入り、サイト側には一切出ません。

```
Notion ──(GitHub Actions が30分おきに取得)──▶ data/notion.json ──▶ このページ
```

向きは Notion → サイトの一方通行です。
こちらで完了にしても Notion には返りません（返すには常時起きているサーバーが要ります）。

## 設定（3ステップ）

### 1. インテグレーションを作ってトークンを取る

1. https://www.notion.so/my-integrations で「New integration」
2. 種類は Internal、ワークスペースは自分のものを選ぶ
3. 出てきた **Internal Integration Secret** を控える（`ntn_` か `secret_` で始まる文字列）

### 2. データベースをインテグレーションに共有する

取り込みたいデータベースを開き、右上の「…」→「接続」→ 作ったインテグレーションを選ぶ。
**これを忘れると 404 になります。**

データベースのIDは、そのURLの中の32桁です。

```
https://www.notion.so/<ここがDB_ID>?v=...
```

### 3. GitHub に Secrets を登録する

リポジトリの Settings → Secrets and variables → Actions → New repository secret

| 名前 | 中身 |
|---|---|
| `NOTION_TOKEN` | 手順1のシークレット |
| `NOTION_DATABASE_ID` | 手順2のID |

登録したら Actions タブ →「Notion sync」→「Run workflow」で手動実行して確認できます。
以降は30分おきに自動で回ります。

## Notion 側のプロパティ

名前は決め打ちにしていません。**候補名 → 型** の順で探すので、
だいたいのデータベースはそのまま繋がります。

| 使うもの | 探す名前 | 見つからなければ |
|---|---|---|
| タイトル | 名前 / タイトル / タスク / title / name | title 型の最初のもの |
| 日付 | 日付 / 予定日 / 期限 / date / due | date 型の最初のもの |
| カテゴリー | カテゴリー / カテゴリ / category / タグ / tag | select・multi_select の最初のもの |
| 完了 | ステータス / 状態 / status / 完了 / done | status・checkbox・select の最初のもの |

- 日付に時刻が入っていても、**日付だけ**使います（カレンダーが日単位のため）
- 完了とみなす語は 完了 / 済 / 済み / 終了 / done / complete / completed
- タイトルが空の行は取り込みません

## 取り込みの決まりごと

- Notion 由来のタスクには `N` のバッジが付き、押すと Notion のページが開きます
- **Notion 側で消したものは、こちらからも消えます**。手で足したタスクは残ります
- Notion 由来のタスクをこちらで書き換えても、次の取り込みで上書きされます。
  直したいものは Notion 側で直してください
- カテゴリーは名前で突き合わせます。同じ名前が無ければ新しく作られます

## 動作確認のしかた（開発用）

`NOTION_API_BASE` を差し替えるとモックに向けられます。

```bash
NOTION_TOKEN=dummy NOTION_DATABASE_ID=testdb \
NOTION_API_BASE=http://127.0.0.1:4321 \
node .github/scripts/fetch-notion.mjs
```
